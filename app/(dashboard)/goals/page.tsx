"use client";
import { useState, useEffect } from "react";
import { Tables } from "@/supabase/types";
import { createClient } from "@/supabase/client";
type Goal = Tables<"goals">;
type Subgoal = Tables<"subgoals">;

type Modal =
  | { kind: "new-goal" }
  | { kind: "edit-goal"; id: string }
  | { kind: "new-subgoal"; goalId: string }
  | { kind: "edit-subgoal"; id: string };

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function todayISO() {
  const now = startOfToday();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function fmtDate(value: string) {
  const date = parseDate(value);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  if (date.getFullYear() !== new Date().getFullYear()) {
    options.year = "numeric";
  }
  return date.toLocaleDateString("en-US", options);
}

function daysUntil(value: string) {
  return Math.round(
    (parseDate(value).getTime() - startOfToday().getTime()) / 86_400_000,
  );
}

function statusFor(days: number, completed: boolean) {
  return completed
    ? "done"
    : days > 1
      ? `${days} days left`
      : days === 1
        ? "1 day left"
        : days === 0
          ? "due today"
          : `${Math.abs(days)} day${days === -1 ? "" : "s"} over`;
}

export default function Goals() {
const [supabase] = useState(() => createClient());
  const [goals, setGoals] = useState<Goal[]>([]);
  const [subgoals, setSubgoals] = useState<Subgoal[]>([]);
  const [modal, setModal] = useState<Modal | null>(null);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");

  useEffect(() => {
    async function fetchGoals() {
      const { data, error } = await supabase.from("goals").select("*");
      if (error) console.error(error);
      else setGoals(data);
    }
    fetchGoals();
  }, []);
  useEffect(() => {
    async function fetchSubgoals() {
      const { data, error } = await supabase.from("subgoals").select("*");
      if (error) console.error(error);
      else setSubgoals(data);
    }
    fetchSubgoals();
  }, []);

  const modalOpen = modal !== null;
  const isEdit = modal?.kind.startsWith("edit-") ?? false;
  const isSub = modal?.kind === "new-subgoal" || modal?.kind === "edit-subgoal";
  const subParent =
    modal?.kind === "new-subgoal"
      ? goals.find((g) => g.id === modal.goalId)
      : undefined;
  const canSave = title.trim() !== "" && startDate !== "" && targetDate !== "";
  const byTarget = (a: Goal, b: Goal) =>
    a.target_date.localeCompare(b.target_date);

  const active = goals.filter((g) => !g.completed).sort(byTarget);
  const done = goals.filter((g) => g.completed).sort(byTarget);

  function resetForm() {
    setTitle("");
    setStartDate("");
    setTargetDate("");
    setModal(null);
  }

  function openNew() {
    setTitle("");
    setStartDate(todayISO());
    setTargetDate("");
    setModal({ kind: "new-goal" });
  }

  function openEdit(goal: Goal) {
    setTitle(goal.title);
    setStartDate(goal.start_date);
    setTargetDate(goal.target_date);
    setModal({ kind: "edit-goal", id: goal.id });
  }

  function openNewSub(goalId: string) {
    const parent = goals.find((g) => g.id === goalId);
    setTitle("");
    setStartDate(todayISO());
    setTargetDate(parent?.target_date ?? "");
    setModal({ kind: "new-subgoal", goalId });
  }

  function openEditSub(sub: Subgoal) {
    setTitle(sub.title);
    setStartDate(sub.start_date);
    setTargetDate(sub.target_date);
    setModal({ kind: "edit-subgoal", id: sub.id });
  }

  async function save() {
    if (!modal || !canSave) return;
    if (modal.kind === "new-goal") {
      const { data, error } = await supabase
        .from("goals")
        .insert({
          title: title.trim(),
          target_date: targetDate,
          start_date: startDate,
        })
        .select();
      if (error) {
        console.error(error);
        return;
      }
      setGoals((prev) => [...prev, ...data]);
    } else if (modal.kind === "edit-goal") {
      const { data, error } = await supabase
        .from("goals")
        .update({
          title: title.trim(),
          start_date: startDate,
          target_date: targetDate,
        })
        .eq("id", modal.id)
        .select();

      if (error) {
        console.error(error);
        return;
      }

      setGoals((prev) => prev.map((g) => (g.id === modal.id ? data[0] : g)));
    } else if (modal.kind === "new-subgoal") {
      const { data, error } = await supabase
        .from("subgoals")
        .insert({
          title: title.trim(),
          target_date: targetDate,
          start_date: startDate,
          goal_id: modal.goalId,
        })
        .select();
      if (error) {
        console.error(error);
        return;
      }
      setSubgoals((prev) => [...prev, ...data]);
    } else {
      const { data, error } = await supabase
        .from("subgoals")
        .update({
          title: title.trim(),
          start_date: startDate,
          target_date: targetDate,
        })
        .eq("id", modal.id)
        .select();

      if (error) {
        console.error(error);
        return;
      }

      setSubgoals((prev) => prev.map((g) => (g.id === modal.id ? data[0] : g)));
    }
    resetForm();
  }

  async function remove() {
    if (!modal) return;
    if (modal.kind === "edit-goal") {
      const { error } = await supabase
        .from("goals")
        .delete()
        .eq("id", modal.id);
      if (error) {
        console.error(error);
        return;
      }
      setGoals((prev) => prev.filter((g) => g.id !== modal.id));
      setSubgoals((prev) => prev.filter((s) => s.goal_id !== modal.id));
    } else if (modal.kind === "edit-subgoal") {
      const { error } = await supabase
        .from("subgoals")
        .delete()
        .eq("id", modal.id);
      if (error) {
        console.error(error);
        return;
      }
      setSubgoals((prev) => prev.filter((s) => s.id !== modal.id));
    }
    resetForm();
  }

  async function toggleGoal(id: string) {
    const goal = goals.find((g) => g.id === id);
    if (!goal) return;

    const completed = !goal.completed;
    const completedAt = completed ? new Date().toISOString() : null;

    const { error } = await supabase
      .from("goals")
      .update({ completed, completed_at: completedAt })
      .eq("id", id)
      .select();

    if (error) {
      console.error(error);
      return;
    }
    setGoals((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, completed, completed_at: completedAt } : g,
      ),
    );
  }

  async function toggleSub(id: string) {
    const subgoal = subgoals.find((s) => s.id === id);
    if (!subgoal) return;

    const completed = !subgoal.completed;
    const completedAt = completed ? new Date().toISOString() : null;

    const { error } = await supabase
      .from("subgoals")
      .update({ completed, completed_at: completedAt })
      .eq("id", id)
      .select();

    if (error) {
      console.error(error);
      return;
    }
    setSubgoals((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, completed, completed_at: completedAt } : s,
      ),
    );
  }

  function goalGroup(goal: Goal) {
    const subs = subgoals.filter((s) => s.goal_id === goal.id).sort(byTarget);
    const days = daysUntil(goal.target_date);
    const subDone = subs.filter((s) => s.completed).length;
    const pct = (subDone / subs.length) * 100;
    const status = statusFor(days, goal.completed);
    const overdue = !goal.completed && days < 0;

    return (
      <li key={goal.id} className="group border-b border-[#b8b5ae]/50">
        <div
          className={`flex items-center gap-3.5 px-6 pt-3.5 ${goal.completed ? "pb-3.5" : "pb-2"}`}
        >
          <button
            type="button"
            onClick={() => toggleGoal(goal.id)}
            aria-pressed={goal.completed}
            aria-label={`Mark "${goal.title}" as ${goal.completed ? "active" : "done"}`}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
              goal.completed
                ? "border-[#16759b] bg-[#16759b]"
                : "border-[#8a8780] hover:border-[#16759b]"
            }`}
          >
            {goal.completed && (
              <svg
                viewBox="0 0 12 12"
                className="h-3 w-3"
                fill="none"
                stroke="#fff"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M2 6.5 4.8 9 10 3.5" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={() => openEdit(goal)}
            className="flex min-w-0 flex-1 items-baseline gap-4 py-1 text-left"
          >
            <span
              className={`min-w-0 flex-1 truncate text-[15px] ${goal.completed ? "text-[#6b6963] line-through" : "text-[#1D2525]"}`}
            >
              {goal.title}
            </span>
            <span className="shrink-0 text-[12px] tabular-nums text-[#8a8780]">
              {fmtDate(goal.start_date)} → {fmtDate(goal.target_date)}
            </span>
            <span
              className={`w-[96px] shrink-0 text-right text-[12px] tabular-nums ${overdue ? "text-[#D26390]" : goal.completed ? "text-[#8a8780]" : days >= 0 && days <= 7 ? "text-[#1D2525]" : "text-[#6b6963]"}`}
            >
              {status}
            </span>
          </button>
        </div>
        {!goal.completed && subs.length > 0 && (
          <div className="px-6 pb-3.5">
            <div className="h-[3px] rounded-full bg-[#b8b5ae]/50">
              <div
                className="h-full rounded-full bg-[#16759b]"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {subs.length > 0 && <ul className="px-6 pb-1">{subs.map(subRow)}</ul>}
        {!goal.completed && (
          <div className="pb-3 pl-[58px] pr-6 pt-1">
            <button
              type="button"
              onClick={() => openNewSub(goal.id)}
              className="py-0.5 text-[12px] text-[#8a8780] opacity-0 transition hover:text-[#16759b] focus-visible:opacity-100 group-hover:opacity-100"
            >
              + Add subgoal
            </button>
          </div>
        )}
      </li>
    );
  }

  function subRow(sub: Subgoal) {
    const days = daysUntil(sub.target_date);
    const status = statusFor(days, sub.completed);
    const overdue = !sub.completed && days < 0;

    return (
      <li key={sub.id} className="flex items-center gap-3 py-1.5 pl-[34px]">
        <button
          type="button"
          onClick={() => toggleSub(sub.id)}
          aria-pressed={sub.completed}
          aria-label={`Mark "${sub.title}" as ${sub.completed ? "active" : "done"}`}
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${
            sub.completed
              ? "border-[#16759b] bg-[#16759b]"
              : "border-[#8a8780] hover:border-[#16759b]"
          }`}
        >
          {sub.completed && (
            <svg
              viewBox="0 0 12 12"
              className="h-2.5 w-2.5"
              fill="none"
              stroke="#fff"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M2 6.5 4.8 9 10 3.5" />
            </svg>
          )}
        </button>
        <button
          type="button"
          onClick={() => openEditSub(sub)}
          className="flex min-w-0 flex-1 items-baseline gap-4 text-left"
        >
          <span
            className={`min-w-0 flex-1 truncate text-[14px] ${sub.completed ? "text-[#6b6963] line-through" : "text-[#1D2525]"}`}
          >
            {sub.title}
          </span>
          <span
            className={`shrink-0 text-[12px] tabular-nums ${overdue ? "text-[#D26390]" : sub.completed ? "text-[#8a8780]" : days >= 0 && days <= 7 ? "text-[#1D2525]" : "text-[#6b6963]"}`}
          >
            {status}
          </span>
        </button>
      </li>
    );
  }

  return (
    <div className="flex h-[calc(100vh-40px)] flex-col bg-[#E4E0D8]">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#b8b5ae] px-6 pb-3 pt-4">
        <div>
          <h1 className="mt-0.5 text-[24px] font-medium leading-tight text-[#1D2525]">
            Goals
          </h1>
        </div>
        <div className="flex items-center gap-4 pb-0.5 text-[13px] text-[#6b6963]">
          {goals.length > 0 && (
            <>
              <span>
                <span className="font-semibold tabular-nums text-[#1D2525]">
                  {active.length}
                </span>{" "}
                active
              </span>
              <span className="h-3 w-px bg-[#b8b5ae]" />
              <span>
                <span className="font-semibold tabular-nums text-[#1D2525]">
                  {done.length}
                </span>{" "}
                done
              </span>
              <span className="h-3 w-px bg-[#b8b5ae]" />
            </>
          )}
          <button
            type="button"
            onClick={openNew}
            className="rounded-lg border border-[#b8b5ae] px-3 py-1.5 text-[13px] text-[#1D2525] transition-colors hover:border-[#16759b] hover:text-[#16759b]"
          >
            + Add goal
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pb-10">
        {goals.length === 0 && (
          <p className="px-6 py-10 text-center text-[13px] text-[#8a8780]">
            Nothing here yet. Add a goal to get started.
          </p>
        )}
        {active.length > 0 && (
          <>
            <h2 className="px-6 pb-2 pt-6 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a8780]">
              Active
            </h2>
            <ul className="border-t border-[#b8b5ae]">
              {active.map(goalGroup)}
            </ul>
          </>
        )}
        {done.length > 0 && (
          <>
            <h2 className="px-6 pb-2 pt-7 text-[11px] font-medium uppercase tracking-[0.14em] text-[#8a8780]">
              Done
            </h2>
            <ul className="border-t border-[#b8b5ae]">{done.map(goalGroup)}</ul>
          </>
        )}
      </div>
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={resetForm}
        >
          <div
            className="w-[400px] rounded-2xl bg-[#0C425A] p-6 text-[#E4E0D8] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-1 text-2xl font-medium">
              {`${isEdit ? "Edit" : "New"} ${isSub ? "subgoal" : "goal"}`}
            </h2>
            <p className="mb-4 text-[13px] text-[#E4E0D8]/70">
              {subParent
                ? `Under ${subParent.title}`
                : targetDate
                  ? `Due ${fmtDate(targetDate)}`
                  : ""}
            </p>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Run a half marathon"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") save();
                if (e.key === "Escape") resetForm();
              }}
              className="mb-4 w-full rounded-lg border border-[#777] bg-transparent px-3 py-2 outline-none placeholder:text-[#888] focus:border-[#6DBACB]"
            />
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm">Starts</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-[#777] bg-[#1D2525] px-3 py-2 outline-none [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm">Target</label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-lg border border-[#777] bg-[#1D2525] px-3 py-2 outline-none [color-scheme:dark]"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                {isEdit && (
                  <button
                    type="button"
                    onClick={remove}
                    className="rounded-lg px-3 py-2 text-[14px] text-[#E4E0D8]/70 hover:bg-white/10 hover:text-[#E4E0D8]"
                  >
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-lg px-4 py-2 hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={!canSave}
                  className="rounded-lg bg-[#16759b] px-4 py-2 text-white hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isEdit ? "Save" : `Add ${isSub ? "subgoal" : "goal"}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
