import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Momentum — Plan the week around your life",
  description:
    "Goals, recurring obligations, a weekly schedule and focus stats in one calm place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

