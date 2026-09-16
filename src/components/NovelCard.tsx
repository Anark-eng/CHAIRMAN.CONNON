import Link from "next/link";
import { CoverThumb } from "./CoverThumb";
import { RatingSummaryTag } from "./RatingSummary";
import { StatusBadge } from "./StatusBadge";
import { demographicLabel } from "@/lib/classification";
import type { NovelCardData } from "@/lib/data/types";

export interface NovelCardExtras {
  rating?: { ratingCount: number; avgScore: number };
}

export function NovelCard({
  novel,
  extras,
}: {
  novel: NovelCardData;
  extras?: NovelCardExtras;
}) {
  return (
    <Link href={`/novels/${novel.id}`} className="group flex flex-col gap-2">
      <CoverThumb src={novel.cover_url} title={novel.title} />
      <div>
        <h3 className="line-clamp-2 font-medium leading-snug group-hover:text-[var(--brand)]">
          {novel.title}
        </h3>
        <p className="text-sm text-[var(--muted)]">
          {novel.authorPenName ?? "Unknown author"}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge status={novel.status} />
          {novel.demographic && (
            <span className="rounded-full bg-[var(--border)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              {demographicLabel(novel.demographic)}
            </span>
          )}
          {novel.genres.length > 0 && (
            <span className="text-xs text-[var(--muted)]">
              {novel.genres
                .slice(0, 3)
                .map((g) => g.name)
                .join(", ")}
              {novel.genres.length > 3 && ` +${novel.genres.length - 3}`}
            </span>
          )}
          {extras?.rating && (
            <RatingSummaryTag
              ratingCount={extras.rating.ratingCount}
              avgScore={extras.rating.avgScore}
            />
          )}
        </div>
      </div>
    </Link>
  );
}
