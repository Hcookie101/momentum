// Captures a screenshot of the stats page (recharts pie + week bar) for visual verification.
// Usage: node scripts/shot-stats.mjs  (Chrome on :9222, Next dev on :3000)
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CDP = "http://127.0.0.1:9222";
const targets = await (await fetch(`${CDP}/json`)).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("No CDP page target found");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
const evalJs = async (expression) =>
  (await send("Runtime.evaluate", { expression, awaitPromise: true })).result
    ?.result?.value;
const waitFor = async (expr, label, timeoutMs = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await evalJs(expr)) return;
    await sleep(250);
  }
  throw new Error("timeout: " + label);
};

await send("Page.enable");
await send("Page.navigate", { url: "http://localhost:3000/stats" });
await waitFor(
  `document.readyState === "complete" && !!Array.from(document.querySelectorAll("h1")).find(h => h.textContent.includes("Total time"))`,
  "stats page",
);
// Wait until recharts has drawn (or the empty state rendered instead).
await waitFor(
  `document.querySelectorAll(".recharts-surface").length >= 2 ||
   /No browsing time|No focus sessions/.test(document.body.textContent)`,
  "charts drawn",
);
await sleep(800);

const diag = await evalJs(`JSON.stringify({
  surfaces: document.querySelectorAll(".recharts-surface").length,
  pieSectors: document.querySelectorAll(".recharts-pie-sector").length,
  bars: document.querySelectorAll(".recharts-bar-rectangle").length,
  hasGrid: !!document.querySelector(".recharts-cartesian-grid"),
})`);
console.log("diag:", diag);

const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile("stats-shot.png", Buffer.from(shot.result.data, "base64"));
console.log("saved stats-shot.png");
ws.close();
