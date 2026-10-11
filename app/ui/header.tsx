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
    <header className="flex h-10 w-full gap-5 bg-[#1D2525] text-[#c9c6c0]">
      <div className="flex h-full items-center gap-3 px-4">
        <div className="relative h-8 w-8 overflow-hidden rounded-lg">
          <Image
            src="/momentumLogo.png"
            alt="Momentum Logo"
            fill
            className="object-cover"
          />
        </div>
        <span className="text-[20px]">Momentum</span>
      </div>
      <nav className="ml-auto flex h-full items-center gap-10 px-8">
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
      <div className="flex h-full items-center gap-3 pr-4">
        <FocusTimer />
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          title="Log out"
          className="rounded-lg px-2.5 py-1 text-[13px] text-[#c9c6c0]/70 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          {signingOut ? "…" : "Log out"}
        </button>
      </div>
    </header>
  );
}

