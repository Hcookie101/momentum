// ---- CONFIG ----
const SUPABASE_URL = "https://mkxzfanqdfjbrlotxsmk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_O9ZA9bldnMVJ58fmjs2hRA_W73-mOb9";
const ALARM = "tick";
const MAX_SESSION_SECONDS = 180; // cap any single logged chunk at 3 minutes

// ---- HELPERS ----
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

async function logSession(domain, durationSeconds) {
  if (!domain || durationSeconds < 3) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/browsing_sessions`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain, duration_seconds: durationSeconds }),
    });
  } catch (err) {
    console.error("Failed to log session:", err);
  }
}

// ---- PERSISTED STATE ----
async function getState() {
  const { current, lastCommit } = await chrome.storage.session.get(["current", "lastCommit"]);
  return {
    current: current || { tabId: null, domain: null },
    lastCommit: lastCommit || Date.now(),
  };
}

async function setState(current, lastCommit) {
  await chrome.storage.session.set({ current, lastCommit });
}

// ---- SERIAL QUEUE ----
// Chrome can fire several listeners in the same tick. Each one reads state,
// computes elapsed time, then writes state back — running them concurrently
// made them share a stale `lastCommit` and log the same time chunk multiple
// times (duplicate rows). Every listener below runs through `serialize` so
// tasks execute strictly one after another.
let queue = Promise.resolve();

function serialize(task) {
  const next = queue.then(task, task);
  queue = next.catch((err) => console.error("Momentum background task failed:", err));
  return next;
}


// ---- CORE TIMING LOGIC ----
async function commit() {
  const { current, lastCommit } = await getState();
  const now = Date.now();
  const elapsedSeconds = Math.min(MAX_SESSION_SECONDS, Math.round((now - lastCommit) / 1000));

  if (current.domain) {
    await logSession(current.domain, elapsedSeconds);
  }

  await setState(current, now);
}

async function setActiveTab(tabId) {
  await commit();

  let domain = null;
  try {
    const tab = await chrome.tabs.get(tabId);
    domain = hostOf(tab.url);
  } catch {
    // tab may have already closed
  }

  const { lastCommit } = await getState();
  await setState({ tabId, domain }, lastCommit);
}

async function clearActiveTab() {
  await commit();
  const { lastCommit } = await getState();
  await setState({ tabId: null, domain: null }, lastCommit);
}

async function isFocusedWindow(windowId) {
  const win = await chrome.windows.getLastFocused();
  return !!win && win.id === windowId && win.focused;
}

// ---- EVENT LISTENERS ----
// All listeners go through serialize() so state reads/writes never interleave.
chrome.tabs.onActivated.addListener((info) =>
  serialize(async () => {
    if (await isFocusedWindow(info.windowId)) await setActiveTab(info.tabId);
  }),
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) =>
  serialize(async () => {
    if (!changeInfo.url) return;
    const { current } = await getState();
    if (tabId === current.tabId && (await isFocusedWindow(tab.windowId))) {
      await setActiveTab(tabId);
    }
  }),
);

chrome.tabs.onRemoved.addListener((tabId) =>
  serialize(async () => {
    const { current } = await getState();
    if (tabId === current.tabId) await clearActiveTab();
  }),
);

chrome.windows.onFocusChanged.addListener((windowId) =>
  serialize(async () => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      await clearActiveTab();
      return;
    }
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab && tab.id) await setActiveTab(tab.id);
  }),
);

chrome.idle.onStateChanged.addListener((state) =>
  serialize(async () => {
    if (state !== "active") {
      await clearActiveTab();
      return;
    }
    await setState({ tabId: null, domain: null }, Date.now());
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id) await setActiveTab(tab.id);
  }),
);

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM) return;
  return serialize(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const { current } = await getState();
    if (tab && tab.id !== current.tabId) {
      await setActiveTab(tab.id);
    } else {
      await commit();
    }
  });
});

async function init() {
  chrome.alarms.create(ALARM, { periodInMinutes: 1 });
  await serialize(async () => {
    await setState({ tabId: null, domain: null }, Date.now());
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id) await setActiveTab(tab.id);
  });
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);