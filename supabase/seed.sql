-- Starter genres and tags for NovelTrend.
-- Run this once, after 0001_init.sql, in the Supabase SQL editor.

insert into genres (name, slug) values
  ('Fantasy', 'fantasy'),
  ('Romance', 'romance'),
  ('Sci-Fi', 'sci-fi'),
  ('Martial Arts', 'martial-arts'),
  ('Xianxia', 'xianxia'),
  ('Mystery', 'mystery'),
  ('Horror', 'horror'),
  ('Slice of Life', 'slice-of-life'),
  ('Action', 'action'),
  ('Drama', 'drama'),
  ('Comedy', 'comedy'),
  ('Sports', 'sports')
on conflict (name) do nothing;

insert into tags (name, slug) values
  ('Reincarnation', 'reincarnation'),
  ('System', 'system'),
  ('Magic', 'magic'),
  ('Isekai', 'isekai'),
  ('Strong Lead', 'strong-lead'),
  ('Weak to Strong', 'weak-to-strong'),
  ('Romance Subplot', 'romance-subplot'),
  ('Harem', 'harem'),
  ('School Life', 'school-life'),
  ('Time Travel', 'time-travel'),
  ('Post-Apocalyptic', 'post-apocalyptic'),
  ('Virtual Reality', 'virtual-reality'),
  ('Anti-Hero', 'anti-hero'),
  ('Slow Burn', 'slow-burn'),
  ('Found Family', 'found-family'),
  ('Politics', 'politics'),
  ('Adventure', 'adventure'),
  ('Tragedy', 'tragedy'),
  ('Dark', 'dark')
on conflict (name) do nothing;
