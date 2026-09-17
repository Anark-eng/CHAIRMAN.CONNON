import type { Metadata } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { SiteChrome } from "@/components/SiteChrome";
import { isSupabaseConfigured } from "@/lib/supabase/env";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const readingSerif = Source_Serif_4({
  variable: "--font-reading-serif",
  subsets: ["latin"],
});

// Every page reads the logged-in user and/or fresh database rows, so
// there's little to gain from static generation, and it lets the app
// build cleanly even before Supabase env vars are set.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NovelTrend",
  description: "Read and publish web novels, chapter by chapter.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${readingSerif.variable} h-full`}>
      <body className="min-h-full flex flex-col font-sans antialiased">
        {isSupabaseConfigured ? (
          <SiteChrome
            header={<NavBar />}
            footer={
              <footer className="border-t border-[var(--border)] py-6 text-center text-sm text-[var(--muted)]">
                NovelTrend &mdash; read and publish web novels.
              </footer>
            }
          >
            {children}
          </SiteChrome>
        ) : (
          <MissingSetup />
        )}
      </body>
    </html>
  );
}

function MissingSetup() {
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center">
        <h1 className="text-xl font-semibold">NovelTrend isn&apos;t set up yet</h1>
        <p className="mt-3 text-[var(--muted)]">
          This site needs its Supabase connection details. Add{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-black/10 px-1 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> as
          environment variables, then reload this page. See README.md for step-by-step
          instructions.
        </p>
      </div>
    </main>
  );
}
