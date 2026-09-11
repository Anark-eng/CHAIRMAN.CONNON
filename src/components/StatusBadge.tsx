import type { NovelStatus } from "@/lib/supabase/database.types";

const LABELS: Record<NovelStatus, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  hiatus: "On hiatus",
};

const STYLES: Record<NovelStatus, string> = {
  ongoing: "bg-green-600/10 text-green-700 dark:text-green-400",
  completed: "bg-blue-600/10 text-blue-700 dark:text-blue-400",
  hiatus: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
};

export function StatusBadge({ status }: { status: NovelStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
