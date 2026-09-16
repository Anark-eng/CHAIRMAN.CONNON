-- Novel classification: demographic + many genres + open tags. Safe to
-- run more than once.
--
-- ============================================================
-- WHY THIS SHAPE, IN ONE PARAGRAPH
-- ============================================================
-- Readers block tags to steer clear of content they don't want. If any
-- author could freely mint a synonym for an existing tag ("time-travel"
-- alongside "Time Travel", "timetravel", "TimeTravel"), a blocked-tag
-- list based on names would leak the very content the reader chose to
-- avoid. So new tags go through a normalising match first (so obvious
-- duplicates resolve to the existing tag), and until a new tag has been
-- adopted by at least a few different novels — or manually approved —
-- it doesn't appear in Browse's filter list or a reader's blocked-tags
-- list at all. It still works on the novel it was created on. The gate
-- is on discovery, not on use.
--
-- ============================================================
-- SHARED THRESHOLDS
-- ============================================================
-- Mirrored in src/lib/classification.ts. Change both together.
--
--   MAX_GENRES_PER_NOVEL       9      cap on genres per novel
--   TAG_APPROVAL_MIN_NOVELS    3      distinct novels a tag must appear
--                                     on before it enters filter lists
--   MAX_TAG_NAME_LENGTH        40     bytes/chars, whichever comes first
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Demographic on novels. Fixed list, nullable, authors can't extend.
--    Enforced by a CHECK constraint rather than a Postgres enum so
--    later value additions stay simple (no ALTER TYPE dance).
-- ---------------------------------------------------------------------------
alter table novels
  add column if not exists demographic text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'novels_demographic_check'
  ) then
    alter table novels
      add constraint novels_demographic_check
      check (demographic is null or demographic in ('shounen', 'shoujo', 'seinen', 'josei', 'general'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Many-genre relationship. novel_genres is the new source of truth;
--    the old novels.genre_id is copied over then dropped in the same
--    migration.
-- ---------------------------------------------------------------------------
create table if not exists novel_genres (
  novel_id uuid not null references novels (id) on delete cascade,
  genre_id uuid not null references genres (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (novel_id, genre_id)
);

create index if not exists novel_genres_by_genre_idx on novel_genres (genre_id);
create index if not exists novel_genres_by_novel_idx on novel_genres (novel_id);

alter table novel_genres enable row level security;

drop policy if exists "novel genres publicly readable" on novel_genres;
create policy "novel genres publicly readable"
  on novel_genres for select using (true);

drop policy if exists "authors manage genres on their own novels" on novel_genres;
create policy "authors manage genres on their own novels"
  on novel_genres for all
  using (exists (
    select 1 from novels where novels.id = novel_genres.novel_id and novels.author_id = auth.uid()
  ))
  with check (exists (
    select 1 from novels where novels.id = novel_genres.novel_id and novels.author_id = auth.uid()
  ));

-- Cap at 9 genres per novel. A trigger raises a clean error rather than
-- letting an INSERT succeed and leaving the novel with 10.
create or replace function novel_genres_enforce_cap()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.novel_genres where novel_id = new.novel_id;
  if v_count >= 9 then
    raise exception 'a novel can carry at most 9 genres';
  end if;
  return new;
end;
$$;

revoke execute on function public.novel_genres_enforce_cap() from public, anon, authenticated;

drop trigger if exists novel_genres_cap_trg on novel_genres;
create trigger novel_genres_cap_trg
  before insert on novel_genres
  for each row execute procedure novel_genres_enforce_cap();

-- ---------------------------------------------------------------------------
-- 3. Widen the genre list. `on conflict (name) do nothing` keeps this
--    idempotent — existing names are left as-is.
-- ---------------------------------------------------------------------------
insert into genres (name, slug) values
  ('Isekai',            'isekai'),
  ('Cultivation',       'cultivation'),
  ('Progression',       'progression'),
  ('LitRPG',            'litrpg'),
  ('System',            'system'),
  ('Wuxia',             'wuxia'),
  ('Xuanhuan',          'xuanhuan'),
  ('Urban Fantasy',     'urban-fantasy'),
  ('Dark Fantasy',      'dark-fantasy'),
  ('Historical',        'historical'),
  ('Military',          'military'),
  ('Mecha',             'mecha'),
  ('Supernatural',      'supernatural'),
  ('Psychological',     'psychological'),
  ('Thriller',          'thriller'),
  ('Adventure',         'adventure'),
  ('Romantic Comedy',   'romantic-comedy'),
  ('Tragedy',           'tragedy'),
  ('School Life',       'school-life'),
  ('Apocalyptic',       'apocalyptic'),
  ('Transmigration',    'transmigration'),
  ('Reincarnation',     'reincarnation'),
  ('Magical Realism',   'magical-realism'),
  ('Mystery Thriller',  'mystery-thriller'),
  ('Crime',             'crime'),
  ('Political',         'political'),
  ('Adult Romance',     'adult-romance'),
  -- Obvious gaps beyond the requested list
  ('Slice of Life',     'slice-of-life-genre'),  -- distinct from any tag of same wording
  ('Horror',            'horror-genre'),
  ('Post-Apocalyptic',  'post-apocalyptic-genre'),
  ('GameLit',           'gamelit'),
  ('Virtual Reality',   'virtual-reality-genre'),
  ('Steampunk',         'steampunk'),
  ('Space Opera',       'space-opera'),
  ('Superhero',         'superhero')
on conflict (name) do nothing;

-- Migrate every novel's existing genre_id (if any) into novel_genres.
-- Idempotent by the (novel_id, genre_id) PK.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'novels' and column_name = 'genre_id'
  ) then
    insert into public.novel_genres (novel_id, genre_id)
      select id, genre_id
        from public.novels
        where genre_id is not null
      on conflict do nothing;
  end if;
end $$;

-- Drop the old single-genre column and its index. All app queries have
-- been rewritten to hit novel_genres in the same commit as this
-- migration.
alter table novels drop column if exists genre_id;

-- ---------------------------------------------------------------------------
-- 4. Tags: is_approved + a normalised-name unique index that guards
--    against near-duplicates ("Time Travel" / "time-travel" / "timetravel").
-- ---------------------------------------------------------------------------
alter table tags
  add column if not exists is_approved boolean not null default true;

-- Existing seed tags shipped in 0001 stay approved. Anything created
-- from the novel form starts unapproved (see create_or_get_tag()).
update tags set is_approved = true where is_approved is null;

-- Normalise: lowercase, then strip everything that isn't a lowercase
-- ascii letter or digit. So "Time Travel", "time-travel", "TIME_TRAVEL"
-- and "timetravel" all normalise to "timetravel".
create or replace function normalise_tag_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '', 'g');
$$;

create unique index if not exists tags_normalised_name_idx
  on tags ((public.normalise_tag_name(name)));

-- ---------------------------------------------------------------------------
-- 5. create_or_get_tag: the one supported way authors mint a tag.
--    Enforces all four safeguards:
--      - trim + length + non-empty + not punctuation-only
--      - shadow check against genre and demographic names (normalised)
--      - normalised-match reuse of an existing tag
--      - is_approved = false on a genuine new one
-- ---------------------------------------------------------------------------
create or replace function create_or_get_tag(p_name text)
returns table (id uuid, name text, slug text, is_approved boolean, was_created boolean)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_trimmed text := btrim(coalesce(p_name, ''));
  v_norm text;
  v_slug text;
  v_id uuid;
  v_existing_name text;
  v_existing_approved boolean;
begin
  if auth.uid() is null then
    raise exception 'must be signed in to create a tag';
  end if;

  if length(v_trimmed) = 0 then
    raise exception 'tag name cannot be empty';
  end if;
  if length(v_trimmed) > 40 then
    raise exception 'tag name is too long (max 40 characters)';
  end if;

  v_norm := public.normalise_tag_name(v_trimmed);
  if length(v_norm) = 0 then
    raise exception 'tag name must contain at least one letter or digit';
  end if;

  -- Reuse an existing tag that matches by normalised name (case /
  -- spacing / punctuation ignored). If it exists we return it as-is;
  -- was_created = false so the caller can tell the author "using
  -- <existing name> instead". This runs BEFORE the shadow check so a
  -- long-established tag whose name happens to collide with a later
  -- genre addition keeps working.
  select t.id, t.name, t.is_approved
    into v_id, v_existing_name, v_existing_approved
    from public.tags t
    where public.normalise_tag_name(t.name) = v_norm
    limit 1;

  if v_id is not null then
    return query
      select v_id, v_existing_name, v_norm as slug, v_existing_approved, false;
    return;
  end if;

  -- Shadow check against genre / demographic vocab so a rogue author
  -- can't create a NEW "tag" called Shounen and confuse blocked-tag lists.
  if exists (
    select 1 from public.genres where public.normalise_tag_name(name) = v_norm
  ) then
    raise exception 'a genre with that name already exists';
  end if;
  if v_norm in ('shounen', 'shoujo', 'seinen', 'josei', 'general') then
    raise exception 'that name is reserved for a demographic';
  end if;

  -- New tag. Slug is the normalised form; it's what the URL uses.
  v_slug := v_norm;
  insert into public.tags (name, slug, is_approved)
  values (v_trimmed, v_slug, false)
  returning tags.id into v_id;

  return query
    select v_id, v_trimmed, v_slug, false, true;
end;
$$;

revoke execute on function public.create_or_get_tag(text) from public;
grant execute on function public.create_or_get_tag(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Auto-approve tags that clear the adoption threshold.
--    Fires after novel_tags INSERT. If the tag is now on >= 3 distinct
--    novels and isn't approved yet, flip the flag. Once approved, a
--    tag stays approved (removing all its uses doesn't un-approve it;
--    the site owner can un-approve one by hand if they need to).
-- ---------------------------------------------------------------------------
create or replace function tag_maybe_auto_approve()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_count integer;
  v_approved boolean;
begin
  select is_approved into v_approved from public.tags where id = new.tag_id;
  if v_approved then
    return new;
  end if;

  select count(distinct novel_id) into v_count
    from public.novel_tags
    where tag_id = new.tag_id;

  if v_count >= 3 then
    update public.tags set is_approved = true where id = new.tag_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.tag_maybe_auto_approve() from public, anon, authenticated;

drop trigger if exists tag_maybe_auto_approve_trg on novel_tags;
create trigger tag_maybe_auto_approve_trg
  after insert on novel_tags
  for each row execute procedure tag_maybe_auto_approve();

-- Backfill: any existing tag already used by >= 3 distinct novels is
-- promoted right now. Existing tags stay approved by default (as set
-- above); this only matters for a fresh run of 0007 on a DB where
-- 0006's seed pool has already been used.
update tags
  set is_approved = true
  where id in (
    select tag_id from novel_tags group by tag_id having count(distinct novel_id) >= 3
  )
  and not is_approved;

-- ---------------------------------------------------------------------------
-- 7. Widen the starter tag pool. Idempotent via existing (name) unique
--    constraint. Everything inserted here starts approved (site-shipped),
--    so they're offered in Browse and blocked-tags immediately.
-- ---------------------------------------------------------------------------
insert into tags (name, slug, is_approved) values
  -- Subject matter
  ('Cultivation Society', 'cultivation-society', true),
  ('Dungeons',            'dungeons', true),
  ('Magic Academy',       'magic-academy', true),
  ('Overpowered MC',      'overpowered-mc', true),
  ('Underdog MC',         'underdog-mc', true),
  ('Villainess',          'villainess', true),
  ('Antihero',            'antihero', true),
  ('Revenge',             'revenge', true),
  ('Redemption',          'redemption', true),
  ('Second Chance',       'second-chance', true),
  ('Body Swap',           'body-swap', true),
  ('Beast Companion',     'beast-companion', true),
  ('Necromancer',         'necromancer', true),
  ('Assassin MC',         'assassin-mc', true),
  ('Rogue MC',            'rogue-mc', true),
  ('Kingdom Building',    'kingdom-building', true),
  ('Base Building',       'base-building', true),
  ('Crafting',            'crafting', true),
  ('Cooking',             'cooking', true),
  ('Music',               'music', true),
  -- Story shape
  ('Long Chapters',       'long-chapters', true),
  ('Short Chapters',      'short-chapters', true),
  ('Multi-POV',           'multi-pov', true),
  ('First Person',        'first-person-pov', true),
  ('Third Person',        'third-person-pov', true),
  ('Non-linear',          'non-linear-timeline', true),
  ('Time Loop',           'time-loop', true),
  ('Slow Start',          'slow-start', true),
  ('Fast Pacing',         'fast-pacing', true),
  ('Genre Deconstruction','genre-deconstruction', true),
  -- Cast
  ('Female Lead',         'female-lead', true),
  ('Male Lead',           'male-lead', true),
  ('Ensemble Cast',       'ensemble-cast', true),
  ('Morally Grey Cast',   'morally-grey-cast', true),
  ('LGBTQ+ Cast',         'lgbtq-cast', true),
  -- Setting
  ('Modern Setting',      'modern-setting', true),
  ('Medieval Setting',    'medieval-setting', true),
  ('Eastern Setting',     'eastern-setting', true),
  ('Space Setting',       'space-setting', true),
  ('Ocean Setting',       'ocean-setting', true),
  ('Underworld',          'underworld', true),
  ('Multiverse',          'multiverse', true),
  ('Wasteland',           'wasteland', true),
  -- Tone
  ('Wholesome',           'wholesome', true),
  ('Grimdark',            'grimdark', true),
  ('Hopeful',             'hopeful', true),
  ('Bittersweet',         'bittersweet', true),
  ('Cozy',                'cozy', true),
  ('Bleak',               'bleak', true),
  -- Content warnings
  ('CW: Violence',        'cw-violence', true),
  ('CW: Gore',            'cw-gore', true),
  ('CW: Sexual Content',  'cw-sexual-content', true),
  ('CW: Sexual Assault',  'cw-sexual-assault', true),
  ('CW: Self-Harm',       'cw-self-harm', true),
  ('CW: Suicide',         'cw-suicide', true),
  ('CW: Torture',         'cw-torture', true),
  ('CW: Substance Abuse', 'cw-substance-abuse', true),
  ('CW: Animal Harm',     'cw-animal-harm', true),
  ('CW: Child Harm',      'cw-child-harm', true)
on conflict (name) do nothing;
