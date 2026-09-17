-- Tag groups: a small fixed taxonomy so the filter sheet on Browse
-- can present tags under meaningful headings instead of one flat
-- alphabetical wall. Safe to run more than once.
--
-- ============================================================
-- WHY THIS SHAPE
-- ============================================================
-- Tags themselves stay open (an author still creates a new tag via
-- create_or_get_tag). What this migration adds is a "group" — one of
-- a fixed short list — so the filter sheet can render tags under
-- Characters, Tropes, Setting, Style & Pacing, Themes, Content
-- Warnings, Other. A tag with no group works everywhere it works
-- today; it just falls into "Other" in the sheet.
--
-- The group set is fixed here (CHECK constraint) rather than a
-- separate lookup table, because there are only seven values and
-- extending the list should be a deliberate migration, not something
-- authors can do freely. Genres and demographics are NOT tag groups —
-- they are separate concepts with their own tables/columns.

-- ---------------------------------------------------------------------------
-- 1. Add the group column with a CHECK on the fixed set.
-- ---------------------------------------------------------------------------
alter table tags
  add column if not exists tag_group text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tags_tag_group_check'
  ) then
    alter table tags
      add constraint tags_tag_group_check
      check (tag_group is null or tag_group in (
        'characters',
        'tropes',
        'setting',
        'style_pacing',
        'themes',
        'content_warnings',
        'other'
      ));
  end if;
end $$;

create index if not exists tags_tag_group_idx on tags (tag_group);

-- ---------------------------------------------------------------------------
-- 2. Sort the seeded tags into groups by meaning. Only touches rows
--    whose tag_group is still null, so re-running this migration
--    never overrides a change the site owner made by hand.
-- ---------------------------------------------------------------------------

-- Content Warnings: any tag whose name starts with "CW:". Explicit
-- prefix, no risk of miscategorising a themed tag with a similar name.
update tags
  set tag_group = 'content_warnings'
  where tag_group is null
    and name like 'CW:%';

-- Characters
update tags
  set tag_group = 'characters'
  where tag_group is null
    and slug in (
      'strong-lead', 'weak-to-strong', 'anti-hero',
      'overpowered-mc', 'underdog-mc', 'villainess', 'antihero',
      'beast-companion', 'necromancer', 'assassin-mc', 'rogue-mc',
      'female-lead', 'male-lead', 'ensemble-cast', 'morally-grey-cast',
      'lgbtq-cast'
    );

-- Setting
update tags
  set tag_group = 'setting'
  where tag_group is null
    and slug in (
      'school-life', 'post-apocalyptic', 'virtual-reality',
      'cultivation-society', 'dungeons', 'magic-academy',
      'modern-setting', 'medieval-setting', 'eastern-setting',
      'space-setting', 'ocean-setting', 'underworld', 'multiverse',
      'wasteland'
    );

-- Style & Pacing: prose style, POV, chapter cadence, structural moves.
update tags
  set tag_group = 'style_pacing'
  where tag_group is null
    and slug in (
      'slow-burn',
      'long-chapters', 'short-chapters', 'multi-pov',
      'first-person-pov', 'third-person-pov', 'non-linear-timeline',
      'slow-start', 'fast-pacing', 'genre-deconstruction'
    );

-- Themes: what the story explores, its tone/mood, its subject matter.
update tags
  set tag_group = 'themes'
  where tag_group is null
    and slug in (
      'romance-subplot', 'found-family', 'politics',
      'adventure', 'tragedy', 'dark',
      'revenge', 'redemption', 'crafting', 'cooking', 'music',
      'wholesome', 'grimdark', 'hopeful', 'bittersweet', 'cozy', 'bleak'
    );

-- Tropes: recurring narrative devices — reincarnation, systems, magic,
-- loops, kingdom-building, second chances, etc.
update tags
  set tag_group = 'tropes'
  where tag_group is null
    and slug in (
      'reincarnation', 'system', 'magic', 'isekai',
      'harem', 'time-travel',
      'second-chance', 'body-swap',
      'kingdom-building', 'base-building', 'time-loop'
    );

-- Everything else the site shipped that we haven't touched → Other.
-- Author-created tags that pre-date this migration also fall in here,
-- since they were made before groups existed.
update tags
  set tag_group = 'other'
  where tag_group is null;

-- ---------------------------------------------------------------------------
-- 3. Update create_or_get_tag to accept an optional group. New tags
--    without one fall into "other". Existing callers that pass only a
--    name still work — the DEFAULT keeps the function backwards
--    compatible so the migration can be applied before the app is
--    redeployed.
-- ---------------------------------------------------------------------------
create or replace function create_or_get_tag(p_name text, p_group text default null)
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
  v_group text;
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

  -- Validate the requested group against the CHECK constraint set.
  -- Anything unrecognised (or omitted) becomes "other".
  v_group := coalesce(p_group, 'other');
  if v_group not in (
    'characters', 'tropes', 'setting', 'style_pacing',
    'themes', 'content_warnings', 'other'
  ) then
    v_group := 'other';
  end if;

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

  if exists (
    select 1 from public.genres where public.normalise_tag_name(name) = v_norm
  ) then
    raise exception 'a genre with that name already exists';
  end if;
  if v_norm in ('shounen', 'shoujo', 'seinen', 'josei', 'general') then
    raise exception 'that name is reserved for a demographic';
  end if;

  v_slug := v_norm;
  insert into public.tags (name, slug, is_approved, tag_group)
  values (v_trimmed, v_slug, false, v_group)
  returning tags.id into v_id;

  return query
    select v_id, v_trimmed, v_slug, false, true;
end;
$$;

revoke execute on function public.create_or_get_tag(text, text) from public;
grant execute on function public.create_or_get_tag(text, text) to authenticated;

-- Keep the single-argument overload working too, so any code path
-- that still calls create_or_get_tag(p_name) doesn't need to change
-- to apply this migration.
create or replace function create_or_get_tag(p_name text)
returns table (id uuid, name text, slug text, is_approved boolean, was_created boolean)
language plpgsql
security definer set search_path = ''
as $$
begin
  return query select * from public.create_or_get_tag(p_name, null);
end;
$$;

revoke execute on function public.create_or_get_tag(text) from public;
grant execute on function public.create_or_get_tag(text) to authenticated;
