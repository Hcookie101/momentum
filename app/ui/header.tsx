"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const navItems = [
    { name: "Goals", href: "/goals" },
    { name: "Obligations", href: "/obligations" },
    { name: "Schedule", href: "/schedule" },
    { name: "Stats", href: "/stats" },
  ];
  return (
    <header className="h-10 w-full flex bg-[#1D2525] text-[#c9c6c0] gap-5">
      <div className="flex items-center gap-3 px-4 h-full">
        <div className="rounded-lg relative overflow-hidden h-8 w-8">
          <Image
            src="/momentumLogo.png"
            alt="Momentum Logo"
            fill
            className="object-cover"
          />
        </div>
        <span className="text-[20px]">Momentum</span>
      </div>
      <nav className="ml-auto flex items-center gap-10 px-8 h-full">
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
    </header>
  );
}
