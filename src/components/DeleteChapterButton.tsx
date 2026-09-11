"use client";

import { deleteChapter } from "@/lib/actions/chapters";

export function DeleteChapterButton({ novelId, chapterId }: { novelId: string; chapterId: string }) {
  return (
    <form
      action={deleteChapter.bind(null, novelId, chapterId)}
      onSubmit={(e) => {
        if (!confirm("Delete this chapter? This can't be undone.")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-sm font-medium text-red-600">
        Delete this chapter
      </button>
    </form>
  );
}
