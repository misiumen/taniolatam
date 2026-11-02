import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { socialMeta } from "../lib/seo-meta";
import { SITE_NAME, siteUrl } from "../lib/site";
import "./globals.css";

const DEFAULT_TITLE = "Gdzie Polecę - najtańsze loty z mapą";
const DEFAULT_DESCRIPTION =
  "Znajdź najtańsze kierunki: wybierz skąd lecisz, kiedy i na jak długo, a zobaczysz ceny na liście i trasy na mapie.";

export const metadata: Metadata = {
  // Canonical host from PUBLIC_SITE_URL (default https://gdziepolece.pl); relative URLs below resolve against it.
  metadataBase: siteUrl(),
  title: { default: DEFAULT_TITLE, template: `%s - ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  ...socialMeta(DEFAULT_TITLE, DEFAULT_DESCRIPTION, "/"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

// IBM Plex Sans (body, tabular figures) + Newsreader (display). Both cover Polish diacritics;
// when Google Fonts is unreachable the stacks in globals.css take over.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
