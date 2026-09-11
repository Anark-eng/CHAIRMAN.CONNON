"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TagOption } from "@/lib/data/types";

type TagState = "none" | "include" | "exclude";

function nextState(state: TagState): TagState {
  if (state === "none") return "include";
  if (state === "include") return "exclude";
  return "none";
}

export function TagFilterBar({ tags }: { tags: TagOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const include = new Set((searchParams.get("include") ?? "").split(",").filter(Boolean));
  const exclude = new Set((searchParams.get("exclude") ?? "").split(",").filter(Boolean));

  function stateFor(slug: string): TagState {
    if (include.has(slug)) return "include";
    if (exclude.has(slug)) return "exclude";
    return "none";
  }

  function handleClick(slug: string) {
    const current = stateFor(slug);
    const target = nextState(current);

    const nextInclude = new Set(include);
    const nextExclude = new Set(exclude);
    nextInclude.delete(slug);
    nextExclude.delete(slug);
    if (target === "include") nextInclude.add(slug);
    if (target === "exclude") nextExclude.add(slug);

    const params = new URLSearchParams(searchParams.toString());
    if (nextInclude.size > 0) params.set("include", [...nextInclude].join(","));
    else params.delete("include");
    if (nextExclude.size > 0) params.set("exclude", [...nextExclude].join(","));
    else params.delete("exclude");

    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag) => {
        const state = stateFor(tag.slug);
        return (
          <button
            key={tag.id}
            type="button"
            onClick={() => handleClick(tag.slug)}
            aria-pressed={state !== "none"}
            className={
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
              (state === "include"
                ? "border-green-600 bg-green-600/10 text-green-700 dark:text-green-400"
                : state === "exclude"
                  ? "border-red-600 bg-red-600/10 text-red-700 line-through dark:text-red-400"
                  : "border-[var(--border)] text-[var(--muted)]")
            }
          >
            {tag.name}
          </button>
        );
      })}
    </div>
  );
}
