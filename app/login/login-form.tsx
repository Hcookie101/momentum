"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/supabase/client";

const inputClass =
  "w-full rounded-lg border border-[#b8b5ae] bg-[#EFECE5] px-3 py-2 text-[14px] text-[#1D2525] outline-none placeholder:text-[#8a8780] focus:border-[#16759b]";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/schedule";
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (error) throw error;
        setNotice(
          "Account created — check your inbox for the confirmation link, then come back here to log in.",
        );
        setMode("in");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 rounded-lg border border-[#b8b5ae] bg-[#EFECE5] p-1 text-[14px]">
        {(["in", "up"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setNotice(null);
            }}
            className={`rounded-md py-1.5 transition-colors ${mode === m ? "bg-[#1D2525] text-[#E4E0D8]" : "text-[#6b6963] hover:text-[#1D2525]"}`}
          >
            {m === "in" ? "Log in" : "Sign up"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block text-[13px] font-medium"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "in" ? "Your password" : "6+ characters"}
            className={inputClass}
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-[#D26390]/15 px-3 py-2 text-[13px] text-[#a03a5e]">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-lg bg-[#16759b]/10 px-3 py-2 text-[13px] text-[#16759b]">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !email.trim() || !password}
          className="w-full rounded-lg bg-[#16759b] py-2.5 text-[15px] font-medium text-white transition-colors hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending
            ? mode === "in"
              ? "Logging in…"
              : "Creating account…"
            : mode === "in"
              ? "Log in"
              : "Create account"}
        </button>
      </form>
    </div>
  );
}
