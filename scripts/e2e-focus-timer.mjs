// E2E smoke test for the focus timer: start → stop → rate → save → verify DB.
// Usage: node scripts/e2e-focus-timer.mjs   (Chrome on :9222, Next dev on :3000)
import { setTimeout as sleep } from "node:timers/promises";

const CDP = "http://127.0.0.1:9222";
const APP = "http://localhost:3000/stats";
const KEY = "sb_publishable_O9ZA9bldnMVJ58fmjs2hRA_W73-mOb9";
const API = "https://mkxzfanqdfjbrlotxsmk.supabase.co/rest/v1/focus_sessions";

const targets = await (await fetch(`${CDP}/json`)).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("No CDP page target found");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
});
function send(method, params = {}) {
  const msgId = ++id;
  ws.send(JSON.stringify({ id: msgId, method, params }));
  return new Promise((resolve) => pending.set(msgId, resolve));
}
async function evaluate(expression) {
  const res = await send("Runtime.evaluate", { expression, awaitPromise: true });
  if (res.result?.exceptionDetails) {
    throw new Error(res.result.exceptionDetails.text + " " + JSON.stringify(res.result.exceptionDetails.exception));
  }
  return res.result?.result?.value;
}
async function waitFor(expression, label, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await evaluate(expression)) return true;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: APP });
await waitFor(
  `document.readyState === "complete" && !!Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Start focus"))`,
  "stats page + Start focus button",
);

// 1) Start the timer
await evaluate(
  `Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Start focus")).click(); true`,
);
await waitFor(
  `!!document.querySelector('button[aria-label="Stop focus session"]')`,
  "running timer pill",
);
console.log("✓ timer started (Stop button visible)");

// 2) Stop it → rating modal
await sleep(1500);
await evaluate(`document.querySelector('button[aria-label="Stop focus session"]').click(); true`);
await waitFor(`!!document.querySelector('[aria-label="Rate your focus"]')`, "rating modal");
console.log("✓ rating modal opened after Stop");

// 3) Rate 7 and save
await evaluate(
  `Array.from(document.querySelectorAll('[aria-label="Rate your focus"] button'))
     .find(b => b.textContent.trim() === "7").click(); true`,
);
await evaluate(
  `Array.from(document.querySelectorAll('[aria-label="Rate your focus"] button'))
     .find(b => b.textContent.includes("Save session")).click(); true`,
);
await waitFor(
  `!document.querySelector('[aria-label="Rate your focus"]') &&
   !!Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Start focus"))`,
  "modal closed + idle button restored",
  10000,
);
console.log("✓ session saved, modal closed, timer back to idle");

// 4) Verify the row landed in Supabase with score 7
const rows = await (
  await fetch(`${API}?select=*&focus_score=eq.7&order=created_at.desc&limit=1`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  })
).json();
if (!rows.length) throw new Error("No focus_sessions row with score 7 found in DB");
const row = rows[0];
const duration = (Date.parse(row.end_time) - Date.parse(row.start_time)) / 1000;
if (!(duration >= 1)) throw new Error(`Bad duration: ${duration}s`);
console.log(`✓ DB row verified: score=${row.focus_score}, duration=${Math.round(duration)}s, start=${row.start_time}`);

ws.close();
console.log("E2E PASS");
