import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Privacy · Momentum",
  description:
    "What the Momentum extension collects (browsing domains + time only), what it never collects, and how to delete your data.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-serif text-[20px] font-medium">{title}</h2>
      <div className="mt-2 max-w-[72ch] space-y-3 text-[14px] leading-relaxed text-[#3d4545]">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#E4E0D8] text-[#1D2525]">
      <header className="border-b border-[#b8b5ae]">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="relative h-8 w-8 overflow-hidden rounded-lg">
              <Image src="/momentumLogo.png" alt="Momentum logo" fill className="object-cover" />
            </span>
            <span className="font-serif text-[19px] font-medium tracking-[-0.01em]">
              Momentum
            </span>
          </Link>
          <Link
            href="/login"
            className="ml-auto rounded-lg px-3 py-1.5 text-[14px] text-[#6b6963] transition-colors hover:text-[#1D2525]"
          >
            Log in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#8a8780]">
          Privacy
        </p>
        <h1 className="mt-2 font-serif text-[32px] font-medium leading-tight tracking-tight">
          What Momentum collects — and what it never touches.
        </h1>
        <p className="mt-3 max-w-[72ch] text-[15px] leading-relaxed text-[#6b6963]">
          Momentum&apos;s browser extension exists for one job: showing you where
          your browsing time went. This page states exactly what leaves your
          browser, where it goes, and how to remove it.
        </p>

        <Section title="What the extension collects">
          <p>
            While you browse ordinary web pages, the extension records{" "}
            <strong>two facts per time slice: the site&apos;s domain</strong>{" "}
            (e.g. <code>example.com</code>) <strong>and how many seconds</strong>{" "}
            it was the active tab. Those two facts are sent to your own Momentum
            account (your Supabase project) and shown back to you in the popup
            and on the Stats page.
          </p>
        </Section>

        <Section title="What it never collects">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Full URLs, page paths, query strings, or hashes.</li>
            <li>Page contents, form inputs, passwords, or keystrokes.</li>
            <li>Anything from private / incognito windows — tracking is disabled there.</li>
          </ul>
          <p>
            The extension has no content scripts: it cannot read what is inside
            the pages you visit. Site icons in the popup come from Chrome&apos;s
            own on-device favicon cache — no browsing data is sent to any third
            party for icons.
          </p>
        </Section>

        <Section title="AI features">
          <p>
            The assistant, schedule generator, and subgoal generator only work if
            you add your own AI provider key in the app&apos;s AI settings. The
            key stays in your browser&apos;s local storage; requests go from
            your browser through Momentum&apos;s server to whichever provider
            you configured, carrying the goals, schedule, or stats needed to
            answer. No AI request is made unless you ask for one.
          </p>
        </Section>

        <Section title="Where your data lives, and deletion">
          <p>
            Browsing data lives in your own account&apos;s{" "}
            <code>browsing_sessions</code> table. Revoking an extension token in
            Settings stops future logging from that browser; historical rows
            stay until you remove them with the{" "}
            <strong>&ldquo;Delete my browsing data&rdquo;</strong> button in
            Settings, which permanently deletes every browsing row on your
            account.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about this policy: reply to any Momentum onboarding email,
            or open an issue on the project repository.
          </p>
          <p>
            Feedback you send from Settings is stored with your Momentum
            account: your words, the category you picked, and the app page you
            were on. Nothing else is attached, and it is only used to improve
            the product.
          </p>
        </Section>
      </main>

      <footer className="border-t border-[#b8b5ae]">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-5 text-[13px] text-[#8a8780]">
          <span className="ml-auto tabular-nums">© {new Date().getFullYear()}</span>
          <Link href="/privacy" className="transition-colors hover:text-[#1D2525]">
            Privacy
          </Link>
          <Link href="/login" className="transition-colors hover:text-[#1D2525]">
            Log in
          </Link>
        </div>
      </footer>
    </div>
  );
}
