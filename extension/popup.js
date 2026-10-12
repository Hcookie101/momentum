// ---- CONFIG ----
const SUPABASE_URL = "https://mkxzfanqdfjbrlotxsmk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_O9ZA9bldnMVJ58fmjs2hRA_W73-mOb9";
const MAX_ROWS = 5;
const SWATCHES = ["#7CA9BD", "#D26390", "#F5E573"];

const listEl = document.getElementById("list");
const totalEl = document.getElementById("total");
const hintEl = document.getElementById("hint");
const hintTextEl = document.getElementById("hintText");
const unlinkBtn = document.getElementById("unlink");

// ---- FORMATTING (matches the "00h06m" style used on the Stats page) ----
function formatDuration(totalSeconds) {
  const minutes = Math.floor((totalSeconds + 30) / 60);
  if (minutes < 1) return "<1m";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}h${String(mins).padStart(2, "0")}m`;
}

// The personal token pasted into the extension (chrome://extensions → details,
// or set programmatically). Stored locally, never synced.
async function getToken() {
  const stored = await chrome.storage.local.get("momentumToken");
  return (stored.momentumToken || "").trim();
}

// ---- DATA ----
async function postReadRpc(token, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/read_today_browsing`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// "Today" in the browser's own time zone — the RPC truncates at the
// caller's local midnight, matching the Stats page. If the database hasn't
// been migrated for p_tz yet, PostgREST answers 404 ("Could not find the
// function"), so retry with the old single-argument signature.
async function fetchTodaySessions(token) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  let res = await postReadRpc(token, { p_token: token, p_tz: timeZone });
  if (res.status === 404) res = await postReadRpc(token, { p_token: token });
  if (!res.ok) throw new Error(`Could not load sessions (${res.status})`);
  return res.json();
}

function groupByDomain(rows) {
  const totals = new Map();
  for (const row of rows) {
    if (!row.domain) continue;
    // Real sites always contain a dot. Older builds logged non-web pages
    // (chrome://extensions → "extensions", chrome-extension ids, …); skip
    // any such leftover rows so they don't skew the list or the total.
    if (!row.domain.includes(".")) continue;
    const seconds = Number(row.duration_seconds) || 0;
    totals.set(row.domain, (totals.get(row.domain) || 0) + seconds);
  }
  return [...totals.entries()]
    .map(([domain, seconds]) => ({ domain, seconds }))
    .sort((a, b) => b.seconds - a.seconds);
}

// ---- RENDER ----
function stateRow(message, retry) {
  const li = document.createElement("li");
  li.className = "state";
  li.textContent = message;
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Retry";
    button.addEventListener("click", load);
    li.appendChild(button);
  }
  return li;
}

function siteRow(site, index, maxSeconds) {
  const li = document.createElement("li");
  li.className = "row";

  const top = document.createElement("div");
  top.className = "row-top";

  const favicon = document.createElement("span");
  favicon.className = "favicon";
  const img = document.createElement("img");
  img.alt = "";
  img.src = `https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(
    site.domain,
  )}`;
  img.addEventListener("error", () => {
    favicon.textContent = site.domain[0].toUpperCase();
    favicon.style.background = SWATCHES[index % SWATCHES.length];
  });
  favicon.appendChild(img);

  const domain = document.createElement("span");
  domain.className = "domain";
  domain.textContent = site.domain;
  domain.title = site.domain;

  const time = document.createElement("span");
  time.className = "time";
  time.textContent = formatDuration(site.seconds);

  top.append(favicon, domain, time);

  const track = document.createElement("div");
  track.className = "track";
  const fill = document.createElement("span");
  fill.style.width = `${Math.max(4, Math.round((site.seconds / maxSeconds) * 100))}%`;
  track.appendChild(fill);

  li.append(top, track);
  return li;
}

function render(sites) {
  listEl.replaceChildren();

  if (sites.length === 0) {
    listEl.appendChild(
      stateRow("No browsing time logged yet today. Keep browsing — it adds up."),
    );
    totalEl.textContent = "00h00m";
    return;
  }

  const totalSeconds = sites.reduce((sum, site) => sum + site.seconds, 0);
  const maxSeconds = Math.max(sites[0].seconds, 1);
  const visible = sites.slice(0, MAX_ROWS);

  visible.forEach((site, index) =>
    listEl.appendChild(siteRow(site, index, maxSeconds)),
  );

  if (sites.length > MAX_ROWS) {
    const li = document.createElement("li");
    li.className = "more";
    const hidden = sites.length - MAX_ROWS;
    li.textContent = `+ ${hidden} more site${hidden === 1 ? "" : "s"}`;
    listEl.appendChild(li);
  }

  totalEl.textContent = formatDuration(totalSeconds);
}

// Persist the pasted token locally (never synced) and reload.
async function setToken(token) {
  await chrome.storage.local.set({ momentumToken: token });
}

// First-run panel: explain, accept the pasted token, save on Save/Enter.
function renderLinkPanel(errorMessage) {
  listEl.replaceChildren();
  totalEl.textContent = "—";

  const li = document.createElement("li");
  li.className = "link";

  const title = document.createElement("p");
  title.className = "link-title";
  title.textContent = "Link this browser";

  const sub = document.createElement("p");
  sub.className = "link-sub";
  sub.innerHTML =
    "Create a token in <b>Momentum → Settings</b>, then paste it here to start saving your browsing time.";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Paste your token";
  input.setAttribute("aria-label", "Extension token");
  input.autocomplete = "off";
  input.spellcheck = false;

  const actions = document.createElement("div");
  actions.className = "link-actions";

  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "Save & link";

  const status = document.createElement("span");
  status.className = "link-status";
  if (errorMessage) status.textContent = errorMessage;

  function submit() {
    const value = input.value.trim();
    if (!value) {
      input.focus();
      return;
    }
    save.disabled = true;
    save.textContent = "Linking…";
    setToken(value)
      .then(load)
      .catch(() => {
        save.disabled = false;
        save.textContent = "Save & link";
        status.textContent = "Couldn't save — try again.";
      });
  }

  save.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });

  actions.append(save, status);
  li.append(title, sub, input, actions);
  listEl.appendChild(li);
  input.focus();
}

async function load() {
  const token = await getToken();
  if (!token) {
    unlinkBtn.hidden = true;
    renderLinkPanel();
    return;
  }
  unlinkBtn.hidden = false;
  listEl.replaceChildren(stateRow("Collecting browsing time…"));
  totalEl.textContent = "—";
  try {
    const rows = await fetchTodaySessions(token);
    render(groupByDomain(rows));
  } catch (err) {
    console.error("Momentum popup:", err);
    listEl.replaceChildren(stateRow(err.message, true));
    totalEl.textContent = "—";
  }
}

// Forget the stored token and return to the link panel.
async function unlink() {
  await chrome.storage.local.remove("momentumToken");
  load();
}

unlinkBtn.addEventListener("click", unlink);

// ---- LIVE STATUS ----
async function renderLiveStatus() {
  try {
    const token = await getToken();
    if (!token) {
      hintEl.classList.remove("tracking");
      hintTextEl.textContent = "Paste your token above to start saving time.";
      return;
    }
    const { current } = await chrome.storage.session.get("current");
    if (current && current.domain) {
      hintEl.classList.add("tracking");
      hintTextEl.textContent = `Now tracking ${current.domain}`;
    } else {
      hintEl.classList.remove("tracking");
      hintTextEl.textContent = "Times update automatically while you browse.";
    }
  } catch {
    // Not running inside the extension (e.g. opened as a plain file).
  }
}

load();
renderLiveStatus();

if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "session" && changes.current) renderLiveStatus();
  });
}


