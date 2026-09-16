// A tiny external store for the chapter reader's display settings
// (theme, font size, line height, font family), persisted to
// localStorage. Implemented as an external store (rather than
// useState + a "load on mount" effect) so it plays nicely with SSR via
// useSyncExternalStore: the server and first client paint both render
// DEFAULT_SETTINGS, then React swaps in the real, localStorage-backed
// value right after hydration.

export type ReaderTheme = "light" | "dark" | "sepia";
export type ReaderFontFamily = "serif" | "sans";
// Reading column widths. Kept named so the labels + max-widths live in
// one place (see components/ReaderChrome). "comfortable" is roughly 68
// characters wide at the default font size, which is the sweet spot
// for uninterrupted long-form prose.
export type ReaderWidth = "narrow" | "comfortable" | "wide";

export interface ReaderSettings {
  theme: ReaderTheme;
  fontSize: number;
  lineHeight: number;
  fontFamily: ReaderFontFamily;
  width: ReaderWidth;
}

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: "light",
  fontSize: 18,
  lineHeight: 1.8,
  fontFamily: "serif",
  width: "comfortable",
};

const STORAGE_KEY = "noveltrend-reader-settings";

let cached: ReaderSettings | null = null;
const listeners = new Set<() => void>();

function readFromLocalStorage(): ReaderSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_READER_SETTINGS;
    return { ...DEFAULT_READER_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_READER_SETTINGS;
  }
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getSnapshot(): ReaderSettings {
  if (!cached) cached = readFromLocalStorage();
  return cached;
}

export function getServerSnapshot(): ReaderSettings {
  return DEFAULT_READER_SETTINGS;
}

export function updateReaderSettings(patch: Partial<ReaderSettings>): void {
  cached = { ...getSnapshot(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch {
    // Private browsing or storage full: the setting still applies for
    // this page view, it just won't persist.
  }
  for (const listener of listeners) listener();
}
