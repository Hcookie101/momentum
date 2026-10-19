// End-to-end CDP test: load extension, open popup, check console errors for favicon loading
const CDP = "http://[::1]:9333";

const targets = await (await fetch(`${CDP}/json`)).json();
const pageTarget = targets.find((t) => t.type === "page" && t.url === "about:blank");
if (!pageTarget) throw new Error("No about:blank page target found");
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m);
    pending.delete(m.id);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? "").join(" ");
    consoleErrors.push(`[${m.params.type}] ${text}`);
  }
  if (m.method === "Runtime.exceptionThrown") {
    pageErrors.push(`[exception] ${m.params.exceptionDetails.text}`);
  }
  if (m.method === "Page.loadEventFired") {
    console.log("Page load event fired");
  }
});
const send = (method, params = {}) => {
  const i = ++id;
  ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((r) => pending.set(i, r));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evalJs = async (expr) =>
  (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send("Runtime.enable");
await send("Page.enable");
await send("Log.enable");

// Navigate to chrome://extensions to find our extension ID
console.log("Navigating to chrome://extensions...");
await send("Page.navigate", { url: "chrome://extensions/" });
await sleep(5000);

// Evaluate JS to find our extension ID
const extensions = await evalJs(`
  (() => {
    // chrome://extensions uses <extensions-manager> which has shadow DOM
    // Try to find extension IDs from the page
    const manager = document.querySelector('extensions-manager');
    if (!manager) return 'no-manager';
    const itemList = manager.shadowRoot?.querySelector('extensions-item-list');
    if (!itemList) return 'no-item-list';
    const items = itemList.shadowRoot?.querySelectorAll('extensions-item');
    if (!items) return 'no-items';
    return Array.from(items).map(item => {
      const id = item.shadowRoot?.querySelector('#extension-id')?.textContent?.trim();
      const name = item.shadowRoot?.querySelector('#extension-name')?.textContent?.trim();
      const enabled = item.shadowRoot?.querySelector('#enable-toggle')?.checked ?? false;
      return { id, name, enabled };
    });
  })()
`);
console.log("Extensions found:", JSON.stringify(extensions, null, 2));

const momentumExt = extensions?.find((e) => e.name?.toLowerCase().includes('momentum'));
if (!momentumExt || !momentumExt.id) {
  console.log("Could not find Momentum extension ID. All extensions:", JSON.stringify(extensions));
  ws.close();
  process.exit(1);
}

console.log("Momentum extension ID:", momentumExt.id);

// Open the popup
const popupUrl = `chrome-extension://${momentumExt.id}/hello.html`;
console.log("Opening popup:", popupUrl);
await send("Page.navigate", { url: popupUrl });
await sleep(5000);

// Check console errors
console.log("\n=== Console errors:", consoleErrors.length, "===");
consoleErrors.forEach((e) => console.log("  ", e.slice(0, 300)));
console.log("=== Page exceptions:", pageErrors.length, "===");
pageErrors.forEach((e) => console.log("  ", e.slice(0, 300)));

// Check if favicons loaded (look for img elements in the popup)
const faviconImgs = await evalJs(`
  Array.from(document.querySelectorAll('img')).map(img => ({
    src: img.src,
    loaded: img.complete && img.naturalWidth > 0,
    width: img.naturalWidth
  }))
`);
console.log("\n=== Favicon images ===");
console.log(JSON.stringify(faviconImgs, null, 2));

const testResult = consoleErrors.length === 0 && pageErrors.length === 0 ? "PASS" : "FAIL";
console.log(`\n=== RESULT: ${testResult} ===`);

ws.close();
process.exit(testResult === "PASS" ? 0 : 1);
