-- RightPart company server: schema, roles and row-level security for Supabase (PostgreSQL 15+).
-- Run once in the Supabase SQL editor of a new project (or with psql). See backend/README.md.
--
-- Model
--   organizations   one row per company
--   memberships     who belongs to which company, with a role
--   invitations     e-mail invitations, accepted by the invitee after signing in
--   library_versions the company's library (parts, codes, devices, BOMs, steps), append-only:
--                    every publish is a new numbered version, old versions are kept as history
--   records         build records and floor reports, uploaded from the tablets
--   activity        who did what, written by the server (not editable by users)
--
-- Security
--   Row-level security on every table: a user only ever sees rows of companies they belong to.
--   Operators see their own records; supervisors and above see everyone's (worker privacy).
--   Library versions cannot be changed or deleted once published (traceable history).
--   Writes that need several checks go through security-definer functions below.

create extension if not exists pgcrypto;

do $$ begin
  create type public.rp_role as enum ('owner', 'admin', 'engineer', 'supervisor', 'operator', 'viewer');
exception when duplicate_object then null; end $$;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null,
  role public.rp_role not null default 'operator',
  email text,
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  role public.rp_role not null default 'operator' check (role <> 'owner'),
  invited_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);

create table if not exists public.library_versions (
  org_id uuid not null references public.organizations (id) on delete cascade,
  version integer not null check (version > 0),
  data jsonb not null,
  note text,
  published_by uuid not null default auth.uid(),
  published_at timestamptz not null default now(),
  primary key (org_id, version)
);

create table if not exists public.records (
  org_id uuid not null references public.organizations (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 80),
  type text not null check (type in ('build', 'report')),
  data jsonb not null,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, id)
);

create table if not exists public.activity (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations (id) on delete cascade,
  actor uuid,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);

create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists records_org_created_idx on public.records (org_id, created_at desc);
create index if not exists activity_org_at_idx on public.activity (org_id, at desc);
create index if not exists invitations_email_idx on public.invitations (lower(email));

-- ---------- Helpers (security definer, so policies can check membership without recursion) ----------
create or replace function public.rp_role_of(p_org uuid) returns public.rp_role
language sql stable security definer set search_path = public as $$
  select role from public.memberships where org_id = p_org and user_id = auth.uid()
$$;

create or replace function public.rp_is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships where org_id = p_org and user_id = auth.uid())
$$;

create or replace function public.rp_has_role(p_org uuid, p_roles public.rp_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = any (p_roles) from public.memberships where org_id = p_org and user_id = auth.uid()), false)
$$;

create or replace function public.rp_log(p_org uuid, p_action text, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into public.activity (org_id, actor, action, detail) values (p_org, auth.uid(), p_action, p_detail)
$$;

-- ---------- Row-level security ----------
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.library_versions enable row level security;
alter table public.records enable row level security;
alter table public.activity enable row level security;

drop policy if exists org_read on public.organizations;
create policy org_read on public.organizations for select using (public.rp_is_member(id));
drop policy if exists org_rename on public.organizations;
create policy org_rename on public.organizations for update
  using (public.rp_has_role(id, '{owner,admin}')) with check (public.rp_has_role(id, '{owner,admin}'));

drop policy if exists mem_read on public.memberships;
create policy mem_read on public.memberships for select using (public.rp_is_member(org_id));
drop policy if exists mem_change on public.memberships;
create policy mem_change on public.memberships for update
  using (public.rp_has_role(org_id, '{owner,admin}'))
  with check (public.rp_has_role(org_id, '{owner,admin}') and (role <> 'owner' or public.rp_has_role(org_id, '{owner}')));
drop policy if exists mem_remove on public.memberships;
create policy mem_remove on public.memberships for delete
  using (public.rp_has_role(org_id, '{owner,admin}') or user_id = auth.uid());

drop policy if exists inv_manage on public.invitations;
create policy inv_manage on public.invitations for all
  using (public.rp_has_role(org_id, '{owner,admin}')) with check (public.rp_has_role(org_id, '{owner,admin}'));

drop policy if exists lib_read on public.library_versions;
create policy lib_read on public.library_versions for select using (public.rp_is_member(org_id));
-- No insert/update/delete policies: publishing goes through publish_library(), versions are immutable.

drop policy if exists rec_read on public.records;
create policy rec_read on public.records for select
  using (public.rp_is_member(org_id) and (created_by = auth.uid() or public.rp_has_role(org_id, '{owner,admin,engineer,supervisor}')));
drop policy if exists rec_insert on public.records;
create policy rec_insert on public.records for insert
  with check (created_by = auth.uid() and public.rp_has_role(org_id, '{owner,admin,engineer,supervisor,operator}'));
drop policy if exists rec_update on public.records;
create policy rec_update on public.records for update
  using (created_by = auth.uid() and public.rp_is_member(org_id)) with check (created_by = auth.uid());

drop policy if exists act_read on public.activity;
create policy act_read on public.activity for select using (public.rp_has_role(org_id, '{owner,admin,supervisor}'));

-- ---------- Guards ----------
-- A company always keeps at least one owner.
create or replace function public.rp_keep_owner() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'DELETE' and old.role = 'owner') or (tg_op = 'UPDATE' and old.role = 'owner' and new.role <> 'owner') then
    if (select count(*) from public.memberships where org_id = old.org_id and role = 'owner' and user_id <> old.user_id) = 0
       and exists (select 1 from public.organizations where id = old.org_id) then
      raise exception 'A company needs at least one owner' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'DELETE' then
    -- When the whole company is deleted the memberships go with it: nothing to log then.
    if exists (select 1 from public.organizations where id = old.org_id) then
      perform public.rp_log(old.org_id, 'member.removed', jsonb_build_object('user', old.user_id, 'role', old.role));
    end if;
    return old;
  end if;
  if new.role <> old.role then
    perform public.rp_log(new.org_id, 'member.role', jsonb_build_object('user', new.user_id, 'from', old.role, 'to', new.role));
  end if;
  return new;
end $$;
drop trigger if exists rp_keep_owner on public.memberships;
create trigger rp_keep_owner before update or delete on public.memberships for each row execute function public.rp_keep_owner();

-- Records: the server sets the timestamps and keeps the creator.
create or replace function public.rp_touch_record() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists rp_touch_record on public.records;
create trigger rp_touch_record before insert or update on public.records for each row execute function public.rp_touch_record();

-- ---------- Functions the app calls ----------
create or replace function public.create_organization(p_name text) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare o public.organizations;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '28000'; end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), auth.uid()) returning * into o;
  insert into public.memberships (org_id, user_id, role, email) values (o.id, auth.uid(), 'owner', auth.email());
  perform public.rp_log(o.id, 'company.created', jsonb_build_object('name', o.name));
  return o;
end $$;

-- Joins every company that invited the signed-in e-mail address. Returns how many.
create or replace function public.accept_invitations() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; inv record;
begin
  if auth.uid() is null or auth.email() is null then return 0; end if;
  for inv in select * from public.invitations where lower(email) = lower(auth.email()) and accepted_at is null loop
    insert into public.memberships (org_id, user_id, role, email) values (inv.org_id, auth.uid(), inv.role, auth.email())
      on conflict (org_id, user_id) do nothing;
    update public.invitations set accepted_at = now() where id = inv.id;
    perform public.rp_log(inv.org_id, 'member.joined', jsonb_build_object('email', auth.email(), 'role', inv.role));
    n := n + 1;
  end loop;
  return n;
end $$;

-- Publishes a new library version. p_base_version is the version the editor started from:
-- if someone published in between, the call fails instead of silently overwriting their work.
create or replace function public.publish_library(p_org uuid, p_data jsonb, p_note text, p_base_version integer)
returns integer
language plpgsql security definer set search_path = public as $$
declare cur integer; nxt integer;
begin
  if not public.rp_has_role(p_org, '{owner,admin,engineer}') then
    raise exception 'Only engineers, admins and owners can publish the library' using errcode = '42501';
  end if;
  if jsonb_typeof(p_data -> 'parts') is distinct from 'array' then
    raise exception 'The library has no parts list' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_org::text));
  select coalesce(max(version), 0) into cur from public.library_versions where org_id = p_org;
  if p_base_version is not null and p_base_version <> cur then
    raise exception 'Version conflict: the library is at version %, you started from %', cur, p_base_version using errcode = '40001';
  end if;
  nxt := cur + 1;
  insert into public.library_versions (org_id, version, data, note, published_by) values (p_org, nxt, p_data, p_note, auth.uid());
  perform public.rp_log(p_org, 'library.published', jsonb_build_object('version', nxt, 'note', p_note,
    'parts', jsonb_array_length(p_data -> 'parts')));
  return nxt;
end $$;

create or replace function public.invite_member(p_org uuid, p_email text, p_role public.rp_role) returns public.invitations
language plpgsql security definer set search_path = public as $$
declare i public.invitations;
begin
  if not public.rp_has_role(p_org, '{owner,admin}') then
    raise exception 'Only admins and owners can invite' using errcode = '42501';
  end if;
  if p_role = 'owner' then raise exception 'Invite as admin, then make them owner' using errcode = '22023'; end if;
  insert into public.invitations (org_id, email, role, invited_by) values (p_org, lower(btrim(p_email)), p_role, auth.uid())
    on conflict (org_id, email) do update set role = excluded.role, accepted_at = null
    returning * into i;
  perform public.rp_log(p_org, 'member.invited', jsonb_build_object('email', i.email, 'role', i.role));
  return i;
end $$;

-- Trace of AI questions (who, when, which records were cited), written by the ask function.
create or replace function public.rp_log_question(p_org uuid, p_cited text[], p_chars integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.rp_is_member(p_org) then return; end if;
  perform public.rp_log(p_org, 'ask.ai', jsonb_build_object('cited', to_jsonb(coalesce(p_cited, '{}')), 'chars', p_chars));
end $$;

-- Companies of the signed-in user, with their role.
create or replace function public.my_organizations()
returns table (id uuid, name text, role public.rp_role, latest_version integer)
language sql stable security definer set search_path = public as $$
  select o.id, o.name, m.role, (select max(v.version) from public.library_versions v where v.org_id = o.id)
  from public.memberships m join public.organizations o on o.id = m.org_id
  where m.user_id = auth.uid()
  order by o.name
$$;

-- ---------- Grants (Supabase roles) ----------
-- Supabase grants everything on new tables by default; start from nothing and grant only what the app needs.
-- Row-level security above still decides which rows each person can touch.
revoke all on all tables in schema public from anon, authenticated;
revoke execute on all functions in schema public from anon, public;
grant usage on schema public to authenticated;
grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;
grant select, delete on public.memberships to authenticated;
grant update (role) on public.memberships to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;
grant select on public.library_versions to authenticated;
grant select, insert, update on public.records to authenticated;
grant select on public.activity to authenticated;
grant execute on function public.create_organization(text), public.accept_invitations(),
  public.publish_library(uuid, jsonb, text, integer), public.invite_member(uuid, text, public.rp_role),
  public.my_organizations(), public.rp_log_question(uuid, text[], integer), public.rp_role_of(uuid), public.rp_is_member(uuid),
  public.rp_has_role(uuid, public.rp_role[]) to authenticated;
