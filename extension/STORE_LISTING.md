# Chrome Web Store listing draft — Momentum Tracker

> Keep this file as the source of truth for the store submission; copy each
> section into the Developer Dashboard verbatim.

## Short description (≤132 chars)

Shows where your browsing time went — domains + minutes per day, in your own Momentum dashboard.

## Full description

Momentum Tracker logs how long each site was your active tab and totals it
per domain for today — shown in the popup and on your Momentum Stats page.

**What is collected:** the site's domain (e.g. example.com) and seconds
active. That is all.

**What is never collected:** full URLs, page paths, query strings, page
contents, form inputs, passwords, or keystrokes. The extension has no content
scripts and cannot read page contents. Incognito windows are never tracked
(`"incognito": "not_allowed"` in the manifest).

**Where it goes:** your own Momentum account only (Supabase project
mkxzfanqdfjbrlotxsmk, tables `browsing_sessions` / `extension_tokens`). Site
icons in the popup come from Chrome's on-device favicon cache — no browsing
data is sent to any third party.

**Your controls:** revoke a browser's token in Momentum → Settings to stop
future logging; “Delete my browsing data” in Settings permanently removes all
history. Privacy policy: https://YOUR-DOMAIN/privacy

## Category

Productivity

## Permissions justification (for reviewers)

- `tabs` — read the active tab's hostname + window focus so only the visible
  page accrues time. Only `tab.url` hostname is used; full URLs are discarded.
- `storage` — keep the link token locally (`chrome.storage.local`) and the
  current-tab timing state (`chrome.storage.session`).
- `alarms` — one 1-minute tick that commits the elapsed time slice.
- `idle` — stop the clock when the machine locks or goes idle.
- `favicon` — paint the popup's per-site icons from Chrome's local favicon
  cache (no network, no third party).
- Host permission `https://mkxzfanqdfjbrlotxsmk.supabase.co/*` — the only
  network destination: writing time slices and reading today's totals.

## Data-use declarations (Privacy tab)

- Personal data collected: browsing history (domain + duration only).
- Transmitted to: the user's own Momentum account (Supabase).
- Not sold, not shared with third parties, not used for advertising.
- Deletion: in-product “Delete my browsing data” + token revoke.
