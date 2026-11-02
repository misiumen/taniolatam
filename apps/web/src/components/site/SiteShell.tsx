import Link from "next/link";
import type { ReactNode } from "react";
import { btnPrimaryCls } from "../ui";

/** Brand mark, the same arc as in the /szukaj header. */
export function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 text-fg ${className}`}
      aria-label="Gdzie Polecę, strona główna"
    >
      <svg aria-hidden viewBox="0 0 28 20" className="h-5 w-7 text-accent">
        <path d="M3 16 Q14 -2 25 12" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="3" cy="16" r="2.5" fill="var(--origin)" />
        <circle cx="25" cy="12" r="2.5" fill="currentColor" />
      </svg>
      <span className="font-display text-[22px] font-semibold leading-none tracking-tight">
        Gdzie Polecę
      </span>
    </Link>
  );
}

export const FOOTER_LINKS = [
  { href: "/#jak-to-dziala", label: "Jak to działa" },
  { href: "/#skad-ceny", label: "Skąd ceny" },
  { href: "/polityka-prywatnosci", label: "Polityka prywatności" },
  { href: "/regulamin", label: "Regulamin" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4">
        <Brand />
        <Link href="/szukaj" className={`${btnPrimaryCls} !px-3 !py-1.5`}>
          Szukaj lotów
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-line bg-surface" data-testid="site-footer">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Brand />
        <nav aria-label="Informacje" className="mt-4">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="text-fg underline-offset-2 hover:text-accent hover:underline"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-4 max-w-2xl text-[13px] text-muted">
          Gdzie Polecę porównuje ceny lotów z wyszukiwań użytkowników Aviasales i nie sprzedaje
          biletów. Linki do wyszukiwarek to linki partnerskie, a prowizja nie zmienia ceny.
        </p>
      </div>
    </footer>
  );
}

/** Header, content column and footer shared by the home page, route pages and legal pages. */
export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
