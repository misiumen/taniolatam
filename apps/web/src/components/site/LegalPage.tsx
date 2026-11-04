import type { ReactNode } from "react";
import { SiteShell } from "./SiteShell";

/** Public contact mailbox of the service (supplied by the owner on 2026-11-04). */
export const CONTACT_EMAIL = "kontakt@gdziepolece.pl";
/** @deprecated kept for existing imports; same value as CONTACT_EMAIL. */
export const EMAIL_PLACEHOLDER = CONTACT_EMAIL;

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated?: string;
  children: ReactNode;
}) {
  return (
    <SiteShell>
      <article className="legal mx-auto max-w-3xl px-4 pt-10 text-[15px]">
        <h1 className="font-display text-4xl font-semibold leading-tight tracking-tight">
          {title}
        </h1>
        {updated ? (
          <p className="mt-2 text-sm text-muted">Ostatnia aktualizacja: {updated}</p>
        ) : null}
        {children}
      </article>
    </SiteShell>
  );
}
