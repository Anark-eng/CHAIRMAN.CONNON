-- NovelTrend initial schema
-- Run this whole file once in the Supabase SQL editor (see README.md).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles
-- One row per signed-up user. Created automatically when someone signs up.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  pen_name text,
  is_author boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'One profile per account. is_author = Author Mode is turned on.';

-- Create a profile row automatically whenever someone signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ---------------------------------------------------------------------------
-- genres (fixed-ish list, managed by seed data / an admin, not by readers)
-- ---------------------------------------------------------------------------
create table genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

-- ---------------------------------------------------------------------------
-- tags
-- ---------------------------------------------------------------------------
create table tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);

-- ---------------------------------------------------------------------------
-- novels
-- ---------------------------------------------------------------------------
create table novels (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  synopsis text not null default '',
  cover_url text,
  genre_id uuid references genres (id) on delete set null,
  status text not null default 'ongoing' check (status in ('ongoing', 'completed', 'hiatus')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index novels_author_id_idx on novels (author_id);
create index novels_genre_id_idx on novels (genre_id);
create index novels_created_at_idx on novels (created_at desc);

-- ---------------------------------------------------------------------------
-- novel_tags (many-to-many between novels and tags)
-- ---------------------------------------------------------------------------
create table novel_tags (
  novel_id uuid not null references novels (id) on delete cascade,
  tag_id uuid not null references tags (id) on delete cascade,
  primary key (novel_id, tag_id)
);

create index novel_tags_tag_id_idx on novel_tags (tag_id);

-- ---------------------------------------------------------------------------
-- chapters
-- ---------------------------------------------------------------------------
create table chapters (
  id uuid primary key default gen_random_uuid(),
  novel_id uuid not null references novels (id) on delete cascade,
  title text not null,
  body text not null default '',
  order_number integer not null,
  is_published boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (novel_id, order_number)
);

create index chapters_novel_id_idx on chapters (novel_id);
create index chapters_published_idx on chapters (novel_id, order_number) where is_published;

-- ---------------------------------------------------------------------------
-- library_entries (a reader's saved novels)
-- ---------------------------------------------------------------------------
create table library_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  novel_id uuid not null references novels (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, novel_id)
);

create index library_entries_user_id_idx on library_entries (user_id);

-- ---------------------------------------------------------------------------
-- reading_progress (last chapter read per novel, per reader)
-- ---------------------------------------------------------------------------
create table reading_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  novel_id uuid not null references novels (id) on delete cascade,
  chapter_id uuid not null references chapters (id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (user_id, novel_id)
);

create index reading_progress_user_id_idx on reading_progress (user_id);

-- ---------------------------------------------------------------------------
-- keep updated_at fresh
-- ---------------------------------------------------------------------------
create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on profiles
  for each row execute procedure set_updated_at();
create trigger novels_set_updated_at before update on novels
  for each row execute procedure set_updated_at();
create trigger chapters_set_updated_at before update on chapters
  for each row execute procedure set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table genres enable row level security;
alter table tags enable row level security;
alter table novels enable row level security;
alter table novel_tags enable row level security;
alter table chapters enable row level security;
alter table library_entries enable row level security;
alter table reading_progress enable row level security;

-- profiles: pen names are public (shown on novel pages). People can only
-- change their own row.
create policy "profiles are publicly readable"
  on profiles for select
  using (true);

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- genres / tags: public read, no public writes (seeded by the project owner).
create policy "genres are publicly readable"
  on genres for select
  using (true);

create policy "tags are publicly readable"
  on tags for select
  using (true);

-- novels: readable by everyone. Only the author can create/edit/delete
-- their own novels.
create policy "novels are publicly readable"
  on novels for select
  using (true);

create policy "authors can insert their own novels"
  on novels for insert
  with check (
    auth.uid() = author_id
    and exists (select 1 from profiles where id = auth.uid() and is_author)
  );

create policy "authors can update their own novels"
  on novels for update
  using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

create policy "authors can delete their own novels"
  on novels for delete
  using (auth.uid() = author_id);

-- novel_tags: readable by everyone. Only the novel's author can attach or
-- remove tags.
create policy "novel_tags are publicly readable"
  on novel_tags for select
  using (true);

create policy "authors can manage tags on their own novels"
  on novel_tags for all
  using (exists (
    select 1 from novels where novels.id = novel_tags.novel_id and novels.author_id = auth.uid()
  ))
  with check (exists (
    select 1 from novels where novels.id = novel_tags.novel_id and novels.author_id = auth.uid()
  ));

-- chapters: published chapters are readable by everyone. Drafts are only
-- readable by the novel's author. Only the novel's author can write.
create policy "published chapters are publicly readable"
  on chapters for select
  using (
    is_published
    or exists (
      select 1 from novels where novels.id = chapters.novel_id and novels.author_id = auth.uid()
    )
  );

create policy "authors can insert chapters on their own novels"
  on chapters for insert
  with check (exists (
    select 1 from novels where novels.id = chapters.novel_id and novels.author_id = auth.uid()
  ));

create policy "authors can update chapters on their own novels"
  on chapters for update
  using (exists (
    select 1 from novels where novels.id = chapters.novel_id and novels.author_id = auth.uid()
  ))
  with check (exists (
    select 1 from novels where novels.id = chapters.novel_id and novels.author_id = auth.uid()
  ));

create policy "authors can delete chapters on their own novels"
  on chapters for delete
  using (exists (
    select 1 from novels where novels.id = chapters.novel_id and novels.author_id = auth.uid()
  ));

-- library_entries: strictly private to the reader who owns them.
create policy "users can read their own library"
  on library_entries for select
  using (auth.uid() = user_id);

create policy "users can add to their own library"
  on library_entries for insert
  with check (auth.uid() = user_id);

create policy "users can remove from their own library"
  on library_entries for delete
  using (auth.uid() = user_id);

-- reading_progress: strictly private to the reader who owns it.
create policy "users can read their own reading progress"
  on reading_progress for select
  using (auth.uid() = user_id);

create policy "users can insert their own reading progress"
  on reading_progress for insert
  with check (auth.uid() = user_id);

create policy "users can update their own reading progress"
  on reading_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage: a "covers" bucket for novel cover images.
-- Files are stored as "{author_id}/{novel_id}/{filename}" so the owning
-- author can be checked from the file path.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do nothing;

create policy "cover images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'covers');

create policy "authors can upload their own cover images"
  on storage.objects for insert
  with check (
    bucket_id = 'covers'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "authors can update their own cover images"
  on storage.objects for update
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "authors can delete their own cover images"
  on storage.objects for delete
  using (
    bucket_id = 'covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
