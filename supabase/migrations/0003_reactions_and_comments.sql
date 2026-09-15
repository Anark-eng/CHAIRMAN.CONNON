-- Paragraph reactions, per-paragraph running-total counts, paragraph
-- discussions, and chapter comments. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Reaction types. Fixed set — kept as a check constraint (rather than an
-- enum) so it plays nicely with UPDATE-safe migrations later. Six values:
-- shocked, heartbreak, laughed, goosebumps, best_line, confused.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- paragraph_reactions
--   One row per (user, chapter, paragraph_index, reaction_type). Tapping
--   an active reaction deletes the row; a different reaction on the same
--   paragraph is a separate row (readers may pick more than one type).
-- ---------------------------------------------------------------------------
create table if not exists paragraph_reactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  paragraph_index integer not null,
  reaction_type text not null check (reaction_type in (
    'shocked', 'heartbreak', 'laughed', 'goosebumps', 'best_line', 'confused'
  )),
  created_at timestamptz not null default now(),
  unique (user_id, chapter_id, paragraph_index, reaction_type)
);

create index if not exists paragraph_reactions_lookup_idx
  on paragraph_reactions (chapter_id, paragraph_index);
create index if not exists paragraph_reactions_by_user_idx
  on paragraph_reactions (user_id, chapter_id);

-- ---------------------------------------------------------------------------
-- paragraph_reaction_counts
--   Running totals maintained by a trigger. One row per
--   (chapter, paragraph_index). Reader queries hit this table only — they
--   never scan paragraph_reactions to count.
-- ---------------------------------------------------------------------------
create table if not exists paragraph_reaction_counts (
  chapter_id uuid not null references chapters (id) on delete cascade,
  paragraph_index integer not null,
  shocked integer not null default 0,
  heartbreak integer not null default 0,
  laughed integer not null default 0,
  goosebumps integer not null default 0,
  best_line integer not null default 0,
  confused integer not null default 0,
  total integer not null generated always as (
    shocked + heartbreak + laughed + goosebumps + best_line + confused
  ) stored,
  primary key (chapter_id, paragraph_index)
);

create index if not exists paragraph_reaction_counts_by_chapter_idx
  on paragraph_reaction_counts (chapter_id);

-- ---------------------------------------------------------------------------
-- Keep paragraph_reaction_counts in sync with paragraph_reactions.
-- ---------------------------------------------------------------------------
create or replace function bump_paragraph_reaction_count(
  p_chapter_id uuid,
  p_paragraph_index integer,
  p_reaction_type text,
  p_delta integer
) returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.paragraph_reaction_counts (chapter_id, paragraph_index)
  values (p_chapter_id, p_paragraph_index)
  on conflict (chapter_id, paragraph_index) do nothing;

  if p_reaction_type = 'shocked' then
    update public.paragraph_reaction_counts
      set shocked = greatest(shocked + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_index = p_paragraph_index;
  elsif p_reaction_type = 'heartbreak' then
    update public.paragraph_reaction_counts
      set heartbreak = greatest(heartbreak + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_index = p_paragraph_index;
  elsif p_reaction_type = 'laughed' then
    update public.paragraph_reaction_counts
      set laughed = greatest(laughed + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_index = p_paragraph_index;
  elsif p_reaction_type = 'goosebumps' then
    update public.paragraph_reaction_counts
      set goosebumps = greatest(goosebumps + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_index = p_paragraph_index;
  elsif p_reaction_type = 'best_line' then
    update public.paragraph_reaction_counts
      set best_line = greatest(best_line + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_index = p_paragraph_index;
  elsif p_reaction_type = 'confused' then
    update public.paragraph_reaction_counts
      set confused = greatest(confused + p_delta, 0)
      where chapter_id = p_chapter_id and paragraph_index = p_paragraph_index;
  end if;
end;
$$;

revoke execute on function public.bump_paragraph_reaction_count(uuid, integer, text, integer) from public;
revoke execute on function public.bump_paragraph_reaction_count(uuid, integer, text, integer) from anon;
revoke execute on function public.bump_paragraph_reaction_count(uuid, integer, text, integer) from authenticated;

create or replace function paragraph_reactions_after_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.bump_paragraph_reaction_count(new.chapter_id, new.paragraph_index, new.reaction_type, 1);
  return new;
end;
$$;

create or replace function paragraph_reactions_after_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.bump_paragraph_reaction_count(old.chapter_id, old.paragraph_index, old.reaction_type, -1);
  return old;
end;
$$;

revoke execute on function public.paragraph_reactions_after_insert() from public;
revoke execute on function public.paragraph_reactions_after_insert() from anon;
revoke execute on function public.paragraph_reactions_after_insert() from authenticated;
revoke execute on function public.paragraph_reactions_after_delete() from public;
revoke execute on function public.paragraph_reactions_after_delete() from anon;
revoke execute on function public.paragraph_reactions_after_delete() from authenticated;

drop trigger if exists paragraph_reactions_bump_on_insert on paragraph_reactions;
create trigger paragraph_reactions_bump_on_insert
  after insert on paragraph_reactions
  for each row execute procedure paragraph_reactions_after_insert();

drop trigger if exists paragraph_reactions_bump_on_delete on paragraph_reactions;
create trigger paragraph_reactions_bump_on_delete
  after delete on paragraph_reactions
  for each row execute procedure paragraph_reactions_after_delete();

-- ---------------------------------------------------------------------------
-- paragraph_comments
--   One row per comment on a single paragraph. Threaded discussion lives
--   here, separate from chapter comments. Spoilers: is_spoiler = true
--   means the body must never be sent to the browser until the reader
--   asks for it — the reader-facing query redacts body when the flag is on
--   (see get_visible_paragraph_comments and the "reveal" server action).
-- ---------------------------------------------------------------------------
create table if not exists paragraph_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  paragraph_index integer not null,
  body text not null,
  is_spoiler boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists paragraph_comments_lookup_idx
  on paragraph_comments (chapter_id, paragraph_index, created_at desc);
create index if not exists paragraph_comments_by_user_idx
  on paragraph_comments (user_id);

-- ---------------------------------------------------------------------------
-- chapter_comments
--   Comments on the chapter as a whole. Replies go one level deep via
--   parent_id: a top-level comment has parent_id null; a reply has
--   parent_id pointing to a top-level comment (guaranteed by trigger).
-- ---------------------------------------------------------------------------
create table if not exists chapter_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  parent_id uuid references chapter_comments (id) on delete cascade,
  body text not null,
  is_spoiler boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chapter_comments_by_chapter_idx
  on chapter_comments (chapter_id, created_at desc);
create index if not exists chapter_comments_by_parent_idx
  on chapter_comments (parent_id) where parent_id is not null;
create index if not exists chapter_comments_by_user_idx
  on chapter_comments (user_id);

create or replace function chapter_comments_enforce_one_level_depth()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  parent_parent_id uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select parent_id into parent_parent_id
    from public.chapter_comments
    where id = new.parent_id;

  if parent_parent_id is not null then
    raise exception 'Replies to replies are not allowed on chapter_comments (only one level of reply).';
  end if;

  return new;
end;
$$;

revoke execute on function public.chapter_comments_enforce_one_level_depth() from public;
revoke execute on function public.chapter_comments_enforce_one_level_depth() from anon;
revoke execute on function public.chapter_comments_enforce_one_level_depth() from authenticated;

drop trigger if exists chapter_comments_enforce_depth on chapter_comments;
create trigger chapter_comments_enforce_depth
  before insert or update on chapter_comments
  for each row execute procedure chapter_comments_enforce_one_level_depth();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Reads: only on PUBLISHED chapters (drafts stay private to their author).
-- Every read policy checks the chapter's is_published flag AND
-- exposes drafts only to that novel's author. See the "drafts stay private"
-- audit note at the bottom of this file for how each policy stays tight.
-- ---------------------------------------------------------------------------
alter table paragraph_reactions enable row level security;
alter table paragraph_reaction_counts enable row level security;
alter table paragraph_comments enable row level security;
alter table chapter_comments enable row level security;

-- paragraph_reactions
drop policy if exists "paragraph reactions read: published or own novel" on paragraph_reactions;
create policy "paragraph reactions read: published or own novel"
  on paragraph_reactions for select
  using (
    exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = paragraph_reactions.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

drop policy if exists "paragraph reactions insert: self, on published chapter" on paragraph_reactions;
create policy "paragraph reactions insert: self, on published chapter"
  on paragraph_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = paragraph_reactions.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

drop policy if exists "paragraph reactions delete: self" on paragraph_reactions;
create policy "paragraph reactions delete: self"
  on paragraph_reactions for delete
  using (auth.uid() = user_id);

-- paragraph_reaction_counts
drop policy if exists "paragraph reaction counts read: published or own novel" on paragraph_reaction_counts;
create policy "paragraph reaction counts read: published or own novel"
  on paragraph_reaction_counts for select
  using (
    exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = paragraph_reaction_counts.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

-- Writes to paragraph_reaction_counts happen only through the trigger
-- (security definer, bypasses RLS), so no INSERT/UPDATE/DELETE policies are
-- needed here. Without an INSERT/UPDATE policy, direct writes are refused.

-- paragraph_comments
drop policy if exists "paragraph comments read: published or own novel" on paragraph_comments;
create policy "paragraph comments read: published or own novel"
  on paragraph_comments for select
  using (
    exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = paragraph_comments.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

drop policy if exists "paragraph comments insert: self, on published chapter" on paragraph_comments;
create policy "paragraph comments insert: self, on published chapter"
  on paragraph_comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = paragraph_comments.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

drop policy if exists "paragraph comments delete: self or novel author" on paragraph_comments;
create policy "paragraph comments delete: self or novel author"
  on paragraph_comments for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = paragraph_comments.chapter_id
        and n.author_id = auth.uid()
    )
  );

-- chapter_comments
drop policy if exists "chapter comments read: published or own novel" on chapter_comments;
create policy "chapter comments read: published or own novel"
  on chapter_comments for select
  using (
    exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = chapter_comments.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

drop policy if exists "chapter comments insert: self, on published chapter" on chapter_comments;
create policy "chapter comments insert: self, on published chapter"
  on chapter_comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = chapter_comments.chapter_id
        and (c.is_published or n.author_id = auth.uid())
    )
  );

drop policy if exists "chapter comments delete: self or novel author" on chapter_comments;
create policy "chapter comments delete: self or novel author"
  on chapter_comments for delete
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from chapters c
      join novels n on n.id = c.novel_id
      where c.id = chapter_comments.chapter_id
        and n.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- Draft-privacy audit
--
-- Every SELECT policy on the four new tables joins chapters -> novels and
-- requires `c.is_published OR n.author_id = auth.uid()`. That's the only
-- gate on comment and reaction visibility.
--
-- Places I checked while writing this migration:
--
-- 1. paragraph_reactions SELECT: gated. A guest sees no rows for a draft
--    chapter; the novel's author sees their own draft chapter's reactions.
--
-- 2. paragraph_reaction_counts SELECT: gated the same way, keyed on
--    chapter_id. Note: because reactions can't be inserted on a draft
--    chapter by anyone but the author (the INSERT policy checks the same
--    is_published/author gate), a draft chapter's counts row exists only
--    for reactions the author placed themselves.
--
-- 3. paragraph_comments SELECT: gated. Same shape.
--
-- 4. chapter_comments SELECT: gated. Replies inherit the parent's
--    chapter_id (there's no cross-chapter reply), so the policy still
--    applies to them.
--
-- Spoiler bodies are a separate concern: RLS controls WHICH rows are
-- visible, and the application layer decides which COLUMNS to select for a
-- given viewer. See src/lib/data/comments.ts — reader-facing queries
-- explicitly omit the `body` column for is_spoiler = true rows, and a
-- separate action fetches one comment's body only when the reader taps
-- reveal.
-- ---------------------------------------------------------------------------
