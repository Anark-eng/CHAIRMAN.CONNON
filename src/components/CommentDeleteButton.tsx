"use client";

export function CommentDeleteButton({
  action,
  label = "Delete",
}: {
  action: () => Promise<void>;
  label?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("Delete this comment?")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="text-xs font-medium text-red-600 hover:underline">
        {label}
      </button>
    </form>
  );
}
