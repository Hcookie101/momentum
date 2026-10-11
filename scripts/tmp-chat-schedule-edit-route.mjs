// TEMPORARY diagnostic (safe to delete): the chat's schedule-edit approval
// lane end to end — propose_schedule_changes stages a batch (one valid add,
// one valid move, one valid remove, one deliberately-broken edit that must be
// dropped), the SSE stream carries it as a `proposal` event, the token never
// reaches the model, /api/ai/schedule/apply writes the approved subset
// against live rows, and the single-use token dies afterwards.
//
// It creates sacrificial calendar_events via the Supabase REST API (read from
// .env.local), points the proposal at them, and deletes them on the way out —
// real user events are never touched.
//   $ node scripts/tmp-chat-schedule-edit-route.mjs   (needs the dev server on :3000)
import http from "node:http";
import fs from "node:fs";

const PORT = 8797;

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("="))
    .map((line) => {
      const at = line.indexOf("=");
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);
const SUPA_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

async function rest(path, init = {}) {
  const response = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} -> ${response.status} ${JSON.stringify(body)}`);
  }
  return body;
}

// ---- sacrificial rows (day 6 = Saturday, early morning) ----------------------
const [keep, drop] = await rest("calendar_events", {
  method: "POST",
  body: JSON.stringify([
    { title: "E2E QA keep", day: 6, start_hour: 2, duration: 1, color: "#7CA9BD" },
    { title: "E2E QA drop", day: 6, start_hour: 1, duration: 1, color: "#D26390" },
  ]),
});
console.log(`sacrificial events: keep=${keep.id} drop=${drop.id}`);

async function cleanup() {
  for (const title of ["E2E QA block", "E2E QA keep", "E2E QA drop"]) {
    await rest(`calendar_events?title=eq.${encodeURIComponent(title)}`, {
      method: "DELETE",
      headers: { Prefer: "" },
    }).catch(() => null);
  }
}

// ---- mock OpenAI upstream --------------------------------------------------
// Round 1 (no tool result yet): stage the proposal. Round 2: the final text.
const seenBodies = [];
const upstream = http.createServer((req, res) => {
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    const body = JSON.parse(raw || "{}");
    seenBodies.push(body);
    const hasToolResult = (body.messages ?? []).some((m) => m.role === "tool");
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (!hasToolResult) {
      const args = JSON.stringify({
        summary: "E2E: add one, move one, remove one",
        edits: [
          { type: "add", title: "E2E QA block", day: 6, start_hour: 3, duration: 1 },
          { type: "move", id: keep.id, title: "E2E QA keep", day: 6, start_hour: 4, duration: 1 },
          { type: "remove", id: drop.id, title: "E2E QA drop" },
          // Deliberately broken: overlaps the add above AND repeats its title
          // — validation must drop it and report why.
          { type: "add", title: "E2E QA block", day: 6, start_hour: 3.5, duration: 1 },
        ],
      });
      res.end(
        `data: ${JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    function: { name: "propose_schedule_changes", arguments: args },
                  },
                ],
              },
            },
          ],
        })}\n\ndata: [DONE]\n\n`,
      );
      return;
    }
    res.end(
      `data: ${JSON.stringify({
        choices: [{ delta: { content: "I've staged the changes for your approval." } }],
      })}\n\ndata: [DONE]\n\n`,
    );
  });
});
await new Promise((resolve) => upstream.listen(PORT, "127.0.0.1", resolve));

const now = new Date();
const day = {
  date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`,
  from: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
  to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
  tzOffset: now.getTimezoneOffset(),
};

// ---- run the chat ----------------------------------------------------------
const response = await fetch("http://localhost:3000/api/ai", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-ai-provider": "openai",
    "x-ai-key": "sk-test",
    "x-ai-base-url": `http://127.0.0.1:${PORT}/v1`,
    "x-ai-model": "chat-edits-mock",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: "Please rework my Sunday morning." }],
    day,
  }),
});
const raw = await response.text();

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const events = raw
  .split(/\r?\n/)
  .filter((line) => line.startsWith("data:"))
  .map((line) => line.slice(5).trim())
  .filter((payload) => payload !== "[DONE]")
  .map((payload) => {
    try {
      return JSON.parse(payload);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const proposalEvent = events.find((event) => event.proposal);
check("chat status 200", response.status === 200);
check(
  "SSE stream carries a proposal event",
  Boolean(proposalEvent),
  JSON.stringify(events.filter((event) => !event.quota).slice(0, 3)),
);
const proposal = proposalEvent?.proposal;
check(
  "proposal lists the three valid edits and drops the broken one",
  proposal?.edits?.length === 3 && proposal?.dropped?.length === 1,
  JSON.stringify({ edits: proposal?.edits, dropped: proposal?.dropped }),
);
check(
  "every edit carries its approval index",
  proposal?.edits?.every((edit) => typeof edit.index === "number"),
);
const finalText = events.map((event) => event.text ?? "").join("");
check("the streamed answer still arrives", finalText.includes("staged"), JSON.stringify(finalText));

// The token must never be handed to the model: the tool result in the second
// upstream request is only a note.
const secondRound = seenBodies[1];
const toolNote = JSON.stringify(secondRound?.messages ?? []);
check(
  "tool result hides the token from the model",
  !toolNote.includes(proposal?.token ?? "missing"),
  toolNote.slice(-220),
);

// ---- apply the approved subset ---------------------------------------------
async function apply(token, approvals) {
  const applyResponse = await fetch("http://localhost:3000/api/ai/schedule/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, approvals }),
  });
  let body = null;
  try {
    body = await applyResponse.json();
  } catch {
    body = null;
  }
  return { status: applyResponse.status, body };
}

const approved = await apply(proposal.token, proposal.edits.map((edit) => edit.index));
check(
  "apply writes one add, one move, one remove",
  approved.status === 200 &&
    approved.body?.applied?.added === 1 &&
    approved.body?.applied?.moved === 1 &&
    approved.body?.applied?.removed === 1 &&
    approved.body?.skipped?.length === 0,
  JSON.stringify(approved.body),
);

const rows = await rest(
  "calendar_events?title=in.(%22E2E%20QA%20block%22,%22E2E%20QA%20keep%22,%22E2E%20QA%20drop%22)",
);
const blockRow = rows.find((row) => row.title === "E2E QA block");
const keepRow = rows.find((row) => row.title === "E2E QA keep");
check(
  "the add landed on Saturday 3:00",
  blockRow?.day === 6 && blockRow?.start_hour === 3 && blockRow?.duration === 1,
  JSON.stringify(blockRow),
);
check(
  "the move landed on Saturday 4:00",
  keepRow?.day === 6 && keepRow?.start_hour === 4,
  JSON.stringify(keepRow),
);
check(
  "the remove deleted the row",
  !rows.some((row) => row.title === "E2E QA drop"),
  JSON.stringify(rows),
);

// ---- the token is single-use ----------------------------------------------
const replay = await apply(proposal.token, proposal.edits.map((edit) => edit.index));
check("replaying the token is refused", replay.status === 410, JSON.stringify(replay.body));
const forged = await apply("not-a-real-token", [0]);
check("a forged token is refused", forged.status === 410, JSON.stringify(forged.body));

await cleanup();
console.log("sacrificial rows cleaned up");
upstream.close();
process.exit(failures === 0 ? 0 : 1);

