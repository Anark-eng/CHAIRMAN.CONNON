# NovelTrend

A web-novel site: authors publish novels chapter by chapter, readers find
novels, read them, and keep them in a library.

## Stack

- Next.js (App Router) + TypeScript + Tailwind CSS. Hosted on Vercel, so no
  custom server or background workers.
- Supabase for the Postgres database, email-and-password auth, and image
  storage (the `covers` bucket). Accessed through `@supabase/ssr`.
- Env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see
  `.env.example`). The app shows a plain setup message instead of crashing
  when these are missing (`src/app/layout.tsx`).

## Folder layout

```
src/
  app/                     routes (App Router)
    page.tsx               Home
    browse/                Browse (search, genre + tag filters)
    login/, signup/        Auth
    profile/                Author Mode toggle
    my-novels/              An author's own novels
    library/                A reader's saved novels
    novels/
      new/                  Create a novel
      [novelId]/            Novel page
        edit/                Edit novel details
        chapters/
          new/                Add a chapter
          [chapterId]/        Chapter reader
            edit/              Edit a chapter
  components/              UI building blocks (mostly client components)
  lib/
    supabase/              Supabase client setup (browser, server, middleware)
                            + database.types.ts (hand-written, matches the SQL)
    data/                  Read queries, used from Server Components
    actions/                Server Actions (writes: auth, novels, chapters,
                            library, reading progress, profile)
    reading.ts              Splits chapter text into indexed paragraphs
supabase/
  migrations/0001_init.sql  Full schema, Row Level Security, storage policies
  seed.sql                   Starter genres and tags
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
- **Paragraphs have a stable index** (`src/lib/reading.ts`), because
  paragraph reactions are planned and will key off that index. Don't
  renumber paragraphs based on anything that can shift between renders.

## Planned features (not built yet)

- Paragraph reactions: a small reaction + a separate discussion thread for
  each paragraph, opened when a reader taps it.
- Chapter comments.
- Spoiler tagging: spoilers are flagged by hand by the author and not sent
  to the browser until the reader chooses to reveal them (i.e. don't just
  hide them with CSS — the text shouldn't be in the initial payload).
- Trending: rank by how fast a novel is growing (recent reads/library
  adds), not by total reads.
- Blocked tags: a reader can block tags; blocked-tag novels are removed
  before any other filtering, on every list (Home, Browse, Library).
- "You're caught up" card with next-read suggestions, shown at the end of
  a novel's latest chapter.
