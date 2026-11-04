-- Row-level security tests for schema.sql. Run on a local PostgreSQL after auth_stub.sql and schema.sql:
--   psql -v ON_ERROR_STOP=1 -f auth_stub.sql -f ../schema.sql -f rls_test.sql
-- Every check raises an error when it fails; reaching the end prints "ALL RLS TESTS PASSED".
\set ON_ERROR_STOP on
set client_min_messages = warning;

create or replace function public.test_assert(p_ok boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_ok is not true then raise exception 'FAILED: %', p_msg; end if;
end $$;
create or replace function public.test_expect_error(p_sql text, p_msg text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception 'FAILED (no error): %', p_msg;
end $$;
grant execute on function public.test_assert(boolean, text), public.test_expect_error(text, text), public.test_sign_in(uuid, text) to authenticated, anon;

-- People
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'alice@acme.test'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@acme.test'),
  ('00000000-0000-0000-0000-00000000000c', 'carol@acme.test'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@beta.test'),
  ('00000000-0000-0000-0000-00000000000e', 'eve@acme.test'),
  ('00000000-0000-0000-0000-00000000000f', 'frank@acme.test')
on conflict do nothing;

-- Alice creates Acme, Dave creates Beta
set role authenticated;
select test_sign_in('00000000-0000-0000-0000-00000000000a', 'alice@acme.test');
select set_config('test.acme', (select id::text from create_organization('Acme Medical')), false);
select test_assert((select count(*) from organizations) = 1, 'Alice sees her company');
select test_assert(rp_role_of(current_setting('test.acme')::uuid) = 'owner', 'Alice is owner');
select invite_member(current_setting('test.acme')::uuid, 'Bob@Acme.test', 'operator');
select invite_member(current_setting('test.acme')::uuid, 'carol@acme.test', 'supervisor');
select invite_member(current_setting('test.acme')::uuid, 'eve@acme.test', 'engineer');
select invite_member(current_setting('test.acme')::uuid, 'frank@acme.test', 'operator');
select test_expect_error($$select invite_member(current_setting('test.acme')::uuid, 'x@acme.test', 'owner')$$, 'cannot invite an owner');

select test_sign_in('00000000-0000-0000-0000-00000000000d', 'dave@beta.test');
select set_config('test.beta', (select id::text from create_organization('Beta Devices')), false);
select test_assert((select count(*) from organizations) = 1, 'Dave sees only his company');
select test_assert((select count(*) from memberships) = 1, 'Dave sees only his membership');
select test_assert((select count(*) from invitations) = 0, 'Dave cannot see Acme invitations');
select test_expect_error($$select invite_member(current_setting('test.acme')::uuid, 'dave@beta.test', 'admin')$$, 'Dave cannot invite himself into Acme');

-- Invitees accept
select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
select test_assert(accept_invitations() = 1, 'Bob accepts (e-mail matched without case)');
select test_assert(accept_invitations() = 0, 'Accepting twice does nothing');
select test_sign_in('00000000-0000-0000-0000-00000000000c', 'carol@acme.test');
select test_assert(accept_invitations() = 1, 'Carol accepts');
select test_sign_in('00000000-0000-0000-0000-00000000000e', 'eve@acme.test');
select test_assert(accept_invitations() = 1, 'Eve accepts');
select test_sign_in('00000000-0000-0000-0000-00000000000f', 'frank@acme.test');
select test_assert(accept_invitations() = 1, 'Frank accepts');

-- Publishing the library
select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
select test_expect_error($$select publish_library(current_setting('test.acme')::uuid, '{"parts":[]}', 'try', null)$$, 'operators cannot publish');
select test_expect_error($$insert into library_versions (org_id, version, data) values (current_setting('test.acme')::uuid, 1, '{"parts":[]}')$$, 'no direct inserts into library versions');
select test_sign_in('00000000-0000-0000-0000-00000000000e', 'eve@acme.test');
select test_assert(publish_library(current_setting('test.acme')::uuid, '{"parts":[{"id":"100-0233"}],"devices":[]}', 'first', null) = 1, 'engineer publishes v1');
select test_expect_error($$select publish_library(current_setting('test.acme')::uuid, '{"devices":[]}', 'no parts', 1)$$, 'library without parts is refused');
select test_sign_in('00000000-0000-0000-0000-00000000000a', 'alice@acme.test');
select test_assert(publish_library(current_setting('test.acme')::uuid, '{"parts":[],"devices":[]}', 'second', 1) = 2, 'owner publishes v2 from v1');
select test_sign_in('00000000-0000-0000-0000-00000000000e', 'eve@acme.test');
select test_expect_error($$select publish_library(current_setting('test.acme')::uuid, '{"parts":[]}', 'stale', 1)$$, 'publishing from a stale version is refused');
select test_expect_error($$update library_versions set note = 'changed' where version = 1$$, 'versions cannot be edited');
select test_assert((select count(*) from library_versions where note = 'first') = 1, 'v1 note unchanged');
select test_expect_error($$delete from library_versions$$, 'versions cannot be deleted');
select test_assert((select count(*) from library_versions) = 2, 'both versions still there');

select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
select test_assert((select count(*) from library_versions) = 2, 'Bob reads both Acme versions');
select test_assert((select max(latest_version) from my_organizations()) = 2, 'my_organizations shows the latest version');
select test_sign_in('00000000-0000-0000-0000-00000000000d', 'dave@beta.test');
select test_assert((select count(*) from library_versions) = 0, 'Dave reads no Acme library');

-- Records: operators see their own, supervisors see all
select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
insert into records (org_id, id, type, data) values (current_setting('test.acme')::uuid, 'build-1', 'build', '{"serial":"NV1-1"}');
select test_expect_error($$insert into records (org_id, id, type, data, created_by) values (current_setting('test.acme')::uuid, 'build-x', 'build', '{}', '00000000-0000-0000-0000-00000000000a')$$, 'cannot write a record as someone else');
select test_expect_error($$insert into records (org_id, id, type, data) values (current_setting('test.beta')::uuid, 'build-y', 'build', '{}')$$, 'cannot write into another company');
update records set data = '{"serial":"NV1-1","done":true}' where id = 'build-1';
select test_assert((select data ->> 'done' from records where id = 'build-1') = 'true', 'Bob updates his own record');
select test_sign_in('00000000-0000-0000-0000-00000000000f', 'frank@acme.test');
select test_assert((select count(*) from records) = 0, 'Frank (operator) cannot see Bob''s record');
update records set data = '{"tampered":true}' where id = 'build-1';
select test_sign_in('00000000-0000-0000-0000-00000000000c', 'carol@acme.test');
select test_assert((select count(*) from records) = 1, 'Carol (supervisor) sees Bob''s record');
select test_assert((select data ->> 'tampered' from records where id = 'build-1') is null, 'Frank could not change Bob''s record');
update records set data = '{"by":"carol"}' where id = 'build-1';
select test_assert((select data ->> 'by' from records where id = 'build-1') is null, 'supervisors read but do not rewrite others'' records');
select test_sign_in('00000000-0000-0000-0000-00000000000d', 'dave@beta.test');
select test_assert((select count(*) from records) = 0, 'Dave sees no Acme records');

-- Activity log
select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
select test_assert((select count(*) from activity) = 0, 'operators do not read the activity log');
select test_expect_error($$insert into activity (org_id, action) values (current_setting('test.acme')::uuid, 'fake')$$, 'nobody writes the activity log by hand');
select test_sign_in('00000000-0000-0000-0000-00000000000c', 'carol@acme.test');
select test_assert((select count(*) from activity where action = 'library.published') = 2, 'supervisors read the activity log');

select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
select rp_log_question(current_setting('test.acme')::uuid, '{part:100-0233}', 30);
select test_sign_in('00000000-0000-0000-0000-00000000000d', 'dave@beta.test');
select rp_log_question(current_setting('test.acme')::uuid, '{x}', 5);
select test_sign_in('00000000-0000-0000-0000-00000000000c', 'carol@acme.test');
select test_assert((select count(*) from activity where action = 'ask.ai') = 1, 'questions are logged for members only');

-- Roles
select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
update memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000b';
select test_assert(rp_role_of(current_setting('test.acme')::uuid) = 'operator', 'Bob cannot promote himself');
select test_expect_error($$update memberships set org_id = current_setting('test.beta')::uuid where user_id = '00000000-0000-0000-0000-00000000000b'$$, 'memberships cannot be moved to another company');
select test_sign_in('00000000-0000-0000-0000-00000000000a', 'alice@acme.test');
update memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000c';
select test_sign_in('00000000-0000-0000-0000-00000000000c', 'carol@acme.test');
select test_assert(rp_role_of(current_setting('test.acme')::uuid) = 'admin', 'Alice made Carol admin');
select test_expect_error($$update memberships set role = 'owner' where user_id = '00000000-0000-0000-0000-00000000000c'$$, 'an admin cannot make herself owner');
select test_sign_in('00000000-0000-0000-0000-00000000000a', 'alice@acme.test');
select test_expect_error($$update memberships set role = 'admin' where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'the last owner cannot step down');
select test_expect_error($$delete from memberships where user_id = '00000000-0000-0000-0000-00000000000a'$$, 'the last owner cannot leave');
delete from memberships where user_id = '00000000-0000-0000-0000-00000000000f';
select test_sign_in('00000000-0000-0000-0000-00000000000f', 'frank@acme.test');
select test_assert((select count(*) from organizations) = 0, 'removed member no longer sees the company');
select test_assert((select count(*) from library_versions) = 0, 'removed member no longer reads the library');

-- Renaming
select test_sign_in('00000000-0000-0000-0000-00000000000b', 'bob@acme.test');
update organizations set name = 'Hacked' where id = current_setting('test.acme')::uuid;
select test_assert((select name from organizations) = 'Acme Medical', 'operators cannot rename the company');
select test_sign_in('00000000-0000-0000-0000-00000000000a', 'alice@acme.test');
update organizations set name = 'Acme Medical Ltd' where id = current_setting('test.acme')::uuid;
select test_assert((select name from organizations) = 'Acme Medical Ltd', 'owner renames the company');
reset role;

-- Not signed in at all
set role anon;
select test_expect_error($$select * from organizations$$, 'anonymous visitors read nothing');
select test_expect_error($$select create_organization('x')$$, 'anonymous visitors cannot create companies');
reset role;

select 'ALL RLS TESTS PASSED' as result;
