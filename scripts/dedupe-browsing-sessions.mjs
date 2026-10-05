// One-off cleanup: remove duplicate browsing_sessions rows created by the
// background.js race (same domain + same duration within 500ms of another row).
//
//   node scripts/dedupe-browsing-sessions.mjs          # dry run (no writes)
//   node scripts/dedupe-browsing-sessions.mjs --apply  # delete the duplicates
//
// Safe rule: a duplicate is a row whose (domain, duration_seconds) matches a
// previous row and whose visited_at is within 500ms of it. Genuine rows are
// at least ~1 minute apart (alarm tick) or have different durations, and the
// race only produced duplicates when elapsed >= 3s (logSession's minimum).

const SUPABASE_URL = "https://mkxzfanqdfjbrlotxsmk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_O9ZA9bldnMVJ58fmjs2hRA_W73-mOb9";
const TOLERANCE_MS = 500;
const APPLY = process.argv.includes("--apply");

const headers = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
};

async function fetchAll() {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/browsing_sessions?select=id,domain,duration_seconds,visited_at&order=visited_at.asc&limit=${pageSize}&offset=${offset}`,
      { headers },
    );
    if (!res.ok) throw new Error(`Fetch failed (${res.status}): ${await res.text()}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

function findDuplicates(rows) {
  const lastSeen = new Map(); // key -> { id, visited_at }
  const duplicates = [];
  for (const row of rows) {
    const key = `${row.domain}|${row.duration_seconds}`;
    const time = Date.parse(row.visited_at);
    const prev = lastSeen.get(key);
    if (prev && time - Date.parse(prev.visited_at) <= TOLERANCE_MS) {
      duplicates.push(row);
    } else {
      lastSeen.set(key, row);
    }
  }
  return duplicates;
}

async function deleteRows(ids) {
  // PostgREST accepts id=in.(...) — batch to keep URLs reasonable.
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/browsing_sessions?id=in.(${batch.join(",")})`,
      { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } },
    );
    if (!res.ok) throw new Error(`Delete failed (${res.status}): ${await res.text()}`);
  }
}

const rows = await fetchAll();
const duplicates = findDuplicates(rows);
const totalSeconds = (list) => list.reduce((sum, r) => sum + r.duration_seconds, 0);

console.log(`Scanned ${rows.length} rows (${totalSeconds(rows)}s total).`);
console.log(`Found ${duplicates.length} duplicates (${totalSeconds(duplicates)}s inflated).`);

if (duplicates.length === 0) {
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry run — re-run with --apply to delete:");
  for (const row of duplicates.slice(0, 20)) {
    console.log(`  ${row.domain} ${row.duration_seconds}s @ ${row.visited_at}`);
  }
  if (duplicates.length > 20) console.log(`  … and ${duplicates.length - 20} more`);
  process.exit(0);
}

await deleteRows(duplicates.map((r) => r.id));
const after = await fetchAll();
console.log(
  `Deleted ${duplicates.length} rows. Now ${after.length} rows (${totalSeconds(after)}s total).`,
);
