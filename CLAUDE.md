# NovelTrend

A web-novel site: authors publish novels chapter by chapter, readers find
novels, read them, and keep them in a library.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS. Hosted on Vercel, so no
  custom server or background workers.
- Supabase for the Postgres database, email-and-password auth, and image
  storage (the `covers` bucket). Accessed through `@supabase/ssr`.
- All ranking refresh (Trending, Top rated, Most read) runs inside the
  database itself via **pg_cron**, so no external scheduler is needed.
- Env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase.
    The app shows a plain setup message instead of crashing when these
    are missing (`src/app/layout.tsx`).
  - `NEXT_PUBLIC_SITE_URL` (optional) — origin for auth-email links.
  - `NOVELTREND_GUEST_SECRET` — server secret that HMAC-signs the
    guest-reader cookie. Without it, guest reads aren't recorded at all
    (better than recording a forgeable id). Never prefixed
    `NEXT_PUBLIC_` — must stay server-side. See `.env.example`.

## Folder layout

```
src/
  app/                          routes (App Router)
    page.tsx                    Home (Trending, Recently updated, Newly added)
    browse/                     Browse (search, genre + tag filters, sort)
    rankings/                   Trending, Top rated, Most read (three boards)
    updates/                    Novels in library with unread chapters
    login/, signup/             Auth
    forgot-password/            Forgot-password form
    reset-password/             Set-new-password form (session-gated)
    auth/callback/route.ts      Handles confirmation & reset links
    auth/error/                 "Link expired" page
    profile/                    Author Mode toggle + Blocked tags
    my-novels/                  An author's own novels
    library/                    A reader's saved novels
    novels/
      new/                      Create a novel
      [novelId]/                Novel page (rating + board positions + optional
                                 blocked-tag notice + author stats)
        edit/                   Edit novel details
        chapters/
          new/                  Add a chapter
          [chapterId]/          Chapter reader (records reads fire-and-forget)
            edit/               Edit a chapter
            comments/           Chapter-wide comments (threaded, 1 level)
            paragraphs/[i]/     Per-paragraph discussion page
  components/                   UI building blocks (mostly client components)
    ParagraphReactions.tsx      Tap-to-react bar + counts under each paragraph
    ChapterCommentThread.tsx    One thread + inline reply form
    SpoilerComment.tsx          "Tap to reveal" — fetches body on demand
    CommentForm.tsx             Shared form used for para and chapter comments
    BlockedTagsSection.tsx      Profile page tag-block toggles
    CaughtUpCard.tsx            End-of-novel card with 3 suggestions
    RatingControl.tsx           Half-step select + optimistic reconcile
    RatingSummary.tsx           "8.7 / 10 · 42 ratings", or the under-5 message
    BoardPositionRow.tsx        "#4 trending" / "#12 top rated" badges
    AuthorStatsPanel.tsx        Author-only stats incl. rating spread + ranks
  lib/
    supabase/                   Supabase client setup (browser, server, middleware)
                                 + database.types.ts (hand-written, matches the SQL)
    data/                       Read queries, used from Server Components
      comments.ts                Two-pass fetch: spoilers omit body entirely
      reactions.ts               Per-paragraph running totals
      blockedTags.ts             Blocklist load + excluded-novel-ids helper
      suggestions.ts             Post-chapter next-read picker
      library.ts                 Library + Updates queries
      ratings.ts                 Novel rating summaries + a reader's own rating
      boards.ts                  Three-board reads + per-novel positions
    actions/                    Server Actions (writes: auth, novels, chapters,
                                library, reading progress, profile, reactions,
                                comments, reads, blockedTags, ratings)
    reading.ts                  Splits chapter text into indexed paragraphs
    reactions.ts                Reaction labels, emoji, thresholds
    rankings.ts                 Shared thresholds (RATING_MIN_COUNT,
                                 BOARD_MIN_QUALIFIERS) + board labels
    siteUrl.ts                  Origin used for auth-email redirect links
    guestKey.ts                 HMAC-signed random-id cookie for logged-out readers
supabase/
  migrations/
    0001_init.sql                    Full initial schema + RLS + storage policies
    0002_security_fixes.sql          Matches the live DB's security patches
    0003_reactions_and_comments.sql  Reactions, counts, comments; drafts stay private
    0004_trending_and_blocks.sql     chapter_reads, blocked_tags, trending_scores,
                                     refresh_trending_scores(), pg_cron hourly job.
                                     Plain-English scoring rule at the top.
    0005_anti_gaming.sql             Anti-gaming pass:
                                     - record_chapter_read() SECURITY DEFINER
                                       function; direct INSERT on chapter_reads
                                       is revoked from anon/authenticated.
                                     - refresh_trending_scores() weights guest
                                       reads (0.4) and caps their share, and
                                       excludes the novel's own author from every
                                       signal.
                                     - get_author_novel_stats() SECURITY DEFINER.
    0006_ratings_and_boards.sql      Ratings + three-board system:
                                     - novel_ratings (0.5–10 half-steps, RLS +
                                       trigger blocks author-rates-own-novel).
                                     - novel_rating_stats (trigger-maintained
                                       running average + count).
                                     - top_rated_scores (Bayesian shrinkage
                                       toward site-wide weighted average).
                                     - most_read_scores (lifetime distinct
                                       readers, author excluded).
                                     - refresh_trending_scores() v3: adds a
                                       "rated" signal (weight = comment weight).
                                       Rating SCORE never enters trending.
                                     - refresh_all_boards() runs all three;
                                       pg_cron rescheduled to call it hourly.
                                     - get_author_novel_stats() v2: adds rating
                                       stats + score histogram + all three
                                       board ranks.
  seed.sql                       Starter genres and tags
```

## Rules for future work

- **One account per person.** Every account is a reader. Author Mode
  (`profiles.is_author`) is a switch on the profile page, not a separate
  account type or role.
- **No buttons or links that do nothing.** If a feature isn't built yet,
  leave the button/link out entirely rather than wiring it to a no-op.
- **Row Level Security is the source of truth.** Every table has RLS on.
  UI-level checks (e.g. redirecting non-owners away from an edit page) are a
  courtesy, not the real gate — don't remove the RLS policies and rely on
  the UI instead.
- **Paragraphs have a stable index** (`src/lib/reading.ts`). Reactions
  and paragraph comments key off this index. Don't renumber paragraphs
  based on anything that can shift between renders.
- **Spoilers are enforced in the query, not with CSS.** The reader-facing
  fetch in `src/lib/data/comments.ts` splits into two passes: first row
  metadata (id, author, spoiler flag), then bodies for the visible rows
  only. Never select `body` for a spoiler row until the reader explicitly
  asks for it via `revealParagraphComment` / `revealChapterComment`.
- **Reaction counts are running totals.** Reader queries hit
  `paragraph_reaction_counts`, never `paragraph_reactions` in aggregate.
  A trigger keeps the counts row in step with the reactions row.
- **The three boards are independent, always.** Trending answers what
  is catching on, Top rated answers what is good, Most read answers what
  is big. A novel's position on one board must never affect its position
  on another. That's why a rating's SCORE (the number a reader gave) is
  never used as a trending signal — only the act of rating is. If you
  find yourself wanting to combine board signals for a tiebreak, stop:
  independence is the whole point.
- **No lifetime view counter, ever.** A page-load counter was considered
  and deliberately rejected — refreshing a page would inflate it.
  Reads live in `chapter_reads`, deduped by `record_chapter_read()` at
  one row per (reader, chapter, day), and Most read reads from that.
  Anything that looks like "views += 1 on GET" is wrong.
- **Ranking is not computed on page load.** Pages read from
  `trending_scores`, `top_rated_scores`, `most_read_scores`. All three
  are refreshed hourly by `refresh_all_boards()` via pg_cron. The
  scoring rules (trending weights + growth + guest cap; top rated
  shrinkage; most read distinct-reader dedup) live as plain-English
  comments at the top of the migrations that own them (0004 → 0005 →
  0006) — tune numbers there without having to reread the SQL.
- **The author must not inflate their own boards.** Every signal in
  `refresh_trending_scores()` excludes rows produced by the novel's own
  author. `refresh_most_read_scores()` excludes them too. And an author
  is blocked from rating their own novel by both an RLS policy and a
  DB trigger, so they can't influence Top rated either. Their reactions
  and comments still work and still show — they just don't move the
  scores. Author sees their own novel's raw activity + all three ranks
  in an "Only you can see this" panel on the novel page.
- **Guest reads are weighted lower AND capped.** A guest read is worth
  0.4 of a signed-in read in trending; the total guest contribution per
  novel is capped at `2 + 1.5 × signed_reads`. Most read still counts
  guests as distinct readers (each once), so a genuinely popular novel
  that draws only guests still ranks on Most read — it just can't
  trend on guest reads alone. The `nt_guest` cookie is HMAC-signed with
  `NOVELTREND_GUEST_SECRET`.
- **Rating thresholds live in one place.** `src/lib/rankings.ts` holds
  `RATING_MIN_COUNT` (5) and `BOARD_MIN_QUALIFIERS` (10) and mirrors the
  numbers used in migration 0006's SQL. If you change one, change the
  other.
- **The rating control never goes inside the chapter reader.** Rating
  belongs on the novel page (and card, past the minimum). The reader is
  for reading; nothing extra goes there.
- **Blocked tags filter in the query, on every list.** Home, Trending,
  Browse, search results, Rankings boards, and post-chapter suggestions
  all take a `Set<string>` of blocked novel ids built via
  `loadBlocklist()` and subtract before hydrating cards. Never hide with
  CSS afterwards. A direct link to a blocked novel's page still works,
  with a quiet notice at the top.
- **Reads are recorded by the database, fire-and-forget from the
  browser.** The chapter reader calls `recordChapterRead()` in an effect
  but never waits for its result. The action is a thin RPC wrapper
  around `record_chapter_read()`: the DB function reads `auth.uid()`
  itself, refuses drafts, refuses the novel's own author, and ignores a
  duplicate for that reader/day — the browser can't lie about identity.
  Direct INSERT on `chapter_reads` is revoked from anon and
  authenticated, so the function is the only way in.
- **The reader is the most-used screen.** Nothing there should shift,
  flicker, or need a second tap to work. Under-paragraph counts sit in a
  fixed-height slot so the paragraph body never moves when they appear
  or the reaction bar opens. Rating controls have optimistic apply +
  rollback so a phone tap feels instant.
- **Migrations are safe to run twice.** They use `create if not exists`,
  `drop policy if exists`, `create or replace function`, and unschedule
  existing pg_cron jobs before rescheduling.
- **Reading progress is the single source of truth for "unread".** Both
  the Library "new" badge and the Updates page derive unread state from
  the reader's last-read chapter order — don't invent a second store.

## Planned features (not built yet)

- (Nothing outstanding from the current task set.)
