// Captures a screenshot of the focus rating modal for visual verification.
// Usage: node scripts/shot-modal.mjs  (Chrome on :9222, Next dev on :3000)
import { writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const CDP = "http://127.0.0.1:9222";
const targets = await (await fetch(`${CDP}/json`)).json();
const target = targets.find((t) => t.type === "page");
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
const waitFor = async (expr, label, timeoutMs = 30000) => {
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
  `document.readyState === "complete" && !!Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Start focus"))`,
  "page",
);

// Start + immediately stop to open the modal
await evalJs(
  `Array.from(document.querySelectorAll("button")).find(b => b.textContent.includes("Start focus")).click(); true`,
);
await waitFor(`!!document.querySelector('button[aria-label="Stop focus session"]')`, "running");
await sleep(1200);
await evalJs(`document.querySelector('button[aria-label="Stop focus session"]').click(); true`);
await waitFor(`!!document.querySelector('[aria-label="Rate your focus"]')`, "modal");

// Pick score 6 so the selected state is visible
await evalJs(
  `Array.from(document.querySelectorAll('[aria-label="Rate your focus"] button')).find(b => b.textContent.trim() === "6").click(); true`,
);
await sleep(300);

const shot = await send("Page.captureScreenshot", { format: "png" });
await writeFile("modal-shot.png", Buffer.from(shot.result.data, "base64"));
console.log("saved modal-shot.png");

// Close without saving: Discard clears the stored session entirely
await evalJs(
  `Array.from(document.querySelectorAll('[aria-label="Rate your focus"] button')).find(b => b.textContent.includes("Discard")).click(); true`,
);
ws.close();
