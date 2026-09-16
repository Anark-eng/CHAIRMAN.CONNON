// Thresholds that gate ratings display and the three ranking boards.
// These numbers are mirrored in supabase/migrations/0006_ratings_and_boards.sql
// (see the "SHARED THRESHOLDS" header comment). If you change one, change
// the SQL to match — the TS side never overrides the DB rule, it just
// keeps the UI's "how many ratings do we still need" copy honest.
export const RATING_MIN_COUNT = 5;

// A board (Trending / Top rated / Most read) is only shown to readers
// once at least this many novels qualify for it. Below that we say
// what's needed instead of showing a two-item list.
export const BOARD_MIN_QUALIFIERS = 10;

// The three boards this site has. Everything about them is
// deliberately independent — a novel's position on one is unrelated to
// its position on another.
export type BoardKey = "trending" | "top_rated" | "most_read";

export const BOARD_LABEL: Record<BoardKey, string> = {
  trending: "Trending",
  top_rated: "Top rated",
  most_read: "Most read",
};

// Used on the novel page (per-board position badges). Short so two
// or three can sit side-by-side on a phone.
export const BOARD_SHORT_LABEL: Record<BoardKey, string> = {
  trending: "trending",
  top_rated: "top rated",
  most_read: "most read",
};

export const BOARD_EXPLANATION: Record<BoardKey, string> = {
  trending: "What's catching on right now — ranked by growth over the last 7 days, not lifetime totals.",
  top_rated: "What readers say is good — ratings shrunken toward the site average so a few 10s don't beat many 9s.",
  most_read: "What's big — distinct readers across a novel's whole lifetime, each reader counted once.",
};

// Snap a raw input to a valid rating value (0.5 through 10 in half
// steps) or return null if it isn't one. Reused by the client control
// and the server action so both agree on what counts.
export function normaliseRating(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const doubled = Math.round(raw * 2);
  if (doubled < 1 || doubled > 20) return null;
  return doubled / 2;
}

// "8.7 out of 10 · 42 ratings"
export function formatRatingAverage(avg: number): string {
  return avg.toFixed(1);
}
