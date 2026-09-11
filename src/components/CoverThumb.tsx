import Image from "next/image";

export function CoverThumb({
  src,
  title,
  className = "",
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  if (src) {
    return (
      <Image
        src={src}
        alt={`Cover for ${title}`}
        width={240}
        height={320}
        className={`aspect-[3/4] w-full rounded-lg object-cover ${className}`}
        unoptimized
      />
    );
  }

  return (
    <div
      className={`flex aspect-[3/4] w-full items-center justify-center rounded-lg bg-[var(--border)] p-3 text-center text-sm font-medium text-[var(--muted)] ${className}`}
    >
      {title}
    </div>
  );
}
