"use client";

import { usePathname } from "next/navigation";

// Hides the site nav and footer on the chapter reader route only, so
// the reader's own bar becomes the sole chrome. Everywhere else the
// site nav renders exactly as before.
//
// The pattern matches only /novels/<id>/chapters/<id>, not /edit,
// /comments or /paragraphs/... — those still need the site nav.
const READER_ROUTE = /^\/novels\/[^/]+\/chapters\/[^/]+\/?$/;

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isReader = READER_ROUTE.test(pathname);

  return (
    <>
      {!isReader && header}
      <main className="flex-1">{children}</main>
      {!isReader && footer}
    </>
  );
}
