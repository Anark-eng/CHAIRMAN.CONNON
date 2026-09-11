"use client";

import { deleteNovel } from "@/lib/actions/novels";

export function DeleteNovelButton({ novelId }: { novelId: string }) {
  return (
    <form
      action={deleteNovel.bind(null, novelId)}
      onSubmit={(e) => {
        if (!confirm("Delete this novel and all its chapters? This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm font-medium text-red-600">
        Delete this novel
      </button>
    </form>
  );
}
