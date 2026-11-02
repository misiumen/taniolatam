import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gdzie Polecę - najtańsze loty z mapą",
  description:
    "Znajdź najtańsze kierunki: wybierz skąd lecisz, kiedy i na jak długo, a zobaczysz ceny na liście i trasy na mapie.",
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
