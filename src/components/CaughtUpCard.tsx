import { NovelCard } from "@/components/NovelCard";
import type { NovelCardData, NovelStatus } from "@/lib/data/types";

const STATUS_LINE: Record<NovelStatus, string> = {
  ongoing: "This novel is ongoing — more chapters are on the way.",
  completed: "This novel is complete — that's the whole story.",
  hiatus: "This novel is on hiatus. The author will pick it up again.",
};

export function CaughtUpCard({
  novelStatus,
  suggestions,
}: {
  novelStatus: NovelStatus;
  suggestions: NovelCardData[];
}) {
  return (
    <section className="mt-10 rounded-2xl border border-current/20 p-6 text-center">
      <h2 className="text-lg font-semibold">You&apos;re caught up.</h2>
      <p className="mt-1 text-sm opacity-80">{STATUS_LINE[novelStatus]}</p>

      {suggestions.length > 0 && (
        <div className="mt-6 text-left">
          <p className="mb-3 text-sm font-medium opacity-80">While you wait, try one of these:</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {suggestions.map((s) => (
              <NovelCard key={s.id} novel={s} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
