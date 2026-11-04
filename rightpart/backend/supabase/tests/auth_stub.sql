-- Local testing only: a minimal stand-in for Supabase's auth schema and roles,
-- so schema.sql and its row-level security can be tested on a plain PostgreSQL.
-- Never run this on a real Supabase project (it already has these).
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
grant usage on schema auth to authenticated, anon;
create table if not exists auth.users (id uuid primary key, email text);

create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.email() returns text language sql stable as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')
$$;
grant execute on function auth.uid(), auth.email() to authenticated, anon;

-- Act as a signed-in user for the rest of the session.
create or replace function public.test_sign_in(p_uid uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
  perform set_config('request.jwt.claim.email', p_email, false);
end $$;
