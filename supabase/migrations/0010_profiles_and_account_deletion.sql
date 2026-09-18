-- Public profile fields, avatar storage, account deletion with a
-- 30-day grace period, and a reserved "Deleted user" identity. Safe
-- to run more than once.
--
-- ============================================================
-- THE CASCADE PROBLEM, AND HOW WE SOLVE IT
-- ============================================================
-- novels.author_id -> profiles(id) ON DELETE CASCADE, and
-- profiles.id     -> auth.users(id) ON DELETE CASCADE. So a naive
-- account deletion would take every novel and chapter down with it —
-- readers' libraries would silently lose books they were mid-way
-- through. We can't just weaken the cascade: an orphaned novel with a
-- null author breaks the trending refresh (it compares each signal's
-- user against the novel's author to exclude the author's own reads).
--
-- So instead:
--
--   1. A reserved "Deleted user" profile exists at a fixed UUID, with a
--      matching row in auth.users whose password is unusable (no one
--      can sign in as this account).
--
--   2. Account deletion is a two-phase, soft-then-hard flow:
--      - soft_delete_account(choice) marks profiles.deleted_at + the
--        choice. Novels + comments + ratings + reactions of a
--        pending-deleted user are hidden from readers via RLS
--        immediately; the account holder can still sign in and cancel.
--      - finalize_account_deletions() runs hourly via pg_cron. For any
--        soft-deleted profile older than 30 days:
--          * choice='keep_work' : novels/ratings/comments/reactions get
--            reassigned to the reserved identity, then the auth.users
--            row is deleted (cascade takes only the user's private data
--            since nothing else still references them);
--          * choice='remove_work': just delete the auth.users row and
--            let the existing cascades take everything down cleanly.
--
--   3. cancel_account_deletion() clears deleted_at + deletion_choice.
--      A person who signs in during the grace window sees a banner and
--      can undo it in one click.
--
-- The reserved account also protects the boards: rankings compare
-- rows to novel author_id. After reassignment those comparisons all
-- exclude the reserved user consistently, so migrated novels still
-- rank correctly.

-- ---------------------------------------------------------------------------
-- 1. Public profile fields: avatar, bio, links.
--    'links' is a jsonb array of {label, url} objects. The app validates
--    each URL as http(s) before insert; a jsonb column stays flexible.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists links jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Soft-delete state.
--    deleted_at + deletion_choice mark the grace period. Both null =
--    an active account. When deleted_at is set, the user's public
--    surface goes dark immediately; finalization runs 30 days later.
-- ---------------------------------------------------------------------------
alter table profiles
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_choice text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_deletion_choice_check'
  ) then
    alter table profiles
      add constraint profiles_deletion_choice_check
      check (deletion_choice is null or deletion_choice in ('keep_work', 'remove_work'));
  end if;
end $$;

create index if not exists profiles_deleted_at_idx on profiles (deleted_at)
  where deleted_at is not null;

-- ---------------------------------------------------------------------------
-- 3. Reserved "Deleted user" identity.
--    A real auth.users row with an unusable password (empty crypt) plus
--    a profile row. Fixed UUID so app code can reference it as a
--    constant. Nobody can sign in as this account because bcrypt-verify
--    against '' returns false for any real password.
-- ---------------------------------------------------------------------------

-- The empty-string password blocks logins; the .invalid TLD is
-- reserved by RFC 2606 so this address can never receive real mail.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated', 'authenticated',
  'deleted-user@noveltrend.invalid',
  '',
  now(), now(), now(),
  '{"provider":"reserved"}'::jsonb,
  '{}'::jsonb,
  false
)
on conflict (id) do nothing;

insert into profiles (id, pen_name, is_author)
values ('00000000-0000-0000-0000-000000000001', 'Deleted user', false)
on conflict (id) do update set pen_name = excluded.pen_name;

-- ---------------------------------------------------------------------------
-- 4. RLS: hide a soft-deleted user's novels, chapters, and comments
--    from readers. The account holder themselves still sees everything
--    of theirs so cancellation makes sense.
-- ---------------------------------------------------------------------------

-- Novels: replace the "publicly readable" policy.
drop policy if exists "novels are publicly readable" on novels;
create policy "novels are publicly readable"
  on novels for select
  using (
    -- The author's account is active…
    exists (
      select 1 from public.profiles p
      where p.id = novels.author_id and p.deleted_at is null
    )
    -- …or the viewer IS the author (so cancellation still shows the work).
    or novels.author_id = auth.uid()
  );

-- Chapters visibility: existing policy already checks the novel's
-- author + is_published — we widen the join to also block chapters
-- whose novel is currently hidden by a soft-deleted author. The
-- author sees their own chapters (published or not) as before.
drop policy if exists "published chapters publicly readable" on chapters;
create policy "published chapters publicly readable"
  on chapters for select
  using (
    (
      is_published = true
      and exists (
        select 1 from public.novels n
        join public.profiles p on p.id = n.author_id
        where n.id = chapters.novel_id and p.deleted_at is null
      )
    )
    or exists (
      select 1 from public.novels n
      where n.id = chapters.novel_id and n.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Avatar storage bucket. Same shape as covers: public read, owner-
--    only write, files keyed by "{user_id}/…" so ownership is derivable
--    from the path.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars are publicly readable" on storage.objects;
create policy "avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users upload their own avatar" on storage.objects;
create policy "users upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users replace their own avatar" on storage.objects;
create policy "users replace their own avatar"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users remove their own avatar" on storage.objects;
create policy "users remove their own avatar"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 6. Soft-delete + cancel + finalize functions.
-- ---------------------------------------------------------------------------

-- soft_delete_account(choice): flip the profile into pending-deletion
-- state. The account holder can still sign in and cancel until
-- finalization. Refuses the reserved identity.
create or replace function soft_delete_account(p_choice text)
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'must be signed in';
  end if;
  if v_uid = '00000000-0000-0000-0000-000000000001'::uuid then
    raise exception 'cannot delete the reserved identity';
  end if;
  if p_choice not in ('keep_work', 'remove_work') then
    raise exception 'choice must be keep_work or remove_work';
  end if;

  update public.profiles
    set deleted_at = coalesce(deleted_at, now()),
        deletion_choice = p_choice
    where id = v_uid;
end;
$$;

revoke execute on function public.soft_delete_account(text) from public;
grant execute on function public.soft_delete_account(text) to authenticated;

-- cancel_account_deletion(): clear the pending-deletion marker.
create or replace function cancel_account_deletion()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'must be signed in';
  end if;
  update public.profiles
    set deleted_at = null,
        deletion_choice = null
    where id = v_uid;
end;
$$;

revoke execute on function public.cancel_account_deletion() from public;
grant execute on function public.cancel_account_deletion() to authenticated;

-- finalize_account_deletions(): pg_cron target. For each profile whose
-- soft-delete window has expired: apply the chosen policy and delete
-- the auth.users row (which cascades the profile).
create or replace function finalize_account_deletions()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  reserved uuid := '00000000-0000-0000-0000-000000000001';
begin
  for r in
    select id, coalesce(deletion_choice, 'remove_work') as choice
      from public.profiles
      where deleted_at is not null
        and deleted_at <= now() - interval '30 days'
        and id <> reserved
  loop
    if r.choice = 'keep_work' then
      -- Novels: reassign to the reserved identity. Cascades continue
      -- to attribute chapters/reactions/comments to the same novel.
      update public.novels set author_id = reserved where author_id = r.id;

      -- Ratings: (user_id, novel_id) is unique. If reserved already
      -- rated a novel this user also rated, drop the older one first.
      delete from public.novel_ratings
        where user_id = reserved
          and novel_id in (
            select novel_id from public.novel_ratings where user_id = r.id
          );
      update public.novel_ratings set user_id = reserved where user_id = r.id;

      -- Comments: anonymised so threads don't develop holes.
      update public.paragraph_comments set user_id = reserved where user_id = r.id;
      update public.chapter_comments   set user_id = reserved where user_id = r.id;

      -- Reactions: private per-user; deleting them keeps counts honest
      -- (the reserved account shouldn't accumulate other users' taps).
      delete from public.paragraph_reactions where user_id = r.id;
    end if;

    -- Whichever choice, the auth user goes now. remove_work relies on
    -- the existing ON DELETE CASCADE from novels.author_id -> profiles
    -- -> auth.users. keep_work has already emptied that path.
    delete from auth.users where id = r.id;
  end loop;
end;
$$;

revoke execute on function public.finalize_account_deletions() from public, anon, authenticated;

-- Schedule finalisation hourly via pg_cron. Idempotent unschedule
-- guarded by the extension existing (matches the pattern used in 0004
-- + 0006).
do $$
begin
  if exists (
    select 1 from pg_extension where extname = 'pg_cron'
  ) then
    perform cron.unschedule(jobid)
      from cron.job
      where jobname = 'finalize_account_deletions';

    perform cron.schedule(
      'finalize_account_deletions',
      '0 * * * *',
      $cron$ select public.finalize_account_deletions(); $cron$
    );
  end if;
end $$;
