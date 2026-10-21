"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/supabase/client";
import FocusTimer from "@/app/ui/focus-timer";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navItems = [
    { name: "Goals", href: "/goals" },
    { name: "Obligations", href: "/obligations" },
    { name: "Schedule", href: "/schedule" },
    { name: "Stats", href: "/stats" },
    { name: "Settings", href: "/settings" },
  ];

  async function signOut() {
    if (signingOut) return;
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    // h-10 on desktop; the mobile menu panel opens below the bar.
    <header className="relative w-full bg-[#1D2525] text-[#c9c6c0]">
      <div className="flex h-10 items-center gap-3 sm:gap-5">
        <div className="flex h-full min-w-0 items-center gap-2 px-3 sm:gap-3 sm:px-4">
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg">
            <Image
              src="/momentumLogo.png"
              alt="Momentum Logo"
              fill
              className="object-cover"
            />
          </div>
          <span className="truncate font-serif text-[18px] font-medium tracking-[-0.01em] sm:text-[20px]">
            Momentum
          </span>
        </div>
        {/* Desktop nav — hidden on phones and tablets, replaced by the
            hamburger panel. The nav needs ~1024px to fit its five links
            beside the timer and the log-out button without overflowing. */}
        <nav className="ml-auto hidden h-full items-center gap-10 px-8 lg:flex">
          {navItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[18px] transition-colors ${
                  isActive ? "text-[#6DBACB]" : "text-[#c9c6c0] hover:text-white"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex h-full min-w-0 items-center gap-1.5 pr-2 sm:gap-3 sm:pr-4 lg:ml-0">
          <FocusTimer />
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            title="Log out"
            className="hidden shrink-0 rounded-lg px-2.5 py-1 text-[13px] text-[#c9c6c0]/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50 sm:block"
          >
            {signingOut ? "…" : "Log out"}
          </button>
          {/* Phone menu toggle — the timer + hamburger stay; nav + logout
              live in the dropdown so the 40px bar never overflows. */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#c9c6c0] transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6DBACB] lg:hidden"
          >
            <svg
              viewBox="0 0 16 16"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
            >
              {menuOpen ? (
                <path d="M3 3l10 10M13 3L3 13" />
              ) : (
                <path d="M2 4h12M2 8h12M2 12h12" />
              )}
            </svg>
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          aria-label="Primary"
          className="absolute inset-x-0 top-10 z-40 border-t border-white/10 bg-[#1D2525] px-3 py-2 shadow-xl lg:hidden"
        >
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-[16px] transition-colors ${
                  isActive
                    ? "bg-white/10 text-[#6DBACB]"
                    : "text-[#c9c6c0] hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.name}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="mt-1 block w-full rounded-lg px-3 py-2.5 text-left text-[16px] text-[#c9c6c0]/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-50 sm:hidden"
          >
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </nav>
      )}
    </header>
  );
}

