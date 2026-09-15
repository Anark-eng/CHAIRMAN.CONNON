# NovelTrend

A web-novel site: authors publish novels chapter by chapter, readers find
novels, read them, and keep them in a library.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS. Hosted on Vercel, so no
  custom server or background workers.
- Supabase for the Postgres database, email-and-password auth, and image
  storage (the `covers` bucket). Accessed through `@supabase/ssr`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  and (optional) `NEXT_PUBLIC_SITE_URL` — see `.env.example`. The app
  shows a plain setup message instead of crashing when the Supabase vars
  are missing (`src/app/layout.tsx`).

## Folder layout

```
src/
  app/                          routes (App Router)
    page.tsx                    Home
    browse/                     Browse (search, genre + tag filters)
    login/, signup/             Auth
    forgot-password/            Forgot-password form
    reset-password/             Set-new-password form (session-gated)
    auth/callback/route.ts      Handles confirmation & reset links
    auth/error/                 "Link expired" page
    profile/                    Author Mode toggle
    my-novels/                  An author's own novels
    library/                    A reader's saved novels
    novels/
      new/                      Create a novel
      [novelId]/                Novel page
        edit/                   Edit novel details
        chapters/
          new/                  Add a chapter
          [chapterId]/          Chapter reader
            edit/               Edit a chapter
            comments/           Chapter-wide comments (threaded, 1 level)
            paragraphs/[i]/     Per-paragraph discussion page
  components/                   UI building blocks (mostly client components)
    ParagraphReactions.tsx      Tap-to-react bar + counts under each paragraph
    ChapterCommentThread.tsx    One thread + inline reply form
    SpoilerComment.tsx          "Tap to reveal" — fetches body on demand
    CommentForm.tsx             Shared form used for para and chapter comments
  lib/
    supabase/                   Supabase client setup (browser, server, middleware)
                                 + database.types.ts (hand-written, matches the SQL)
    data/                       Read queries, used from Server Components
      comments.ts                Two-pass fetch: spoilers omit body entirely
      reactions.ts               Per-paragraph running totals
    actions/                    Server Actions (writes: auth, novels, chapters,
                                library, reading progress, profile, reactions,
                                comments)
    reading.ts                  Splits chapter text into indexed paragraphs
    reactions.ts                Reaction labels, emoji, thresholds
    siteUrl.ts                  Origin used for auth-email redirect links
supabase/
  migrations/
    0001_init.sql                Full initial schema + RLS + storage policies
    0002_security_fixes.sql      Matches the live DB's security patches
    0003_reactions_and_comments.sql
                                 Paragraph reactions, running-total counts,
                                 paragraph_comments, chapter_comments, RLS,
                                 indexes. Drafts stay private (see audit note).
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
- **The reader is the most-used screen.** Nothing there should shift,
  flicker, or need a second tap to work. Under-paragraph counts sit in a
  fixed-height slot so the paragraph body never moves when they appear or
  the reaction bar opens.
- **Migrations are safe to run twice.** They use `create if not exists`,
  `drop policy if exists`, and `create or replace function` where needed,
  so the owner can rerun them without breaking a working database.

## Planned features (not built yet)

- Trending: rank by how fast a novel is growing (recent reads/library
  adds), not by total reads.
- Blocked tags: a reader can block tags; blocked-tag novels are removed
  before any other filtering, on every list (Home, Browse, Library).
- "You're caught up" card with next-read suggestions, shown at the end of
  a novel's latest chapter.
