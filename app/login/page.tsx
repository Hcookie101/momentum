import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen bg-[#E4E0D8] text-[#1D2525]">
      <div className="flex w-full flex-col px-6 py-6 sm:px-10 lg:max-w-[520px] lg:flex-none lg:border-r lg:border-[#b8b5ae]">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="relative h-8 w-8 overflow-hidden rounded-lg">
            <Image src="/momentumLogo.png" alt="Momentum logo" fill className="object-cover" />
          </span>
          <span className="font-serif text-[19px] font-medium tracking-[-0.01em]">Momentum</span>
        </Link>

        <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-12">
          <h1 className="font-serif text-[28px] font-medium leading-tight tracking-tight">
            Welcome back.
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-[#6b6963]">
            Your week is where you left it — goals, obligations, and all.
          </p>
          <div className="mt-7">
            <Suspense fallback={<p className="text-[14px] text-[#8a8780]">Loading…</p>}>
              <LoginForm />
            </Suspense>
          </div>
          <p className="mt-6 text-[13px] text-[#8a8780]">
            New here? The sign-up tab above takes thirty seconds.
          </p>
        </div>

        <p className="text-[13px] text-[#8a8780]">
          <Link href="/" className="transition-colors hover:text-[#1D2525]">← Back to the homepage</Link>
        </p>
      </div>

      <div className="hidden min-w-0 flex-1 bg-[#1D2525] text-[#E4E0D8] lg:block">
        <div className="flex h-full flex-col justify-between p-12">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#E4E0D8]/50">
            This week at a glance
          </p>
          <blockquote>
            <p className="max-w-[26ch] font-serif text-[40px] italic leading-[1.15]">
              “Show me Tuesday and I’ll tell you the semester.”
            </p>
            <footer className="mt-4 text-[14px] text-[#E4E0D8]/60">
              — every advisor, ever
            </footer>
          </blockquote>
          <div className="grid max-w-xl grid-cols-3 gap-6 border-t border-white/10 pt-6 text-[13px]">
            <div>
              <p className="text-[22px] font-medium tabular-nums text-[#E4E0D8]">4h 32m</p>
              <p className="mt-1 text-[#E4E0D8]/60">focused today</p>
            </div>
            <div>
              <p className="text-[22px] font-medium tabular-nums text-[#E4E0D8]">3 / 5</p>
              <p className="mt-1 text-[#E4E0D8]/60">subgoals done</p>
            </div>
            <div>
              <p className="text-[22px] font-medium tabular-nums text-[#E4E0D8]">11h</p>
              <p className="mt-1 text-[#E4E0D8]/60">already spoken for</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
