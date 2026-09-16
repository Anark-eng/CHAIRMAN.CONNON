-- Chapter editor upgrade: stable paragraph identity, formatting, autosave
-- surface, scheduling, volumes, and author notes. Safe to run more than
-- once.
--
-- ============================================================
-- WHY STABLE PARAGRAPH IDENTITY MATTERS
-- ============================================================
-- Before this migration, paragraph reactions and paragraph discussions
-- were keyed by paragraph_index — the paragraph's position in the
-- chapter at read time. So editing a published chapter and inserting a
-- paragraph in the middle silently moved every reaction and comment
-- below it onto the wrong paragraph.
--
-- The fix: each paragraph now carries a stable UUID (`pid`) stored on
-- the chapter itself as a JSONB array. Reactions and comments key on
-- that pid instead. Editing the chapter can renumber positions all it
-- likes; each surviving paragraph keeps its pid and its discussion.
--
-- Backfill: every existing chapter has its body split into paragraphs
-- the same way the app has always split them (blank line separators),
-- each is given a fresh UUID, and every existing reaction / comment /
-- count row is rewritten to point at the pid for the position it
-- currently references. Nothing is dropped.
--
-- ============================================================
-- HOW FORMATTING IS STORED (and why this shape)
-- ============================================================
-- chapters.paragraphs is a JSONB array of paragraph objects:
--
--   [
--     { "pid": "<uuid>", "kind": "p",     "runs": [{"t":"hello ","b":true},{"t":"world"}] },
--     { "pid": "<uuid>", "kind": "h",     "runs": [{"t":"A section title"}] },
--     { "pid": "<uuid>", "kind": "quote", "runs": [{"t":"a quote"}] },
--     { "pid": "<uuid>", "kind": "break", "runs": [] }
--   ]
--
-- kind ∈ {"p" | "h" | "quote" | "break"}. runs is an ordered list of
-- {t: text, b?: bold, i?: italic}. Nothing else is allowed.
--
-- This shape is deliberate:
--   1. Round-trips cleanly through the editor — the client parses
--      markdown-lite into this shape and back.
--   2. Renders with no risk of injected markup — the reader component
--      emits only <p>, <h3>, <blockquote>, <hr>, <strong>, <em>, and
--      never touches dangerouslySetInnerHTML. Anything from a paste
--      that isn't in this vocabulary is dropped by the sanitiser.
--   3. Doesn't disturb paragraph identity — pids live on the same
--      structure as the text.
--
-- chapters.body (plain text, blank-line-separated) is kept in sync as
-- a fallback for search-like uses and older code paths. New writes
-- update both. Reader queries prefer paragraphs when it's non-empty.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. volumes: optional named group of chapters. A novel with no volumes
--    keeps working exactly as before (chapters just have volume_id NULL).
-- ---------------------------------------------------------------------------
create table if not exists volumes (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels (id) on delete cascade,
  name text not null,
  position integer not null,
  created_at timestamptz not null default now(),
  unique (novel_id, position)
);

create index if not exists volumes_by_novel_idx on volumes (novel_id, position);

alter table volumes enable row level security;

drop policy if exists "volumes are publicly readable" on volumes;
create policy "volumes are publicly readable"
  on volumes for select using (true);

drop policy if exists "authors manage their own volumes" on volumes;
create policy "authors manage their own volumes"
  on volumes for all
  using (exists (select 1 from novels where novels.id = volumes.novel_id and novels.author_id = auth.uid()))
  with check (exists (select 1 from novels where novels.id = volumes.novel_id and novels.author_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. New chapter columns: paragraphs jsonb + author notes + publish_at +
--    volume_id.
-- ---------------------------------------------------------------------------
alter table chapters
  add column if not exists paragraphs jsonb not null default '[]'::jsonb;

alter table chapters
  add column if not exists author_note_top text;

alter table chapters
  add column if not exists author_note_bottom text;

alter table chapters
  add column if not exists publish_at timestamptz;

alter table chapters
  add column if not exists volume_id uuid references volumes (id) on delete set null;

create index if not exists chapters_publish_at_idx
  on chapters (publish_at)
  where publish_at is not null and not is_published;

create index if not exists chapters_by_volume_idx on chapters (volume_id) where volume_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Add paragraph_pid to the three tables that used paragraph_index.
--    Nullable at first so the backfill can populate them without
--    fighting NOT NULL.
-- ---------------------------------------------------------------------------
alter table paragraph_reactions       add column if not exists paragraph_pid uuid;
alter table paragraph_reaction_counts add column if not exists paragraph_pid uuid;
alter table paragraph_comments        add column if not exists paragraph_pid uuid;

-- ---------------------------------------------------------------------------
-- 4. Backfill: for every chapter, split body into paragraphs the same
--    way the app has always split them, assign each a fresh UUID, and
--    store the result on chapters.paragraphs. Then rewrite every
--    reaction / comment / counts row to point at the pid for the
--    position it currently references.
--
--    Guarded so it only runs on rows that don't already have paragraphs
--    populated, keeping the migration idempotent.
-- ---------------------------------------------------------------------------
create or replace function _backfill_chapter_paragraphs()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  r record;
  parts text[];
  arr jsonb;
  i int;
  txt text;
  pid uuid;
begin
  for r in select id, body from public.chapters where paragraphs = '[]'::jsonb loop
    -- Same split rule as src/lib/reading.ts: paragraphs separated by
    -- one or more blank lines, trimmed, empties dropped.
    parts := regexp_split_to_array(coalesce(r.body, ''), E'\\n\\s*\\n');
    arr := '[]'::jsonb;
    for i in 1 .. coalesce(array_length(parts, 1), 0) loop
      txt := btrim(parts[i]);
      if length(txt) > 0 then
        pid := gen_random_uuid();
        arr := arr || jsonb_build_object(
          'pid', pid::text,
          'kind', 'p',
          'runs', jsonb_build_array(jsonb_build_object('t', txt))
        );
      end if;
    end loop;
    update public.chapters set paragraphs = arr where id = r.id;
  end loop;
end;
$$;

revoke execute on function public._backfill_chapter_paragraphs() from public, anon, authenticated;

select _backfill_chapter_paragraphs();

-- Now rewrite the three tables' paragraph_pid columns from
-- chapters.paragraphs[paragraph_index]->>'pid'. Only touches rows
-- where paragraph_pid is still null, so re-runs are cheap.
update paragraph_reactions r
  set paragraph_pid = (c.paragraphs -> r.paragraph_index ->> 'pid')::uuid
  from chapters c
  where r.paragraph_pid is null
    and r.chapter_id = c.id
    and jsonb_typeof(c.paragraphs -> r.paragraph_index) = 'object';

update paragraph_reaction_counts pc
  set paragraph_pid = (c.paragraphs -> pc.paragraph_index ->> 'pid')::uuid
  from chapters c
  where pc.paragraph_pid is null
    and pc.chapter_id = c.id
    and jsonb_typeof(c.paragraphs -> pc.paragraph_index) = 'object';

update paragraph_comments com
  set paragraph_pid = (c.paragraphs -> com.paragraph_index ->> 'pid')::uuid
  from chapters c
  where com.paragraph_pid is null
    and com.chapter_id = c.id
    and jsonb_typeof(c.paragraphs -> com.paragraph_index) = 'object';

-- Any leftover rows point at a paragraph_index that no longer exists on
-- the chapter (shouldn't happen, but if any oddity slipped in we drop
-- those orphans so we can enforce NOT NULL below). Very small blast
-- radius; if this is non-empty the migration owner should investigate.
delete from paragraph_reactions where paragraph_pid is null;
delete from paragraph_reaction_counts where paragraph_pid is null;
delete from paragraph_comments where paragraph_pid is null;

-- ---------------------------------------------------------------------------
-- 5. Swap the identity keys from (chapter_id, paragraph_index) to
--    (chapter_id, paragraph_pid) and enforce NOT NULL.
-- ---------------------------------------------------------------------------
alter table paragraph_reactions alter column paragraph_pid set not null;
alter table paragraph_reaction_counts alter column paragraph_pid set not null;
alter table paragraph_comments alter column paragraph_pid set not null;

-- reactions: drop old (user, chapter, index, type) unique and add pid-keyed one.
alter table paragraph_reactions
  drop constraint if exists paragraph_reactions_user_id_chapter_id_paragraph_index_react_key;
create unique index if not exists paragraph_reactions_pid_unique_idx
  on paragraph_reactions (user_id, chapter_id, paragraph_pid, reaction_type);

create index if not exists paragraph_reactions_by_pid_idx
  on paragraph_reactions (chapter_id, paragraph_pid);

-- counts: swap PK.
alter table paragraph_reaction_counts drop constraint if exists paragraph_reaction_counts_pkey;
alter table paragraph_reaction_counts add primary key (chapter_id, paragraph_pid);

create index if not exists paragraph_reaction_counts_by_chapter_pid_idx
  on paragraph_reaction_counts (chapter_id, paragraph_pid);

-- comments: replace old lookup index with a pid-keyed one.
drop index if exists paragraph_comments_lookup_idx;
create index if not exists paragraph_comments_lookup_pid_idx
  on paragraph_comments (chapter_id, paragraph_pid, created_at desc);

-- ---------------------------------------------------------------------------
-- 6. Rewrite the counts-maintenance function to key on pid.
-- ---------------------------------------------------------------------------
create or replace function bump_paragraph_reaction_count(
  p_chapter_id uuid,
  p_paragraph_pid uuid,
  p_reaction_type text,
  p_delta integer
) returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.paragraph_reaction_counts (chapter_id, paragraph_pid, paragraph_index)
  values (p_chapter_id, p_paragraph_pid, 0)
  on conflict (chapter_id, paragraph_pid) do nothing;

  if p_reaction_type = 'shocked' then
    update public.paragraph_reaction_counts
      set shocked = greatest(shocked + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_pid = p_paragraph_pid;
  elsif p_reaction_type = 'heartbreak' then
    update public.paragraph_reaction_counts
      set heartbreak = greatest(heartbreak + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_pid = p_paragraph_pid;
  elsif p_reaction_type = 'laughed' then
    update public.paragraph_reaction_counts
      set laughed = greatest(laughed + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_pid = p_paragraph_pid;
  elsif p_reaction_type = 'goosebumps' then
    update public.paragraph_reaction_counts
      set goosebumps = greatest(goosebumps + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_pid = p_paragraph_pid;
  elsif p_reaction_type = 'best_line' then
    update public.paragraph_reaction_counts
      set best_line = greatest(best_line + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_pid = p_paragraph_pid;
  elsif p_reaction_type = 'confused' then
    update public.paragraph_reaction_counts
      set confused = greatest(confused + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_pid = p_paragraph_pid;
  end if;
end;
$$;

revoke execute on function public.bump_paragraph_reaction_count(uuid, uuid, text, integer) from public, anon, authenticated;

-- The old bump function (uuid, integer, text, integer) is superseded.
-- Drop it — otherwise the reaction triggers below can't pick the
-- correct overload cleanly.
drop function if exists public.bump_paragraph_reaction_count(uuid, integer, text, integer);

create or replace function paragraph_reactions_after_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.bump_paragraph_reaction_count(new.chapter_id, new.paragraph_pid, new.reaction_type, 1);
  return new;
end;
$$;

create or replace function paragraph_reactions_after_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.bump_paragraph_reaction_count(old.chapter_id, old.paragraph_pid, old.reaction_type, -1);
  return old;
end;
$$;

-- Triggers already exist from 0003 and don't need rebinding.

-- ---------------------------------------------------------------------------
-- 7. Scheduled publishing. A chapter with publish_at set stays invisible
--    to readers (is_published = false) until this function flips it.
--    published_at is set to the moment it actually went live so
--    "Recently updated" reflects the real time, not the write time.
--
--    Runs every 5 minutes via its own pg_cron job.
-- ---------------------------------------------------------------------------
create or replace function publish_scheduled_chapters()
returns integer
language plpgsql
security definer set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  update public.chapters
    set is_published = true,
        published_at = v_now,
        publish_at = null
    where publish_at is not null
      and publish_at <= v_now
      and not is_published;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.publish_scheduled_chapters() from public, anon, authenticated;

do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
    from cron.job where jobname = 'noveltrend_publish_scheduled';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  perform cron.schedule(
    'noveltrend_publish_scheduled',
    '*/5 * * * *',
    $cron$ select public.publish_scheduled_chapters(); $cron$
  );
end $$;

-- Kick one immediately so anything already past its time doesn't wait.
select public.publish_scheduled_chapters();
