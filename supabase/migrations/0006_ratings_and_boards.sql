-- Reader ratings + three separate boards. Safe to run more than once.
--
-- ============================================================
-- THE RULE BEHIND THIS WHOLE MIGRATION
-- ============================================================
-- There are three boards. Each stands on its own:
--
--   * Trending    — what is catching on right now (growth over 7 days)
--   * Top rated   — what is good (rating quality, shrunken toward the mean)
--   * Most read   — what is big (lifetime distinct readers)
--
-- A novel's position on one board must NEVER affect its position on
-- another. That's why:
--
--   - A rating's SCORE (the number) never enters trending. Only the ACT
--     of rating (distinct raters in the window, weighted the same as
--     comments) counts as a trending signal.
--   - Top rated ignores reads and growth entirely.
--   - Most read is a lifetime count and doesn't care how new or highly
--     rated a novel is.
--
-- If you find yourself considering "well let's also use the trending
-- number as a top-rated tiebreak" — don't. Keep them independent.
--
--
-- ============================================================
-- TOP RATED — HOW THE RANKING SCORE IS COMPUTED
-- ============================================================
-- Ranking by the raw average is a mistake. Three 10s would beat two
-- hundred 9s and the top of the board would fill with newborn novels
-- that got a burst of friend ratings.
--
-- Instead we shrink each novel's average toward the site-wide average,
-- with the pull proportional to how few ratings the novel has.
--
--   prior_m = 20                            -- how many "phantom" prior
--                                              ratings to add
--   site_avg = weighted mean of every avg_score across novels that clear
--              the 5-rating minimum. Weighted by each novel's rating
--              count so a novel with 500 ratings pulls the prior more
--              than a novel with 6.
--   novel's rank_score =
--       ( novel.rating_count * novel.avg_score
--       + prior_m           * site_avg
--       ) / ( novel.rating_count + prior_m )
--
-- Meaning:
--   * a novel with 5 ratings is pulled about 80% toward the site average
--     (5 vs 20).
--   * a novel with 200 ratings is pulled only about 9% toward it
--     (200 vs 220).
--
-- Novels with fewer than 5 ratings don't appear on Top rated AT ALL --
-- same "under-5" cliff we show elsewhere. See RATING_MIN_COUNT below.
--
--
-- ============================================================
-- MOST READ — WHY A LIFETIME COUNTER IS SAFE
-- ============================================================
-- Most read is distinct readers all-time, counting each person once for
-- the whole novel no matter how many chapters or days they came back
-- for. Both signed-in users and guest cookies count as readers, each
-- once. The novel's own author never counts.
--
-- A lifetime counter that goes up on every PAGE LOAD would be gameable
-- (refresh a page, watch the number tick). We reject that. Most read
-- reads from chapter_reads, which is already deduped by
-- record_chapter_read() at one row per (reader, chapter, day). So the
-- "number always grows" is safe here: it only grows when a NEW distinct
-- reader appears, not when an existing reader refreshes.
--
-- IF YOU'RE ADDING A LIFETIME VIEW COUNTER LATER, DON'T. Reads already
-- serve that purpose without being page-load-inflatable.
--
--
-- ============================================================
-- SHARED THRESHOLDS
-- ============================================================
-- Kept together and mirrored in TS at src/lib/rankings.ts so a change
-- happens in one place. Both files hardcode the same numbers.
--
--   RATING_MIN_COUNT      5    minimum ratings before an average is
--                              shown at all, and before a novel enters
--                              Top rated.
--   BOARD_MIN_QUALIFIERS  10   minimum number of novels on a board
--                              before the board is shown to readers.
--   PRIOR_M               20   phantom-prior weight for Top rated.
-- ============================================================

-- ---------------------------------------------------------------------------
-- novel_ratings
--   Signed-in-only. One row per reader per novel. The unique constraint
--   makes changing a rating an UPDATE; removing is a DELETE.
--
--   Author-cannot-rate-own-novel is enforced by the insert/update
--   policy AND doubly by a trigger that raises an exception, so the
--   rule can't be bypassed by a service_role-shaped call either.
-- ---------------------------------------------------------------------------
create table if not exists novel_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  novel_id uuid not null references novels (id) on delete cascade,
  -- Half-point steps in [0.5, 10]. Stored as numeric to sidestep float
  -- surprises when we sum for the average.
  score numeric(3,1) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, novel_id),
  constraint novel_ratings_half_step_range check (
    score >= 0.5 and score <= 10.0 and (score * 2) = floor(score * 2)
  )
);

create index if not exists novel_ratings_by_novel_idx on novel_ratings (novel_id);
create index if not exists novel_ratings_by_user_idx on novel_ratings (user_id);
create index if not exists novel_ratings_recent_idx on novel_ratings (novel_id, created_at desc);

drop trigger if exists novel_ratings_set_updated_at on novel_ratings;
create trigger novel_ratings_set_updated_at
  before update on novel_ratings
  for each row execute procedure set_updated_at();

-- Belt-and-braces: the RLS policy below already refuses author-of-own
-- inserts/updates, but the trigger raises a clear error regardless of
-- caller (service_role bypasses RLS entirely).
create or replace function novel_ratings_block_self_rate()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  v_author_id uuid;
begin
  select author_id into v_author_id from public.novels where id = new.novel_id;
  if v_author_id = new.user_id then
    raise exception 'authors cannot rate their own novels';
  end if;
  return new;
end;
$$;

revoke execute on function public.novel_ratings_block_self_rate() from public;
revoke execute on function public.novel_ratings_block_self_rate() from anon;
revoke execute on function public.novel_ratings_block_self_rate() from authenticated;

drop trigger if exists novel_ratings_block_self_rate_insert on novel_ratings;
create trigger novel_ratings_block_self_rate_insert
  before insert or update on novel_ratings
  for each row execute procedure novel_ratings_block_self_rate();

alter table novel_ratings enable row level security;

-- Anyone can see who rated what (used for author stats + rating page in
-- the future). The SCORE column is public; the rater's identity is
-- their public pen name via profiles.
drop policy if exists "novel ratings publicly readable" on novel_ratings;
create policy "novel ratings publicly readable"
  on novel_ratings for select
  using (true);

drop policy if exists "novel ratings insert: self, not own novel" on novel_ratings;
create policy "novel ratings insert: self, not own novel"
  on novel_ratings for insert
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from novels
      where novels.id = novel_id and novels.author_id = auth.uid()
    )
  );

drop policy if exists "novel ratings update: self, not own novel" on novel_ratings;
create policy "novel ratings update: self, not own novel"
  on novel_ratings for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and not exists (
      select 1 from novels
      where novels.id = novel_id and novels.author_id = auth.uid()
    )
  );

drop policy if exists "novel ratings delete: self" on novel_ratings;
create policy "novel ratings delete: self"
  on novel_ratings for delete
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- novel_rating_stats
--   Running totals per novel. Kept correct by triggers on
--   novel_ratings so the novel page never recomputes.
-- ---------------------------------------------------------------------------
create table if not exists novel_rating_stats (
  novel_id uuid primary key references novels (id) on delete cascade,
  rating_count integer not null default 0,
  rating_sum numeric(12,1) not null default 0,
  avg_score numeric(4,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table novel_rating_stats enable row level security;

drop policy if exists "novel rating stats publicly readable" on novel_rating_stats;
create policy "novel rating stats publicly readable"
  on novel_rating_stats for select
  using (true);

-- No write policies: the maintenance trigger runs SECURITY DEFINER and
-- is the only writer.

create or replace function bump_novel_rating_stats(
  p_novel_id uuid,
  p_delta_count integer,
  p_delta_sum numeric
) returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.novel_rating_stats (novel_id, rating_count, rating_sum, avg_score, updated_at)
  values (p_novel_id, 0, 0, 0, now())
  on conflict (novel_id) do nothing;

  update public.novel_rating_stats
    set rating_count = greatest(rating_count + p_delta_count, 0),
        rating_sum   = greatest(rating_sum + p_delta_sum, 0),
        avg_score    = case
                         when greatest(rating_count + p_delta_count, 0) = 0 then 0
                         else round(
                           greatest(rating_sum + p_delta_sum, 0)
                             / greatest(rating_count + p_delta_count, 0),
                           2)
                       end,
        updated_at = now()
    where novel_id = p_novel_id;
end;
$$;

revoke execute on function public.bump_novel_rating_stats(uuid, integer, numeric) from public;
revoke execute on function public.bump_novel_rating_stats(uuid, integer, numeric) from anon;
revoke execute on function public.bump_novel_rating_stats(uuid, integer, numeric) from authenticated;

create or replace function novel_ratings_after_insert()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.bump_novel_rating_stats(new.novel_id, 1, new.score);
  return new;
end;
$$;

create or replace function novel_ratings_after_update()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.novel_id <> old.novel_id then
    perform public.bump_novel_rating_stats(old.novel_id, -1, -old.score);
    perform public.bump_novel_rating_stats(new.novel_id, 1, new.score);
  elsif new.score <> old.score then
    perform public.bump_novel_rating_stats(new.novel_id, 0, new.score - old.score);
  end if;
  return new;
end;
$$;

create or replace function novel_ratings_after_delete()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.bump_novel_rating_stats(old.novel_id, -1, -old.score);
  return old;
end;
$$;

revoke execute on function public.novel_ratings_after_insert() from public, anon, authenticated;
revoke execute on function public.novel_ratings_after_update() from public, anon, authenticated;
revoke execute on function public.novel_ratings_after_delete() from public, anon, authenticated;

drop trigger if exists novel_ratings_after_insert_trg on novel_ratings;
create trigger novel_ratings_after_insert_trg
  after insert on novel_ratings
  for each row execute procedure novel_ratings_after_insert();

drop trigger if exists novel_ratings_after_update_trg on novel_ratings;
create trigger novel_ratings_after_update_trg
  after update on novel_ratings
  for each row execute procedure novel_ratings_after_update();

drop trigger if exists novel_ratings_after_delete_trg on novel_ratings;
create trigger novel_ratings_after_delete_trg
  after delete on novel_ratings
  for each row execute procedure novel_ratings_after_delete();

-- ---------------------------------------------------------------------------
-- top_rated_scores
--   Precomputed Bayesian-shrunken ranking. Refreshed by
--   refresh_top_rated_scores(). Only novels with rating_count >=
--   RATING_MIN_COUNT (5) are eligible.
-- ---------------------------------------------------------------------------
create table if not exists top_rated_scores (
  novel_id uuid primary key references novels (id) on delete cascade,
  rank_score numeric(6,4) not null,
  avg_score numeric(4,2) not null,
  rating_count integer not null,
  computed_at timestamptz not null default now()
);

create index if not exists top_rated_scores_order_idx
  on top_rated_scores (rank_score desc);

alter table top_rated_scores enable row level security;

drop policy if exists "top rated scores publicly readable" on top_rated_scores;
create policy "top rated scores publicly readable"
  on top_rated_scores for select
  using (true);

create or replace function refresh_top_rated_scores()
returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_prior_m integer := 20;
  v_min_count integer := 5;      -- mirrors RATING_MIN_COUNT
  v_site_avg numeric;
begin
  -- Site-wide weighted average across every novel that clears the
  -- minimum. Weighted by rating_count so a novel with 500 ratings
  -- influences the prior more than a novel with 6. Falls back to a
  -- neutral 7.0 when nothing yet clears the minimum (harmless: the
  -- board itself hides under the 10-qualifier rule anyway).
  select coalesce(
           sum(rating_sum) / nullif(sum(rating_count), 0),
           7.0
         )
    into v_site_avg
    from public.novel_rating_stats
    where rating_count >= v_min_count;

  delete from public.top_rated_scores;

  insert into public.top_rated_scores (novel_id, rank_score, avg_score, rating_count, computed_at)
  select
    novel_id,
    round(
      (rating_count * avg_score + v_prior_m * v_site_avg)
        / (rating_count + v_prior_m),
      4
    ) as rank_score,
    avg_score,
    rating_count,
    now()
  from public.novel_rating_stats
  where rating_count >= v_min_count;
end;
$$;

revoke execute on function public.refresh_top_rated_scores() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- most_read_scores
--   Lifetime distinct readers per novel. Author excluded. Populated by
--   refresh_most_read_scores(). Only ever grows in practice because the
--   input (chapter_reads) is already deduped by
--   record_chapter_read() at one row per (reader, chapter, day).
-- ---------------------------------------------------------------------------
create table if not exists most_read_scores (
  novel_id uuid primary key references novels (id) on delete cascade,
  distinct_readers integer not null,
  computed_at timestamptz not null default now()
);

create index if not exists most_read_scores_order_idx
  on most_read_scores (distinct_readers desc);

alter table most_read_scores enable row level security;

drop policy if exists "most read scores publicly readable" on most_read_scores;
create policy "most read scores publicly readable"
  on most_read_scores for select
  using (true);

create or replace function refresh_most_read_scores()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  delete from public.most_read_scores;

  insert into public.most_read_scores (novel_id, distinct_readers, computed_at)
  select
    cr.novel_id,
    count(distinct coalesce(cr.user_id::text, 'guest:' || cr.guest_key))::int as distinct_readers,
    now()
  from public.chapter_reads cr
  join public.novels n on n.id = cr.novel_id
  where cr.user_id is null or cr.user_id <> n.author_id
  group by cr.novel_id
  having count(distinct coalesce(cr.user_id::text, 'guest:' || cr.guest_key)) > 0;
end;
$$;

revoke execute on function public.refresh_most_read_scores() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- refresh_trending_scores (v3)
--   Same rules as v2 (see migration 0005 header comment for the
--   scoring formula, guest weighting, cap and author-exclusion), with
--   ONE addition: a "rated" signal — distinct people who rated the
--   novel in the 7-day window — at the same weight as comments (1.0).
--   The rating's SCORE never enters trending. Only the act of rating.
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
  delete from public.trending_scores;

  with
    signed_reads_now as (
      select cr.novel_id, count(distinct cr.user_id) as people
      from public.chapter_reads cr
      join public.novels n on n.id = cr.novel_id
      where cr.created_at >= now_start
        and cr.user_id is not null
        and cr.user_id <> n.author_id
      group by cr.novel_id
    ),
    signed_reads_prev as (
      select cr.novel_id, count(distinct cr.user_id) as people
      from public.chapter_reads cr
      join public.novels n on n.id = cr.novel_id
      where cr.created_at >= prev_start and cr.created_at < prev_end
        and cr.user_id is not null
        and cr.user_id <> n.author_id
      group by cr.novel_id
    ),
    guest_reads_now as (
      select novel_id, count(distinct guest_key) as people
      from public.chapter_reads
      where created_at >= now_start and guest_key is not null
      group by novel_id
    ),
    guest_reads_prev as (
      select novel_id, count(distinct guest_key) as people
      from public.chapter_reads
      where created_at >= prev_start and created_at < prev_end and guest_key is not null
      group by novel_id
    ),
    lib_now as (
      select le.novel_id, count(distinct le.user_id) as people
      from public.library_entries le
      join public.novels n on n.id = le.novel_id
      where le.created_at >= now_start
        and le.user_id <> n.author_id
      group by le.novel_id
    ),
    lib_prev as (
      select le.novel_id, count(distinct le.user_id) as people
      from public.library_entries le
      join public.novels n on n.id = le.novel_id
      where le.created_at >= prev_start and le.created_at < prev_end
        and le.user_id <> n.author_id
      group by le.novel_id
    ),
    reactions_now as (
      select c.novel_id, count(distinct r.user_id) as people
      from public.paragraph_reactions r
      join public.chapters c on c.id = r.chapter_id
      join public.novels n on n.id = c.novel_id
      where r.created_at >= now_start and r.user_id <> n.author_id
      group by c.novel_id
    ),
    reactions_prev as (
      select c.novel_id, count(distinct r.user_id) as people
      from public.paragraph_reactions r
      join public.chapters c on c.id = r.chapter_id
      join public.novels n on n.id = c.novel_id
      where r.created_at >= prev_start and r.created_at < prev_end and r.user_id <> n.author_id
      group by c.novel_id
    ),
    comments_now as (
      select c.novel_id, com.user_id
      from public.paragraph_comments com
      join public.chapters c on c.id = com.chapter_id
      join public.novels n on n.id = c.novel_id
      where com.created_at >= now_start and com.user_id <> n.author_id
      union
      select c.novel_id, cc.user_id
      from public.chapter_comments cc
      join public.chapters c on c.id = cc.chapter_id
      join public.novels n on n.id = c.novel_id
      where cc.created_at >= now_start and cc.user_id <> n.author_id
    ),
    comments_now_agg as (
      select novel_id, count(distinct user_id) as people from comments_now group by novel_id
    ),
    comments_prev as (
      select c.novel_id, com.user_id
      from public.paragraph_comments com
      join public.chapters c on c.id = com.chapter_id
      join public.novels n on n.id = c.novel_id
      where com.created_at >= prev_start and com.created_at < prev_end and com.user_id <> n.author_id
      union
      select c.novel_id, cc.user_id
      from public.chapter_comments cc
      join public.chapters c on c.id = cc.chapter_id
      join public.novels n on n.id = c.novel_id
      where cc.created_at >= prev_start and cc.created_at < prev_end and cc.user_id <> n.author_id
    ),
    comments_prev_agg as (
      select novel_id, count(distinct user_id) as people from comments_prev group by novel_id
    ),
    -- NEW in v3: distinct raters in each window. The score they gave
    -- is not used here. Only the act of rating.
    rated_now as (
      select nr.novel_id, count(distinct nr.user_id) as people
      from public.novel_ratings nr
      join public.novels n on n.id = nr.novel_id
      where nr.created_at >= now_start and nr.user_id <> n.author_id
      group by nr.novel_id
    ),
    rated_prev as (
      select nr.novel_id, count(distinct nr.user_id) as people
      from public.novel_ratings nr
      join public.novels n on n.id = nr.novel_id
      where nr.created_at >= prev_start and nr.created_at < prev_end and nr.user_id <> n.author_id
      group by nr.novel_id
    ),
    active_novels as (
      select novel_id from signed_reads_now
      union select novel_id from signed_reads_prev
      union select novel_id from guest_reads_now
      union select novel_id from guest_reads_prev
      union select novel_id from lib_now
      union select novel_id from lib_prev
      union select novel_id from reactions_now
      union select novel_id from reactions_prev
      union select novel_id from comments_now_agg
      union select novel_id from comments_prev_agg
      union select novel_id from rated_now
      union select novel_id from rated_prev
    ),
    signals as (
      select
        a.novel_id,
        coalesce(sn.people, 0)  as signed_reads_now,
        coalesce(sp.people, 0)  as signed_reads_prev,
        coalesce(gn.people, 0)  as guest_reads_now,
        coalesce(gp.people, 0)  as guest_reads_prev,
        coalesce(ln.people, 0)  as library_now,
        coalesce(lp.people, 0)  as library_prev,
        coalesce(xn.people, 0)  as reactions_now,
        coalesce(xp.people, 0)  as reactions_prev,
        coalesce(cn.people, 0)  as comments_now,
        coalesce(cp.people, 0)  as comments_prev,
        coalesce(rn.people, 0)  as rated_now,
        coalesce(rp.people, 0)  as rated_prev
      from active_novels a
      left join signed_reads_now sn on sn.novel_id = a.novel_id
      left join signed_reads_prev sp on sp.novel_id = a.novel_id
      left join guest_reads_now gn on gn.novel_id = a.novel_id
      left join guest_reads_prev gp on gp.novel_id = a.novel_id
      left join lib_now ln on ln.novel_id = a.novel_id
      left join lib_prev lp on lp.novel_id = a.novel_id
      left join reactions_now xn on xn.novel_id = a.novel_id
      left join reactions_prev xp on xp.novel_id = a.novel_id
      left join comments_now_agg cn on cn.novel_id = a.novel_id
      left join comments_prev_agg cp on cp.novel_id = a.novel_id
      left join rated_now rn on rn.novel_id = a.novel_id
      left join rated_prev rp on rp.novel_id = a.novel_id
    ),
    scored as (
      select
        novel_id,
        signed_reads_now, signed_reads_prev,
        guest_reads_now, guest_reads_prev,
        (signed_reads_now
          + least(0.4 * guest_reads_now, 2.0 + 1.5 * signed_reads_now)) as effective_reads_now,
        (signed_reads_prev
          + least(0.4 * guest_reads_prev, 2.0 + 1.5 * signed_reads_prev)) as effective_reads_prev,
        library_now, library_prev,
        reactions_now, reactions_prev,
        comments_now, comments_prev,
        rated_now, rated_prev
      from signals
    ),
    weighted as (
      select
        *,
        (4.0 * effective_reads_now
          + 2.0 * library_now
          + 1.0 * reactions_now
          + 1.0 * comments_now
          + 1.0 * rated_now) as weighted_now,
        (4.0 * effective_reads_prev
          + 2.0 * library_prev
          + 1.0 * reactions_prev
          + 1.0 * comments_prev
          + 1.0 * rated_prev) as weighted_prev
      from scored
    ),
    final as (
      select
        novel_id,
        (signed_reads_now + guest_reads_now)  as reads_now,
        (signed_reads_prev + guest_reads_prev) as reads_prev,
        library_now, library_prev,
        reactions_now, comments_now,
        weighted_now, weighted_prev,
        ((weighted_now + 3.0) / (weighted_prev + 3.0)) * sqrt(weighted_now) as score
      from weighted
      where weighted_now >= 3.0
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

revoke execute on function public.refresh_trending_scores() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Combined hourly refresh: run all three boards from one cron job.
-- We drop the trending-only job from migration 0004 and register a
-- single refresh_all_boards() job so nothing runs twice.
-- ---------------------------------------------------------------------------
create or replace function refresh_all_boards()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  perform public.refresh_trending_scores();
  perform public.refresh_top_rated_scores();
  perform public.refresh_most_read_scores();
end;
$$;

revoke execute on function public.refresh_all_boards() from public, anon, authenticated;

do $$
declare
  existing_jobid bigint;
begin
  -- Drop the older single-board job from migration 0004 if still present.
  select jobid into existing_jobid
    from cron.job where jobname = 'noveltrend_trending_hourly';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  -- Drop this migration's job too if it was already scheduled on a prior run.
  select jobid into existing_jobid
    from cron.job where jobname = 'noveltrend_boards_hourly';
  if existing_jobid is not null then
    perform cron.unschedule(existing_jobid);
  end if;

  perform cron.schedule(
    'noveltrend_boards_hourly',
    '5 * * * *',
    $cron$ select public.refresh_all_boards(); $cron$
  );
end $$;

-- Kick a full refresh once so the new boards aren't empty.
select public.refresh_all_boards();

-- ---------------------------------------------------------------------------
-- get_author_novel_stats (v2)
--   Extends the previous version with:
--     - avg_score, rating_count (from novel_rating_stats)
--     - score_histogram: int[10], counts per whole-number bucket, so
--       the author can see the shape of their scores at a glance
--       ([1] holds 0.5+1.0 ratings, [2] holds 1.5+2.0, ..., [10] holds
--       9.5+10.0)
--     - top_rated_rank, most_read_rank (positions on the respective
--       stored boards, or NULL when not present)
--
--   Trending rank is preserved unchanged.
-- ---------------------------------------------------------------------------
create or replace function get_author_novel_stats(p_novel_id uuid)
returns table (
  reads_7d integer,
  library_7d integer,
  reactions_7d integer,
  comments_7d integer,
  trending_rank integer,
  top_rated_rank integer,
  most_read_rank integer,
  rating_count integer,
  avg_score numeric,
  score_histogram integer[]
)
language plpgsql
security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  now_start timestamptz := now() - interval '7 days';
begin
  select author_id into v_author from public.novels where id = p_novel_id;
  if v_author is null or v_uid is null or v_uid <> v_author then
    return;
  end if;

  return query
    with
      reads as (
        select count(distinct coalesce(user_id::text, 'guest:' || guest_key))::int as n
        from public.chapter_reads
        where novel_id = p_novel_id
          and created_at >= now_start
          and (user_id is null or user_id <> v_author)
      ),
      lib as (
        select count(distinct user_id)::int as n
        from public.library_entries
        where novel_id = p_novel_id and created_at >= now_start and user_id <> v_author
      ),
      reacts as (
        select count(distinct r.user_id)::int as n
        from public.paragraph_reactions r
        join public.chapters c on c.id = r.chapter_id
        where c.novel_id = p_novel_id and r.created_at >= now_start and r.user_id <> v_author
      ),
      comms as (
        select count(distinct u)::int as n from (
          select com.user_id as u
          from public.paragraph_comments com
          join public.chapters c on c.id = com.chapter_id
          where c.novel_id = p_novel_id and com.created_at >= now_start and com.user_id <> v_author
          union
          select cc.user_id
          from public.chapter_comments cc
          join public.chapters c on c.id = cc.chapter_id
          where c.novel_id = p_novel_id and cc.created_at >= now_start and cc.user_id <> v_author
        ) x
      ),
      trending_ranked as (
        select r.rank_row from (
          select novel_id,
                 row_number() over (order by score desc, computed_at desc)::int as rank_row
          from public.trending_scores
        ) r where r.novel_id = p_novel_id
      ),
      top_rated_ranked as (
        select r.rank_row from (
          select novel_id,
                 row_number() over (order by rank_score desc, computed_at desc)::int as rank_row
          from public.top_rated_scores
        ) r where r.novel_id = p_novel_id
      ),
      most_read_ranked as (
        select r.rank_row from (
          select novel_id,
                 row_number() over (order by distinct_readers desc, computed_at desc)::int as rank_row
          from public.most_read_scores
        ) r where r.novel_id = p_novel_id
      ),
      rating_stats as (
        select rating_count, avg_score
        from public.novel_rating_stats where novel_id = p_novel_id
      ),
      hist as (
        select array(
          select coalesce(sum(case when ceil(score * 2.0)::int in (1, 2)  then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (3, 4)  then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (5, 6)  then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (7, 8)  then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (9, 10) then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (11, 12) then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (13, 14) then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (15, 16) then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (17, 18) then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
          union all
          select coalesce(sum(case when ceil(score * 2.0)::int in (19, 20) then 1 else 0 end), 0)::int from public.novel_ratings where novel_id = p_novel_id
        ) as bins
      )
    select
      reads.n,
      lib.n,
      reacts.n,
      comms.n,
      (select rank_row from trending_ranked),
      (select rank_row from top_rated_ranked),
      (select rank_row from most_read_ranked),
      coalesce((select rating_count from rating_stats), 0),
      coalesce((select avg_score from rating_stats), 0)::numeric,
      (select bins from hist)
    from reads, lib, reacts, comms;
end;
$$;

revoke execute on function public.get_author_novel_stats(uuid) from public;
grant execute on function public.get_author_novel_stats(uuid) to authenticated;
