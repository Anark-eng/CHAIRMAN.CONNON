// Shared browse sort options. Kept in a client-safe module so
// BrowseControls (a client component) doesn't have to import the
// server-side data helper next to it.

export type SearchSort =
  | "newest"
  | "trending"
  | "recently_updated"
  | "most_read"
  | "top_rated";

export const SEARCH_SORTS: ReadonlyArray<{ value: SearchSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "recently_updated", label: "Recently updated" },
  { value: "newest", label: "Newest" },
  { value: "most_read", label: "Most read" },
  { value: "top_rated", label: "Highest rated" },
];
