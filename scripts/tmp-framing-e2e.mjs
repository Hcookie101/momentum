// TEMPORARY diagnostic (safe to delete): drives the real chat panel in headless
// Chrome against the mock provider in scripts/tmp-crlf-provider.mjs — start
// that one first. Shows whether an answer that reaches the route is rendered.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const APP = "http://localhost:3000/stats";
const PROVIDER_URL = process.env.PROVIDER_URL ?? "http://127.0.0.1:8790/v1";

// ---- headless chrome + CDP ----
const profile = mkdtempSync(join(tmpdir(), "momentum-framing-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--remote-debugging-port=9222",
  `--user-data-dir=${profile}`,
  "--no-first-run",
  "--no-default-browser-check",
  "--window-size=1400,900",
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
const pending = new Map();
let nextId = 1;
const pageErrors = [];

function cdp(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
  });
}

function evaluate(expression) {
  return cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }).then(
    (out) => (out.exceptionDetails ? null : out.result?.value),
  );
}

let target;
for (let i = 0; i < 30 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch("http://127.0.0.1:9222/json/list")).json();
    target = list.find((t) => t.type === "page");
  } catch {
    /* chrome not up yet */
  }
}
if (!target) throw new Error("no CDP target");

ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.onopen = r;
  ws.onerror = j;
});
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id).resolve(msg.result ?? msg);
    pending.delete(msg.id);
  } else if (msg.method === "Runtime.exceptionThrown") {
    pageErrors.push(
      "exception: " + JSON.stringify(msg.params.exceptionDetails?.exception?.description ?? ""),
    );
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    pageErrors.push(
      "console.error: " +
        (msg.params.args ?? []).map((a) => a.value ?? a.description).join(" ").slice(0, 300),
    );
  }
};
await cdp("Page.enable");
await cdp("Runtime.enable");

await cdp("Page.navigate", { url: APP });
await sleep(4000);
await evaluate(`(() => {
  localStorage.setItem("momentum.ai.settings", JSON.stringify({
    provider: "openai", apiKey: "sk-test",
    baseUrl: "${PROVIDER_URL}", model: "gpt-4o-mini",
  }));
  location.reload();
  return true;
})()`);
await sleep(4000);

console.log(
  "hydrated:",
  await evaluate(`(() => {
    const b = document.querySelector('button[aria-label="Send message"]');
    return !!b && Object.keys(b).some((k) => k.startsWith("__reactProps$"));
  })()`),
);

async function realClick(x, y) {
  await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await cdp("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await cdp("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
async function boxCenter(nodeId) {
  const { model } = await cdp("DOM.getBoxModel", { nodeId });
  const q = model.border;
  return [(q[0] + q[2] + q[4] + q[6]) / 4, (q[1] + q[3] + q[5] + q[7]) / 4];
}

const docId = (await cdp("DOM.getDocument", { depth: 0 })).root.nodeId;
const taNode = await cdp("DOM.querySelector", { nodeId: docId, selector: "textarea" });
const [tx, ty] = await boxCenter(taNode.nodeId);
await realClick(tx, ty);
await cdp("Input.insertText", { text: "How much did I focus today?" });
await sleep(300);
const sendNode = await cdp("DOM.querySelector", {
  nodeId: docId,
  selector: 'button[aria-label="Send message"]',
});
const [sx, sy] = await boxCenter(sendNode.nodeId);
await realClick(sx, sy);

let snapshot = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  snapshot = await evaluate(`(() => ({
    streaming: !!document.querySelector('button[aria-label="Stop response"]'),
    bubbles: [...document.querySelectorAll("p")].map((p) => p.textContent).filter(Boolean).slice(-4),
    alert: document.querySelector('[role="alert"]')?.textContent ?? null,
  }))()`);
  if (snapshot && !snapshot.streaming && i > 3) break;
}
console.log("provider:", PROVIDER_URL);
console.log("result:", JSON.stringify(snapshot, null, 2));
console.log("page errors:", pageErrors.length ? pageErrors : "none");

ws.close();
chrome.kill();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* chrome still exiting */
}
process.exit(0);

