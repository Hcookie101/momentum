import Image from "next/image";
import Link from "next/link";
import { GoalRow, TuesdayList, WeekMock } from "@/app/ui/landing-mock";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#E4E0D8] text-[#1D2525]">
      <header className="border-b border-[#b8b5ae]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-6">
          <span className="relative h-8 w-8 overflow-hidden rounded-lg">
            <Image src="/momentumLogo.png" alt="Momentum logo" fill className="object-cover" />
          </span>
          <span className="font-serif text-[19px] font-medium tracking-[-0.01em]">Momentum</span>
          <nav className="ml-auto hidden items-center gap-7 text-[14px] text-[#6b6963] sm:flex">
            <a href="#how" className="transition-colors hover:text-[#1D2525]">How it works</a>
            <a href="#inside" className="transition-colors hover:text-[#1D2525]">What&apos;s inside</a>
            <a href="#faq" className="transition-colors hover:text-[#1D2525]">Questions</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:ml-7">
            <Link href="/login" className="rounded-lg px-3 py-1.5 text-[14px] text-[#6b6963] transition-colors hover:text-[#1D2525]">
              Log in
            </Link>
            <Link href="/login" className="rounded-lg bg-[#16759b] px-3.5 py-1.5 text-[14px] font-medium text-white transition-colors hover:bg-[#1b83ad]">
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6">
        <section className="grid gap-10 pb-16 pt-14 md:grid-cols-[1.05fr_0.95fr] md:items-center md:pt-20">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8780]">
              A weekly planner that respects the fixed parts
            </p>
            <h1 className="mt-3 font-serif text-[40px] font-medium leading-[1.08] tracking-tight md:text-[48px]">
              Plan the week around the life you already have.
            </h1>
            <p className="mt-4 max-w-[46ch] text-[15px] leading-relaxed text-[#6b6963]">
              Momentum holds your goals, your classes, your shifts — the stuff that
              won&apos;t move — then helps you fit real focus time into what&apos;s left.
              No streaks, no guilt graphs.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/login" className="rounded-lg bg-[#16759b] px-5 py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#1b83ad]">
                Start planning
              </Link>
              <a href="#how" className="rounded-lg border border-[#b8b5ae] px-5 py-2.5 text-[15px] text-[#1D2525] transition-colors hover:border-[#16759b] hover:text-[#16759b]">
                How it works
              </a>
            </div>
            <p className="mt-4 text-[13px] text-[#8a8780]">
              Your data lives in your own Supabase project.
            </p>
          </div>

          <div className="rounded-xl border border-[#b8b5ae] bg-[#EFECE5] shadow-[0_2px_0_rgba(29,37,37,0.08)]">
            <div className="flex items-center justify-between border-b border-[#b8b5ae] px-4 py-2.5">
              <p className="text-[13px] font-medium">This week</p>
              <p className="text-[12px] tabular-nums text-[#6b6963]">
                <span className="font-semibold text-[#1D2525]">4h 32m</span> focused today
              </p>
            </div>
            <GoalRow />
            <div className="px-4 py-3">
              <WeekMock />
            </div>
            <div className="flex items-center gap-2 border-t border-[#b8b5ae]/60 px-4 py-2.5 text-[12px] text-[#8a8780]">
              <span className="h-2 w-2 rounded-full bg-[#16759b]" aria-hidden="true" />
              Thesis draft · Tue 9:00 – 11:00 AM
              <span className="ml-auto tabular-nums">2 of 5 subgoals done</span>
            </div>
          </div>
        </section>

        <section id="how" className="border-t border-[#b8b5ae] py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8780]">
            How it works
          </p>
          <h2 className="mt-2 font-serif text-[24px] font-medium leading-tight">
            Three things, in order.
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3">
            <li className="border-t-2 border-[#1D2525] pt-4">
              <p className="font-mono text-[12px] tabular-nums text-[#8a8780]">01</p>
              <h3 className="mt-1 text-[17px] font-medium">Pin what won&apos;t move</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b6963]">
                Classes, shifts, gym, dinner with your parents. Click a slot, name it,
                give it a color. These are the walls the rest of the week gets built between.
              </p>
            </li>
            <li className="border-t-2 border-[#1D2525] pt-4">
              <p className="font-mono text-[12px] tabular-nums text-[#8a8780]">02</p>
              <h3 className="mt-1 text-[17px] font-medium">Name where you&apos;re headed</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b6963]">
                A goal with a date on it, broken into subgoals. Draft them yourself, or let
                the assistant propose some and keep the ones you&apos;d actually do.
              </p>
            </li>
            <li className="border-t-2 border-[#1D2525] pt-4">
              <p className="font-mono text-[12px] tabular-nums text-[#8a8780]">03</p>
              <h3 className="mt-1 text-[17px] font-medium">Fill the gaps with focus</h3>
              <p className="mt-2 text-[14px] leading-relaxed text-[#6b6963]">
                Ask the planner to lay out your week around the walls. Review the draft,
                keep what fits, then start the timer and do the thing.
              </p>
            </li>
          </ol>
        </section>

        <section className="border-t border-[#b8b5ae] py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8780]">
            A Tuesday, as scheduled
          </p>
          <div className="mt-6">
            <TuesdayList />
          </div>
          <p className="mt-3 text-[13px] text-[#8a8780]">
            Built in an afternoon. Kept because Tuesday kept working.
          </p>
        </section>

        <section id="inside" className="border-t border-[#b8b5ae] py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8780]">
            What&apos;s inside
          </p>
          <h2 className="mt-2 font-serif text-[24px] font-medium leading-tight">
            Four tabs. Nothing else competing for your attention.
          </h2>
          <ul className="mt-8 divide-y divide-[#b8b5ae] border-y border-[#b8b5ae]">
            <li className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-6">
              <p className="text-[15px] font-medium">Goals</p>
              <p className="max-w-[62ch] text-[14px] leading-relaxed text-[#6b6963]">
                A date, a list of sub-steps, and an honest count of days left.
                Overdue ones say so, plainly.
              </p>
            </li>
            <li className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-6">
              <p className="text-[15px] font-medium">Obligations</p>
              <p className="max-w-[62ch] text-[14px] leading-relaxed text-[#6b6963]">
                The recurring blocks. One glance tells you how much of your week
                is already spoken for.
              </p>
            </li>
            <li className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-6">
              <p className="text-[15px] font-medium">Schedule</p>
              <p className="max-w-[62ch] text-[14px] leading-relaxed text-[#6b6963]">
                One week grid, half-hour precise, with an assistant that drafts
                it for you and waits for your yes.
              </p>
            </li>
            <li className="grid gap-1 py-4 sm:grid-cols-[140px_1fr] sm:gap-6">
              <p className="text-[15px] font-medium">Stats</p>
              <p className="max-w-[62ch] text-[14px] leading-relaxed text-[#6b6963]">
                Where the hours actually went — focus time, browsing,
                completions — without the lecture.
              </p>
            </li>
          </ul>
        </section>

        <section id="faq" className="border-t border-[#b8b5ae] py-14">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8780]">
            Questions
          </p>
          <h2 className="mt-2 font-serif text-[24px] font-medium leading-tight">
            Asked already, answered honestly.
          </h2>
          <dl className="mt-8 space-y-7">
            <div className="max-w-[68ch]">
              <dt className="text-[15px] font-medium">Do I need an AI key?</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-[#6b6963]">
                No. Goals, obligations, the calendar, the timer, stats — all of
                it works without one. The key only unlocks the drafting help,
                and it stays in your browser.
              </dd>
            </div>
            <div className="max-w-[68ch]">
              <dt className="text-[15px] font-medium">Where does my data live?</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-[#6b6963]">
                In your own Supabase project. Momentum is the window into it,
                not the warehouse.
              </dd>
            </div>
            <div className="max-w-[68ch]">
              <dt className="text-[15px] font-medium">Is this a streak app?</dt>
              <dd className="mt-1 text-[14px] leading-relaxed text-[#6b6963]">
                No streaks, no XP. Miss a day and the app just shows you the
                week as it is. The only number it celebrates is hours you
                actually focused.
              </dd>
            </div>
          </dl>
        </section>

        <section className="border-t border-[#b8b5ae] py-14 text-center">
          <h2 className="mx-auto max-w-[22ch] font-serif text-[28px] font-medium leading-tight tracking-tight">
            Tuesday is coming either way. Give it a plan.
          </h2>
          <div className="mt-6">
            <Link href="/login" className="inline-block rounded-lg bg-[#16759b] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-[#1b83ad]">
              Get started
            </Link>
          </div>
          <p className="mt-3 text-[13px] text-[#8a8780]">
            For people who buy a paper planner every January.
          </p>
        </section>
      </main>

      <footer className="border-t border-[#b8b5ae]">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 text-[13px] text-[#8a8780]">
          <span className="flex items-center gap-2 text-[#1D2525]">
            <span className="relative h-6 w-6 overflow-hidden rounded-md">
              <Image src="/momentumLogo.png" alt="" fill className="object-cover" />
            </span>
            Momentum
          </span>
          <span className="ml-auto tabular-nums">© {new Date().getFullYear()}</span>
          <Link href="/login" className="transition-colors hover:text-[#1D2525]">Log in</Link>
          <Link href="/schedule" className="transition-colors hover:text-[#1D2525]">The app</Link>
        </div>
      </footer>
    </div>
  );
}

