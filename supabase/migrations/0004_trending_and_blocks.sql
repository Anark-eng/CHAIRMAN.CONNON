-- Reads, blocked tags, and trending. Safe to run more than once.
--
-- ============================================================
-- HOW TRENDING IS SCORED (read this if you want to tune it)
-- ============================================================
-- Trending is about how FAST a novel is growing, not how big it already
-- is. A month-old novel that gained 200 readers this week should beat
-- one with 50,000 lifetime readers that gained 30.
--
-- Every signal is counted as DISTINCT PEOPLE in a 7-day window, never
-- as raw events, so one reader can't compound their own activity:
--
--   * a read           = one reader who read at least one chapter of the
--                        novel in the window. chapter_reads is already
--                        deduped one per reader per chapter per day; the
--                        scoring function then collapses further to one
--                        per reader per novel.
--   * a library add    = one reader who added the novel to their library.
--   * a reaction       = one reader who left at least one paragraph
--                        reaction anywhere in the novel.
--   * a comment        = one reader who left at least one paragraph or
--                        chapter comment anywhere in the novel.
--
-- Guests count as distinct people too, keyed by their random cookie id.
--
-- Weights (reads count most, library adds next):
--     reads         4.0
--     library adds  2.0
--     reactions     1.0
--     comments      1.0
--
-- For each novel we compute:
--     weighted_now  = 4*reads_now  + 2*lib_now  + reactions_now  + comments_now
--     weighted_prev = 4*reads_prev + 2*lib_prev + reactions_prev + comments_prev
--
-- The score is:
--     growth = (weighted_now + 3) / (weighted_prev + 3)
--     score  = growth * sqrt(weighted_now)
--
-- The +3 in the growth ratio dampens explosive ratios: a novel jumping
-- from 0 to 3 gets growth ~2, not infinity. A novel jumping from 1000
-- to 3000 still gets growth ~3. This is what treats brand-new novels
-- fairly without letting them dominate on a two-reader head start.
--
-- Multiplying by sqrt(weighted_now) is the "volume matters, but doesn't
-- dominate" step: a busy novel with 2x growth beats an almost-quiet
-- novel with 10x growth.
--
-- ACTIVITY FLOOR: novels with weighted_now < 3 are excluded entirely --
-- a novel that only two people touched can never top the chart.
--
-- Refresh: refresh_trending_scores() runs hourly via pg_cron (see the
-- bottom of this file). Never computed on page load.
-- ============================================================

create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- chapter_reads
--   One row per (reader, chapter, day). Logged-in readers use user_id;
--   guests use guest_key (a random id kept in a first-party cookie).
--   Never counts the novel's own author reading their own novel — the
--   caller (src/lib/actions/reads.ts) skips that case; RLS enforces
--   `user_id = auth.uid()` for logged-in inserts as a courtesy.
--
--   Nothing on the reader page waits for this table. The chapter_read
--   insert is fire-and-forget from the reader's browser via a server
--   action; if it fails, the chapter still shows.
-- ---------------------------------------------------------------------------
create table if not exists chapter_reads (
  id uuid primary key default gen_random_uuid(),
  chapter_id uuid not null references chapters (id) on delete cascade,
  novel_id uuid not null references novels (id) on delete cascade,
  user_id uuid references profiles (id) on delete cascade,
  guest_key text,
  read_date date not null default (now() at time zone 'utc')::date,
  created_at timestamptz not null default now(),
  -- Every row has a way to identify the reader.
  constraint chapter_reads_has_reader check (user_id is not null or guest_key is not null),
  -- Never mix: a logged-in row has no guest_key, and vice versa.
  constraint chapter_reads_one_id check (
    (user_id is not null and guest_key is null)
    or (user_id is null and guest_key is not null)
  )
);

-- One row per reader per chapter per day. The COALESCE gives a single
-- "reader identifier" for the unique index.
create unique index if not exists chapter_reads_dedup_idx
  on chapter_reads (
    chapter_id,
    coalesce(user_id::text, 'guest:' || guest_key),
    read_date
  );

create index if not exists chapter_reads_by_novel_recent_idx
  on chapter_reads (novel_id, created_at desc);

alter table chapter_reads enable row level security;

-- Insert: logged-in readers can only write rows for themselves; guests
-- can write rows with a guest_key and no user_id.
drop policy if exists "chapter reads insert: self or guest" on chapter_reads;
create policy "chapter reads insert: self or guest"
  on chapter_reads for insert
  with check (
    (auth.uid() is not null and user_id = auth.uid() and guest_key is null)
    or (auth.uid() is null and user_id is null and guest_key is not null)
  );

-- Read: nobody except the novel's author can read the raw rows. The
-- app never needs to read them from the client side; trending consumes
-- them through the refresh function (security definer).
drop policy if exists "chapter reads read: novel author" on chapter_reads;
create policy "chapter reads read: novel author"
  on chapter_reads for select
  using (
    exists (
      select 1 from novels
      where novels.id = chapter_reads.novel_id
        and novels.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- blocked_tags
--   A reader's own list of tags they don't want to see. Filtered in
--   every list query (Home, Trending, Browse, search, suggestions) --
--   never hidden with CSS after the fact.
-- ---------------------------------------------------------------------------
create table if not exists blocked_tags (
  user_id uuid not null references profiles (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, tag_id)
);

create index if not exists blocked_tags_by_user_idx on blocked_tags (user_id);

alter table blocked_tags enable row level security;

drop policy if exists "blocked tags read: self" on blocked_tags;
create policy "blocked tags read: self"
  on blocked_tags for select
  using (auth.uid() = user_id);

drop policy if exists "blocked tags insert: self" on blocked_tags;
create policy "blocked tags insert: self"
  on blocked_tags for insert
  with check (auth.uid() = user_id);

drop policy if exists "blocked tags delete: self" on blocked_tags;
create policy "blocked tags delete: self"
  on blocked_tags for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- trending_scores
--   One row per novel that clears the activity floor. Populated by
--   refresh_trending_scores() (below). Public-readable so any list
--   page can join against it without a special permission.
-- ---------------------------------------------------------------------------
create table if not exists trending_scores (
  novel_id uuid primary key references novels (id) on delete cascade,
  score double precision not null,
  weighted_now double precision not null,
  weighted_prev double precision not null,
  reads_now integer not null default 0,
  reads_prev integer not null default 0,
  library_now integer not null default 0,
  library_prev integer not null default 0,
  reactions_now integer not null default 0,
  comments_now integer not null default 0,
  computed_at timestamptz not null default now()
);

create index if not exists trending_scores_by_score_idx
  on trending_scores (score desc);

alter table trending_scores enable row level security;

drop policy if exists "trending scores are publicly readable" on trending_scores;
create policy "trending scores are publicly readable"
  on trending_scores for select
  using (true);

-- No write policies: the refresh function (security definer) is the only
-- writer.

-- ---------------------------------------------------------------------------
-- refresh_trending_scores()
--   Recomputes every novel's score from scratch. Not incremental --
--   simpler to reason about and cheap enough at any sensible catalog
--   size to run every hour.
-- ---------------------------------------------------------------------------
create or replace function refresh_trending_scores()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  now_start timestamptz := now() - interval '7 days';
  prev_start timestamptz := now() - interval '14 days';
  prev_end timestamptz := now() - interval '7 days';
begin
  -- Replace the whole table atomically for a consistent snapshot.
  delete from public.trending_scores;

  with
    -- distinct people who read at least one chapter of the novel in the
    -- window; the COALESCE gives one identifier per person (guest or user).
    reads_now as (
      select novel_id,
             count(distinct coalesce(user_id::text, 'guest:' || guest_key)) as people
      from public.chapter_reads
      where created_at >= now_start
      group by novel_id
    ),
    reads_prev as (
      select novel_id,
             count(distinct coalesce(user_id::text, 'guest:' || guest_key)) as people
      from public.chapter_reads
      where created_at >= prev_start and created_at < prev_end
      group by novel_id
    ),
    lib_now as (
      select novel_id, count(distinct user_id) as people
      from public.library_entries
      where created_at >= now_start
      group by novel_id
    ),
    lib_prev as (
      select novel_id, count(distinct user_id) as people
      from public.library_entries
      where created_at >= prev_start and created_at < prev_end
      group by novel_id
    ),
    -- reactions live per-chapter; join up to a novel_id.
    reactions_now as (
      select c.novel_id,
             count(distinct r.user_id) as people
      from public.paragraph_reactions r
      join public.chapters c on c.id = r.chapter_id
      where r.created_at >= now_start
      group by c.novel_id
    ),
    reactions_prev as (
      select c.novel_id,
             count(distinct r.user_id) as people
      from public.paragraph_reactions r
      join public.chapters c on c.id = r.chapter_id
      where r.created_at >= prev_start and r.created_at < prev_end
      group by c.novel_id
    ),
    -- paragraph + chapter comments, unioned into one "commented" signal.
    comments_now as (
      select c.novel_id, com.user_id
      from public.paragraph_comments com
      join public.chapters c on c.id = com.chapter_id
      where com.created_at >= now_start
      union
      select c.novel_id, cc.user_id
      from public.chapter_comments cc
      join public.chapters c on c.id = cc.chapter_id
      where cc.created_at >= now_start
    ),
    comments_now_agg as (
      select novel_id, count(distinct user_id) as people
      from comments_now
      group by novel_id
    ),
    comments_prev as (
      select c.novel_id, com.user_id
      from public.paragraph_comments com
      join public.chapters c on c.id = com.chapter_id
      where com.created_at >= prev_start and com.created_at < prev_end
      union
      select c.novel_id, cc.user_id
      from public.chapter_comments cc
      join public.chapters c on c.id = cc.chapter_id
      where cc.created_at >= prev_start and cc.created_at < prev_end
    ),
    comments_prev_agg as (
      select novel_id, count(distinct user_id) as people
      from comments_prev
      group by novel_id
    ),
    -- every novel that shows up in any signal in either window.
    active_novels as (
      select novel_id from reads_now
      union select novel_id from reads_prev
      union select novel_id from lib_now
      union select novel_id from lib_prev
      union select novel_id from reactions_now
      union select novel_id from reactions_prev
      union select novel_id from comments_now_agg
      union select novel_id from comments_prev_agg
    ),
    scored as (
      select
        a.novel_id,
        coalesce(rn.people, 0) as reads_now,
        coalesce(rp.people, 0) as reads_prev,
        coalesce(ln.people, 0) as library_now,
        coalesce(lp.people, 0) as library_prev,
        coalesce(xn.people, 0) as reactions_now,
        coalesce(xp.people, 0) as reactions_prev,
        coalesce(cn.people, 0) as comments_now,
        coalesce(cp.people, 0) as comments_prev,
        -- WEIGHTS: reads 4, library adds 2, reactions 1, comments 1
        (4.0 * coalesce(rn.people, 0)
          + 2.0 * coalesce(ln.people, 0)
          + 1.0 * coalesce(xn.people, 0)
          + 1.0 * coalesce(cn.people, 0)) as weighted_now,
        (4.0 * coalesce(rp.people, 0)
          + 2.0 * coalesce(lp.people, 0)
          + 1.0 * coalesce(xp.people, 0)
          + 1.0 * coalesce(cp.people, 0)) as weighted_prev
      from active_novels a
      left join reads_now rn on rn.novel_id = a.novel_id
      left join reads_prev rp on rp.novel_id = a.novel_id
      left join lib_now ln on ln.novel_id = a.novel_id
      left join lib_prev lp on lp.novel_id = a.novel_id
      left join reactions_now xn on xn.novel_id = a.novel_id
      left join reactions_prev xp on xp.novel_id = a.novel_id
      left join comments_now_agg cn on cn.novel_id = a.novel_id
      left join comments_prev_agg cp on cp.novel_id = a.novel_id
    ),
    final as (
      select
        novel_id,
        reads_now, reads_prev,
        library_now, library_prev,
        reactions_now, comments_now,
        weighted_now, weighted_prev,
        -- Score formula, matching the header comment.
        ((weighted_now + 3.0) / (weighted_prev + 3.0)) * sqrt(weighted_now) as score
      from scored
      where weighted_now >= 3.0  -- activity floor
    )
  insert into public.trending_scores (
    novel_id, score, weighted_now, weighted_prev,
    reads_now, reads_prev, library_now, library_prev,
    reactions_now, comments_now, computed_at
  )
  select novel_id, score, weighted_now, weighted_prev,
         reads_now, reads_prev, library_now, library_prev,
         reactions_now, comments_now, now()
  from final;
end;
$$;

revoke execute on function public.refresh_trending_scores() from public;
revoke execute on function public.refresh_trending_scores() from anon;
revoke execute on function public.refresh_trending_scores() from authenticated;

-- ---------------------------------------------------------------------------
-- Schedule the hourly refresh with pg_cron.
--
-- If a job named 'noveltrend_trending_hourly' already exists from a
-- previous run, unschedule it first so this migration stays idempotent.
-- ---------------------------------------------------------------------------
do $$
declare
  existing_jobid bigint;
begin
  select jobid into existing_jobid
    from cron.job where jobname = 'noveltrend_trending_hourly';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  perform cron.schedule(
    'noveltrend_trending_hourly',
    '5 * * * *',  -- 5 minutes past every hour
    $cron$ select public.refresh_trending_scores(); $cron$
  );
end $$;

-- Populate once immediately so the first hour after applying the
-- migration isn't empty.
select public.refresh_trending_scores();
