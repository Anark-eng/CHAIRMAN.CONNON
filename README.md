# NovelTrend

NovelTrend is a website for reading and publishing web novels, chapter by
chapter — like Webnovel, but simpler.

- **Readers** can browse novels, search and filter by genre or tags, read
  chapters (with light/dark/sepia themes and adjustable text), and save
  novels to a personal library. Anyone can browse and read without an
  account.
- **Authors** are just readers who turn on "Author Mode" on their profile
  page. Once it's on, they can publish novels and write chapters (as
  drafts, or published for everyone to read).

This guide assumes no coding experience. It walks through everything
needed to get your own copy of NovelTrend running live on the internet,
for free.

## What you'll set up

1. A **Supabase** project — this is the database that stores novels,
   chapters, and accounts. Free.
2. **Vercel** — this hosts the website itself, so people can visit it.
   Free.

## Step 1: Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign up (or log in).
2. Click **New project**. Give it any name, set a database password (save
   it somewhere safe — you likely won't need it again), and pick a region
   close to your users.
3. Wait a minute or two for the project to finish setting up.

## Step 2: Set up the database

1. In your Supabase project, open the **SQL Editor** in the left sidebar.
2. Click **New query**.
3. Open the file `supabase/migrations/0001_init.sql` from this project,
   copy its entire contents, and paste it into the SQL Editor. Click **Run**.
   This creates all the tables NovelTrend needs and locks them down so
   people can only see and change what they're supposed to.
4. Click **New query** again. Open `supabase/seed.sql`, copy its contents
   in, and click **Run**. This adds a starter list of genres and tags
   (like "Fantasy" or "Slow Burn") that authors can pick from.

## Step 3: Find your project's API keys

1. In Supabase, go to **Settings** (gear icon) → **API**.
2. You'll need two values from this page:
   - **Project URL** — a link starting with `https://`.
   - **anon public** key — a long string of letters and numbers, under
     "Project API keys".

Keep this page open — you'll need to paste these into Vercel next.

## Step 4: Put the code on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up (or log in) — you
   can sign up using your GitHub account, which makes this step easier.
2. Click **Add New** → **Project**.
3. Choose **Import Git Repository** and select this project's GitHub
   repository. (If you don't see it, use "Adjust GitHub App Permissions"
   to give Vercel access to it.)
4. Before clicking Deploy, open **Environment Variables** and add two:
   - `NEXT_PUBLIC_SUPABASE_URL` → paste your Supabase **Project URL**.
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → paste your Supabase **anon public** key.
5. Click **Deploy**. After a minute or two, Vercel will give you a live
   web address, like `https://your-project.vercel.app`.

## Step 5: Let people log in from your live site

1. Copy the web address Vercel gave you.
2. Back in Supabase, go to **Authentication** → **URL Configuration**.
3. Add your Vercel address to **Redirect URLs** (and set it as the **Site
   URL** too). This tells Supabase your live site is allowed to handle
   sign-ups and logins.

That's it — your site is live. Visit your Vercel address, sign up for an
account, turn on Author Mode on your profile page, and publish your first
novel.

## Making changes later

Whenever you (or someone helping you) push new code changes to the GitHub
repository, Vercel automatically rebuilds and updates the live site within
a minute or two — no extra steps needed.

If the database ever needs to change (for example, to add a new feature),
that will come as a new file in `supabase/migrations/`. Run it the same
way as Step 2: open it, copy it, paste it into the Supabase SQL Editor,
and click Run.
