import Link from "next/link";
import { CoverThumb } from "./CoverThumb";
import { RatingSummaryTag } from "./RatingSummary";
import { StatusBadge } from "./StatusBadge";
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
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge status={novel.status} />
          {novel.genre && (
            <span className="text-xs text-[var(--muted)]">{novel.genre.name}</span>
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
