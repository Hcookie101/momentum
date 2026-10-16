import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Manrope } from "next/font/google";
import "./globals.css";

// Type system: Manrope is the working sans (body, UI, numbers), Fraunces the
// editorial display serif (wordmarks, headlines, modal titles), and IBM Plex
// Mono the instrument numerals (focus timer, schedule gutters, tokens).
// Each exposes a CSS variable consumed by the theme in globals.css.
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Momentum — Plan the week around your life",
  description:
    "Goals, recurring obligations, a weekly schedule and focus stats in one calm place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${fraunces.variable} ${plexMono.variable}`}
    >
      <body className="antialiased">{children}</body>
    </html>
  );
}

