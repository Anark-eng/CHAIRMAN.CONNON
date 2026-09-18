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
    profile/                    Public profile fields (pen name, Author Mode,
                                 avatar, bio, links)
    settings/                   Private account settings (email, password,
                                 blocked tags, data export, delete account)
    authors/[authorId]/         Public author profile (pen name + avatar +
                                 bio + links + published novels; "This
                                 account is no longer available" when the
                                 account is soft-deleted)
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
            paragraphs/[pid]/   Per-paragraph discussion page (keyed on pid)
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
    reading.ts                  Legacy paragraph splitter (kept for fallback
                                 on chapters that haven't been touched since
                                 the 0008 backfill; chapter-content is the
                                 canonical path now)
    chapterContent.ts           Paragraph type (pid + kind + runs), markdown-
                                 lite parser + serialiser, paste sanitiser,
                                 word/char/reading stats, assignPids (diff by
                                 text so reactions and comments follow
                                 unchanged paragraphs across an edit)
    reactions.ts                Reaction labels, emoji, thresholds
    rankings.ts                 Shared thresholds (RATING_MIN_COUNT,
                                 BOARD_MIN_QUALIFIERS) + board labels
    classification.ts           Shared classification constants
                                 (MAX_GENRES_PER_NOVEL,
                                 TAG_APPROVAL_MIN_NOVELS,
                                 MAX_TAG_NAME_LENGTH, DEMOGRAPHICS list,
                                 TAG_GROUPS fixed set + labels,
                                 normaliseTagName mirror of the SQL)
    browseSort.ts               SearchSort type + SEARCH_SORTS options
                                 (client-safe; the data helper re-exports them)
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
    0008_editor.sql                  Chapter editor upgrade:
                                     - chapters.paragraphs (jsonb array of
                                       {pid, kind, runs}) becomes the source
                                       of truth for a chapter's content;
                                       chapters.body kept in sync as a
                                       plain-text fallback.
                                     - paragraph_reactions / reaction_counts /
                                       comments keyed on paragraph_pid; the
                                       old paragraph_index columns become
                                       legacy. Backfill assigns fresh pids to
                                       every existing chapter's paragraphs
                                       and rewrites every existing reaction
                                       and comment onto the pid for the
                                       position it currently references —
                                       nothing is dropped.
                                     - volumes table + chapters.volume_id.
                                     - chapters.publish_at + author_note_top
                                       + author_note_bottom.
                                     - publish_scheduled_chapters() flips
                                       scheduled chapters live; a new pg_cron
                                       job runs it every 5 minutes.
    0007_classification.sql          Novel classification rebuild:
                                     - novels.demographic (fixed 5 values).
                                     - novel_genres many-to-many, cap 9 via
                                       trigger; drops novels.genre_id after
                                       migrating each existing value into
                                       novel_genres.
                                     - Widened genre list.
                                     - tags.is_approved + normalised-name
                                       unique index.
                                     - create_or_get_tag() SECURITY DEFINER
                                       function: trims, refuses empty/punct-
                                       only, shadow-checks against genres and
                                       demographics, resolves near-duplicates
                                       to the existing tag by normalised
                                       match, new tags start unapproved.
                                     - Trigger auto-approves a tag once it's
                                       on TAG_APPROVAL_MIN_NOVELS distinct
                                       novels.
                                     - Widened starter tag pool (subject,
                                       story shape, cast, setting, tone,
                                       content warnings) — all pre-approved.
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
    0010_profiles_and_account_deletion.sql
                                     Public-profile fields + soft-delete flow:
                                     - profiles.avatar_url, bio (plain text),
                                       links (jsonb array of {label, url}).
                                     - avatars storage bucket + policies
                                       (public read, owner-only write, path
                                       keyed on {user_id}/…).
                                     - Reserved "Deleted user" identity at
                                       00000000-0000-0000-0000-000000000001
                                       (real auth.users row, unusable
                                       password, RFC-2606 .invalid email).
                                     - profiles.deleted_at + deletion_choice
                                       (keep_work | remove_work).
                                     - soft_delete_account(choice),
                                       cancel_account_deletion(),
                                       finalize_account_deletions() —
                                       hourly pg_cron. 30-day grace period.
                                     - RLS widened to hide novels + chapters
                                       from readers when the author's
                                       profile is soft-deleted (author still
                                       sees their own).
    0009_tag_groups.sql              Tag taxonomy grouping:
                                     - tags.tag_group (text, CHECK on a fixed
                                       set of 7: characters, tropes, setting,
                                       style_pacing, themes, content_warnings,
                                       other).
                                     - Backfill: seeded tags are sorted into
                                       groups by meaning; CW: tags to
                                       content_warnings, everything else by
                                       slug list. Untouched author tags fall
                                       into "other".
                                     - create_or_get_tag(name, group?) — new
                                       optional argument; unknown/missing
                                       group becomes "other". Single-arg
                                       overload preserved so a redeploy isn't
                                       needed to apply the migration.
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
- **Paragraphs have a stable pid, not a position.** Every paragraph on
  a chapter has a UUID (`pid`) stored on `chapters.paragraphs` (jsonb).
  `paragraph_reactions`, `paragraph_reaction_counts` and
  `paragraph_comments` all key on `paragraph_pid`. The editor's save
  path (see `src/lib/actions/chapters.ts` → `persistChapter`) reuses an
  existing paragraph's pid whenever its plain text matches, so
  reactions and comments follow a paragraph across an edit. A
  genuinely new paragraph gets a fresh pid; a genuinely deleted one is
  either dropped silently (nothing on it) or the editor warns the
  author before saving (`droppedPids` + the confirm-drop flow). If you
  ever key reactions or comments on paragraph index again, you'll silently
  attach them to the wrong paragraph the next time an author edits.
- **Content storage is a typed JSON tree, never HTML.**
  `chapters.paragraphs` is `[{pid, kind, runs}]` (kinds:
  `p | h | quote | break`; runs: `{t, b?, i?}`). The reader walks that
  typed tree and emits only `<p>`, `<h3>`, `<blockquote>`, `<hr>`,
  `<strong>`, `<em>` — no `dangerouslySetInnerHTML` anywhere. Pasted
  HTML from Word / Google Docs is sanitised into markdown-lite on the
  way in (`pasteHtmlToMarkdown`) and re-parsed to that same JSON
  structure on save (`parseMarkdownParagraphs` + `assignPids`). Reader
  fallback: if `paragraphs` is empty (a legacy chapter that hasn't been
  re-saved since the 0008 backfill), the app splits `chapters.body` on
  blank lines and assigns fresh pids on the fly.
- **Scheduled publishes run in the database, not on a page load.**
  Setting `chapters.publish_at` future keeps the chapter invisible
  until `publish_scheduled_chapters()` flips it, scheduled every 5
  minutes via pg_cron. `published_at` is set to the moment it actually
  went live so Recently Updated is honest.
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
- **Classification thresholds live in one place too.** `src/lib/classification.ts`
  holds `MAX_GENRES_PER_NOVEL` (9), `TAG_APPROVAL_MIN_NOVELS` (3),
  `MAX_TAG_NAME_LENGTH` (40), the fixed `DEMOGRAPHICS` list, `TAG_GROUPS`
  (7 fixed values: characters, tropes, setting, style_pacing, themes,
  content_warnings, other), and the same normalisation as the DB's
  `normalise_tag_name()`. Mirrored in migrations 0007 + 0009. Change
  both.
- **Tag groups are fixed, not extensible.** The seven-value set is
  enforced by a CHECK constraint on `tags.tag_group` and mirrored in
  `TAG_GROUPS`. Genres and demographics are NOT tag groups — they live
  on their own columns. An author-created tag with no group falls
  into "other"; it still works everywhere, it's just filed under
  Other in Browse's filter sheet.
- **Genres are many per novel, demographics are one.** A novel carries
  up to 9 genres through `novel_genres`. `novels.demographic` is a
  single text column with a check constraint on the fixed 5 values.
  Choosing a genre in Browse must find every novel carrying it (join
  through `novel_genres`, not a single-column equality). Authors can't
  extend the demographic list; a database CHECK constraint enforces this.
- **Tags are open, but discovery is gated.** Authors can create tags
  from the novel form through the `create_or_get_tag()` SECURITY DEFINER
  function. That function does the trim/length/non-empty checks, resolves
  near-duplicates via normalised name (case, spacing, punctuation
  ignored) to an existing tag, and refuses names that shadow a genre or
  demographic. A NEW tag starts `is_approved = false` — it works on the
  novel and shows on its page immediately, but it does NOT appear in
  Browse's filter list or the blocked-tags picker until at least
  `TAG_APPROVAL_MIN_NOVELS` distinct novels use it (auto-promoted by a
  trigger) or the site owner sets `is_approved = true` by hand. This
  matters because readers block tags to avoid content they don't want;
  a flood of synonyms would leak unwanted content past a reader's block.
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
- **Account deletion has a real cascade problem; don't reinvent the
  solution.** `novels.author_id -> profiles(id) ON DELETE CASCADE` and
  `profiles.id -> auth.users(id) ON DELETE CASCADE` mean a naive delete
  would take every novel and chapter with it. Migration 0010 solves
  this with a two-phase flow (soft mark + finalize after 30 days) and
  a reserved "Deleted user" profile at
  `00000000-0000-0000-0000-000000000001` — imported via
  `RESERVED_DELETED_USER_ID` in `src/lib/data/profile.ts`. On
  finalize, `keep_work` reassigns novels + ratings + comments to
  reserved before the `auth.users` delete cascade fires, so
  `remove_work` can rely on the same cascade to take everything
  down cleanly. Never null out `novels.author_id` — the trending
  refresh compares each signal's user against the novel's author to
  exclude them, and a null comparison breaks that exclusion silently.
- **Reader-private data stays private.** No setting exposes a reader's
  library, reading progress, ratings or reading history to another
  reader. If a future task adds a "public reading shelf", it needs its
  own opt-in and its own RLS.

## Planned features (not built yet)

- (Nothing outstanding from the current task set.)
