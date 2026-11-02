import type { ReactNode } from "react";
import { SiteShell } from "./SiteShell";

/** Placeholder until the owner supplies a real address; never replaced by an invented one. */
export const EMAIL_PLACEHOLDER = "[ADRES E-MAIL]";

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
