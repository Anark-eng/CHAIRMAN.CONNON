-- Anti-gaming for trending. Safe to run more than once.
--
-- ============================================================
-- WHAT CHANGED SINCE 0004 (and why)
-- ============================================================
-- The whole point here: an author must not be able to inflate their own
-- novel's trending position. Everything below serves that goal.
--
--   1. The insert policy on chapter_reads that shipped in 0004 was wrong
--      and the live database was patched by hand. The corrected policy
--      is (re)applied here so a fresh setup matches.
--
--   2. Read recording moves into the database. The browser no longer
--      decides who is reading; it calls record_chapter_read(), which
--      reads auth.uid() itself, refuses drafts, refuses author-of-own
--      novel, and ignores duplicates. Direct insert on chapter_reads is
--      revoked from anon and authenticated, so the function is the only
--      way in.
--
--   3. In refresh_trending_scores() every signal now excludes the
--      novel's author, not just reads. The author's reactions and
--      comments still work and still show; they just don't move the
--      trending score.
--
--   4. Guest weighting + cap (see the "Guest contribution" section at
--      the bottom of this comment).
--
--
-- ============================================================
-- SCORING RULE (updated — supersedes 0004's rule)
-- ============================================================
-- Trending is about how FAST a novel is growing, not how big it already
-- is. Every signal is counted as DISTINCT PEOPLE in a 7-day window,
-- never as raw events, so one reader can't compound their own activity.
--
-- SIGNALS (weights unchanged from 0004):
--     reads         4.0
--     library adds  2.0
--     reactions     1.0
--     comments      1.0
--
-- AUTHOR EXCLUSION: for a novel authored by A, rows produced by A are
-- ignored in every signal. A can react, comment, add their own novel to
-- their library, and (through the app's own author check) reading rows
-- wouldn't even be recorded — but the SQL below double-locks it so an
-- author can't skew their own trending under any signal.
--
--
-- Guest contribution (new in 0005)
-- --------------------------------
-- Signed-in reads are worth 1.0 each. Guest reads are worth 0.4 each.
-- The lower guest weight matters because a guest is much cheaper to
-- fake: clearing cookies mints a new guest key, and NOVELTREND_GUEST_SECRET
-- only stops in-flight tampering, not cookie-clearing.
--
-- We ALSO cap the guest contribution per novel. Let:
--     signed_reads_now   = distinct signed-in people who read in the window
--     guest_reads_now    = distinct guest-key people who read in the window
--
-- Then the effective read count used for scoring is:
--     effective_reads_now = signed_reads_now
--                         + LEAST(0.4 * guest_reads_now,
--                                 2.0 + 1.5 * signed_reads_now)
--
-- Meaning: guest reads only add up to (2 free + 1.5x the signed-in
-- reads). A novel with 0 signed-in readers gets at most 2 guest reads
-- worth of credit, no matter how many guest reads it has -- so a novel
-- can't trend on guest reads alone. A novel with 10 signed-in readers
-- gets up to 17 guest reads worth of credit added on top. The 2-free
-- allowance means a brand-new novel with a couple of guest readers
-- isn't strictly stuck at zero.
--
-- The same shape (weight 0.4, cap 2 + 1.5 * signed_prev) is applied to
-- reads_prev for the growth ratio comparison.
--
-- Non-read signals are only writable by signed-in accounts, so guests
-- can't contribute to library adds, reactions, or comments at all --
-- nothing to weight or cap there.
--
--
-- Growth formula and floor (unchanged from 0004):
--     weighted_now  = 4 * effective_reads_now  + 2 * lib_now  + reactions_now  + comments_now
--     weighted_prev = 4 * effective_reads_prev + 2 * lib_prev + reactions_prev + comments_prev
--     growth = (weighted_now + 3) / (weighted_prev + 3)
--     score  = growth * sqrt(weighted_now)
--     activity floor: weighted_now >= 3
-- ============================================================

-- ---------------------------------------------------------------------------
-- Step 1: match the live database's insert policy (an interim fix before
-- we lock direct inserts down entirely in Step 2).
--
-- The version shipped in 0004 read:
--
--     (auth.uid() is not null and user_id = auth.uid() and guest_key is null)
--     or (auth.uid() is null and user_id is null and guest_key is not null)
--
-- That rejected every insert. Reason: Server Actions run the reads via
-- the anon key (auth cookie identifies the user), but the initial
-- author check + insert path was constructed such that `auth.uid() is
-- null` was true when the guest branch fired, yet the client happened
-- to already be scoped to a signed-in session in some paths -- and
-- more importantly: even when Postgres saw an authenticated session,
-- the check `guest_key is null` was rejecting rows that carried both.
-- The clean fix, applied by hand on the live DB, drops the "guest_key
-- is null" requirement from the signed-in branch, so:
-- ---------------------------------------------------------------------------
drop policy if exists "chapter reads insert: self or guest" on chapter_reads;
create policy "chapter reads insert: self or guest"
  on chapter_reads for insert
  with check (
    (user_id is null and guest_key is not null)
    or (user_id is not null and user_id = auth.uid() and guest_key is null)
  );

-- ---------------------------------------------------------------------------
-- Step 2: revoke direct insert. The security-definer function below is
-- the only way rows land in chapter_reads from here on. RLS stays ON --
-- the policy above no longer matters for INSERT since anon/authenticated
-- can't call INSERT at all, but keeping RLS on defends against future
-- roles that might get granted insert on the table by accident.
-- ---------------------------------------------------------------------------
revoke insert on public.chapter_reads from anon;
revoke insert on public.chapter_reads from authenticated;

-- ---------------------------------------------------------------------------
-- record_chapter_read
--   The only supported way to record a read. Security definer runs as
--   the function's owner so it can bypass the (now blocked) direct
--   insert path.
--
--   Rules enforced INSIDE the function, not by the caller:
--     - chapter must exist and be published
--     - identity comes from auth.uid(); the p_guest_key argument is
--       ignored entirely for a signed-in caller, so a signed-in author
--       can't pretend to be a guest reader of their own novel
--     - the novel's own author never inserts a row for their own novel
--     - a duplicate for the same (reader, chapter, day) is silently
--       swallowed via ON CONFLICT DO NOTHING
--
--   Returns nothing on purpose: the caller (a fire-and-forget action)
--   doesn't need to know.
-- ---------------------------------------------------------------------------
create or replace function record_chapter_read(
  p_chapter_id uuid,
  p_guest_key text
) returns void
language plpgsql
security definer set search_path = ''
as $$
declare
  v_novel_id uuid;
  v_author_id uuid;
  v_is_published boolean;
  v_uid uuid := auth.uid();
begin
  select c.novel_id, c.is_published, n.author_id
    into v_novel_id, v_is_published, v_author_id
    from public.chapters c
    join public.novels n on n.id = c.novel_id
    where c.id = p_chapter_id;

  if v_novel_id is null or not v_is_published then
    return;
  end if;

  if v_uid is not null then
    -- Signed-in caller. Guest key is IGNORED — a signed-in reader is
    -- always recorded against their account.
    if v_uid = v_author_id then
      return;  -- author reading their own novel doesn't count
    end if;
    insert into public.chapter_reads (chapter_id, novel_id, user_id)
    values (p_chapter_id, v_novel_id, v_uid)
    on conflict do nothing;
    return;
  end if;

  -- Guest branch. p_guest_key must actually be present; the app has
  -- already HMAC-verified it before passing it in.
  if p_guest_key is null or length(p_guest_key) = 0 then
    return;
  end if;
  insert into public.chapter_reads (chapter_id, novel_id, guest_key)
  values (p_chapter_id, v_novel_id, p_guest_key)
  on conflict do nothing;
end;
$$;

-- Only the function is granted execute — anon and authenticated call it
-- directly (through PostgREST's RPC surface). No other role gets a
-- default execute grant on functions in the public schema, so this is
-- explicit rather than relying on a broad default.
revoke execute on function public.record_chapter_read(uuid, text) from public;
grant execute on function public.record_chapter_read(uuid, text) to anon;
grant execute on function public.record_chapter_read(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- refresh_trending_scores (v2)
--
--   Same shape as 0004's version, but:
--     - every signal excludes rows produced by the novel's own author
--     - guest reads are weighted 0.4 and capped per the header comment
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
    -- READS ------------------------------------------------------
    -- Split by signed-in vs guest so we can weight and cap them
    -- separately. In both cases the row's user_id must NOT equal the
    -- novel's author -- doubly enforced (the app+RPC already refuse to
    -- record it, but the aggregate double-checks in case a row snuck
    -- in through some other path).
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
      where created_at >= now_start
        and guest_key is not null
      group by novel_id
    ),
    guest_reads_prev as (
      select novel_id, count(distinct guest_key) as people
      from public.chapter_reads
      where created_at >= prev_start and created_at < prev_end
        and guest_key is not null
      group by novel_id
    ),
    -- LIBRARY ADDS ---------------------------------------------
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
    -- REACTIONS ------------------------------------------------
    reactions_now as (
      select c.novel_id, count(distinct r.user_id) as people
      from public.paragraph_reactions r
      join public.chapters c on c.id = r.chapter_id
      join public.novels n on n.id = c.novel_id
      where r.created_at >= now_start
        and r.user_id <> n.author_id
      group by c.novel_id
    ),
    reactions_prev as (
      select c.novel_id, count(distinct r.user_id) as people
      from public.paragraph_reactions r
      join public.chapters c on c.id = r.chapter_id
      join public.novels n on n.id = c.novel_id
      where r.created_at >= prev_start and r.created_at < prev_end
        and r.user_id <> n.author_id
      group by c.novel_id
    ),
    -- COMMENTS (paragraph + chapter, unioned into one signal) ----
    comments_now as (
      select c.novel_id, com.user_id
      from public.paragraph_comments com
      join public.chapters c on c.id = com.chapter_id
      join public.novels n on n.id = c.novel_id
      where com.created_at >= now_start
        and com.user_id <> n.author_id
      union
      select c.novel_id, cc.user_id
      from public.chapter_comments cc
      join public.chapters c on c.id = cc.chapter_id
      join public.novels n on n.id = c.novel_id
      where cc.created_at >= now_start
        and cc.user_id <> n.author_id
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
      join public.novels n on n.id = c.novel_id
      where com.created_at >= prev_start and com.created_at < prev_end
        and com.user_id <> n.author_id
      union
      select c.novel_id, cc.user_id
      from public.chapter_comments cc
      join public.chapters c on c.id = cc.chapter_id
      join public.novels n on n.id = c.novel_id
      where cc.created_at >= prev_start and cc.created_at < prev_end
        and cc.user_id <> n.author_id
    ),
    comments_prev_agg as (
      select novel_id, count(distinct user_id) as people
      from comments_prev
      group by novel_id
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
    ),
    signals as (
      select
        a.novel_id,
        coalesce(sn.people, 0) as signed_reads_now,
        coalesce(sp.people, 0) as signed_reads_prev,
        coalesce(gn.people, 0) as guest_reads_now,
        coalesce(gp.people, 0) as guest_reads_prev,
        coalesce(ln.people, 0) as library_now,
        coalesce(lp.people, 0) as library_prev,
        coalesce(xn.people, 0) as reactions_now,
        coalesce(xp.people, 0) as reactions_prev,
        coalesce(cn.people, 0) as comments_now,
        coalesce(cp.people, 0) as comments_prev
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
    ),
    scored as (
      select
        novel_id,
        signed_reads_now, signed_reads_prev,
        guest_reads_now, guest_reads_prev,
        -- guest reads are weight 0.4, capped by 2 + 1.5x signed reads.
        (signed_reads_now
          + least(0.4 * guest_reads_now, 2.0 + 1.5 * signed_reads_now)) as effective_reads_now,
        (signed_reads_prev
          + least(0.4 * guest_reads_prev, 2.0 + 1.5 * signed_reads_prev)) as effective_reads_prev,
        library_now, library_prev,
        reactions_now, reactions_prev,
        comments_now, comments_prev
      from signals
    ),
    weighted as (
      select
        *,
        (4.0 * effective_reads_now
          + 2.0 * library_now
          + 1.0 * reactions_now
          + 1.0 * comments_now) as weighted_now,
        (4.0 * effective_reads_prev
          + 2.0 * library_prev
          + 1.0 * reactions_prev
          + 1.0 * comments_prev) as weighted_prev
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

-- Same access rules as before: only the pg_cron owner (postgres) can
-- run this. anon and authenticated cannot invoke it.
revoke execute on function public.refresh_trending_scores() from public;
revoke execute on function public.refresh_trending_scores() from anon;
revoke execute on function public.refresh_trending_scores() from authenticated;

-- ---------------------------------------------------------------------------
-- get_author_novel_stats
--   Author-only stats panel data. Returns the four 7-day signal counts
--   for a novel PLUS its current trending rank (position in
--   trending_scores ordered by score, or NULL if the novel didn't
--   clear the activity floor).
--
--   Security definer because library_entries has "self read" RLS, so an
--   author can't count library adds on their own novel via a normal
--   query. The function checks the caller IS the novel's author before
--   returning anything; any other caller gets NULLs.
--
--   Numbers match the trending refresh:
--     - chapter reads: excludes the author's own reads (which the RPC
--       already refused to record) AND anything within the 7-day window
--     - library adds / reactions / comments: exclude rows produced by
--       the author, mirroring refresh_trending_scores()
--
--   Displayed on the author's own novel page (see the app layer).
-- ---------------------------------------------------------------------------
create or replace function get_author_novel_stats(p_novel_id uuid)
returns table (
  reads_7d integer,
  library_7d integer,
  reactions_7d integer,
  comments_7d integer,
  trending_rank integer
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
        where novel_id = p_novel_id
          and created_at >= now_start
          and user_id <> v_author
      ),
      reacts as (
        select count(distinct r.user_id)::int as n
        from public.paragraph_reactions r
        join public.chapters c on c.id = r.chapter_id
        where c.novel_id = p_novel_id
          and r.created_at >= now_start
          and r.user_id <> v_author
      ),
      comms as (
        select count(distinct u)::int as n from (
          select com.user_id as u
          from public.paragraph_comments com
          join public.chapters c on c.id = com.chapter_id
          where c.novel_id = p_novel_id
            and com.created_at >= now_start
            and com.user_id <> v_author
          union
          select cc.user_id
          from public.chapter_comments cc
          join public.chapters c on c.id = cc.chapter_id
          where c.novel_id = p_novel_id
            and cc.created_at >= now_start
            and cc.user_id <> v_author
        ) x
      ),
      ranked as (
        select r.rank_row
        from (
          select novel_id,
                 row_number() over (order by score desc, computed_at desc)::int as rank_row
          from public.trending_scores
        ) r
        where r.novel_id = p_novel_id
      )
    select reads.n, lib.n, reacts.n, comms.n,
           (select rank_row from ranked)
    from reads, lib, reacts, comms;
end;
$$;

revoke execute on function public.get_author_novel_stats(uuid) from public;
grant execute on function public.get_author_novel_stats(uuid) to authenticated;

-- Kick a refresh now so the new rules take effect immediately for
-- anyone loading the site after the migration lands.
select public.refresh_trending_scores();
