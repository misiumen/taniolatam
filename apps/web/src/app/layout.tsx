import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TanioLatam — najtańsze loty z mapą",
  description:
    "Znajdź najtańsze kierunki: wybierz skąd lecisz, kiedy i na jak długo, a zobaczysz ceny na liście i na mapie.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
