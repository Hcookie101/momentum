import { test, expect, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";

// Smoke suite mapping one-to-one onto docs/release-checklist.md.
// Test IDs mirror the checklist item numbers so a failure points straight at
// the row it gates. Authenticated flows require E2E_EMAIL / E2E_PASSWORD.

// ---- helpers ---------------------------------------------------------

function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

const UNIQUE = `${Date.now()}`;
const GOAL_TITLE = `E2E smoke goal ${UNIQUE}`;
const OBLIGATION_TITLE = `E2E smoke obligation ${UNIQUE}`;
const HAS_CREDS = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
const HAS_ONBOARDING_CREDS = Boolean(
  HAS_CREDS &&
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

type OnboardingClient = SupabaseClient<Database>;
type OnboardingFixtures = {
  goals: string[];
  obligations: string[];
  events: string[];
};

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
  await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  // Scope to the form: the mode-toggle tab is also named "Log in" (see 9.4).
  await page.locator("form").getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/schedule/, { timeout: 15_000 });
}

async function createOnboardingClient() {
  const client = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.E2E_EMAIL!,
    password: process.env.E2E_PASSWORD!,
  });
  if (error || !data.user) throw error ?? new Error("E2E login returned no user.");
  return { client, userId: data.user.id };
}

async function resetOnboarding(client: OnboardingClient, userId: string) {
  const { error } = await client.from("onboarding").delete().eq("user_id", userId);
  if (error) throw error;
}

async function addOnboardingFixture(
  client: OnboardingClient,
  userId: string,
  table: "goals" | "obligations" | "calendar_events",
): Promise<string> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (table === "goals") {
    const { data, error } = await client
      .from("goals")
      .insert({
        title: `E2E onboarding goal ${suffix}`,
        start_date: "2026-01-01",
        target_date: "2026-12-31",
        user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  if (table === "obligations") {
    const { data, error } = await client
      .from("obligations")
      .insert({
        title: `E2E onboarding obligation ${suffix}`,
        days: [1],
        start_hour: 7,
        duration: 0.5,
        color: "#7CA9BD",
        user_id: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  const { data, error } = await client
    .from("calendar_events")
    .insert({
      title: `E2E onboarding event ${suffix}`,
      day: 2,
      start_hour: 9,
      duration: 1,
      color: "#7CA9BD",
      user_id: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function ensureOnboardingFixtures(
  client: OnboardingClient,
  userId: string,
): Promise<OnboardingFixtures> {
  const fixtures: OnboardingFixtures = { goals: [], obligations: [], events: [] };
  for (const table of ["goals", "obligations", "calendar_events"] as const) {
    const { count, error } = await client
      .from(table)
      .select("id", { count: "exact", head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) continue;
    const id = await addOnboardingFixture(client, userId, table);
    fixtures[table === "calendar_events" ? "events" : table].push(id);
  }
  return fixtures;
}

async function cleanupOnboarding(
  client: OnboardingClient,
  userId: string,
  fixtures: OnboardingFixtures = { goals: [], obligations: [], events: [] },
) {
  await resetOnboarding(client, userId);
  const [goals, obligations, events] = await Promise.all([
    fixtures.goals.length
      ? client.from("goals").delete().in("id", fixtures.goals)
      : Promise.resolve({ error: null }),
    fixtures.obligations.length
      ? client.from("obligations").delete().in("id", fixtures.obligations)
      : Promise.resolve({ error: null }),
    fixtures.events.length
      ? client.from("calendar_events").delete().in("id", fixtures.events)
      : Promise.resolve({ error: null }),
  ]);
  if (goals.error || obligations.error || events.error) {
    throw goals.error ?? obligations.error ?? events.error;
  }
}

test.describe("1 · Build & quality gates", () => {
  test("1.1 · landing renders with no console errors", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/");
    await expect(page.locator("h1")).toBeVisible();
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("1.2 · privacy page prerendered, no console errors", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Momentum");
    expect(errors).toHaveLength(0);
  });

  test("1.3 · login page loads, no console errors", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.goto("/login");
    await expect(page.getByLabel("Email")).toBeVisible();
    expect(errors).toHaveLength(0);
  });
});

test.describe("2 · Authentication and onboarding", () => {
  test("2.1 · protected route redirects to login when signed out", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/schedule");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByLabel("Email")).toBeVisible();
  });

  test("2.2 · login shows empty, error, and pending states", async ({ page }) => {
    await page.goto("/login");
    // Empty: submit disabled with blank fields. Scope to the form — the
    // mode-toggle tab is also named "Log in" but is never disabled.
    await expect(
      page.locator("form").getByRole("button", { name: "Log in" }),
    ).toBeDisabled();
    // Error: bad creds surface an inline alert.
    await page.getByLabel("Email").fill(`nobody-${UNIQUE}@example.invalid`);
    await page.getByLabel("Password").fill("wrong-password-here");
    await page.locator("form").getByRole("button", { name: "Log in" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  });

  test.skip(
    !HAS_CREDS,
    "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows",
  );

  test("2.3 · sign-in works for an existing account", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("2.4 · sign-out clears session and lands on login", async ({ page }) => {
    await signIn(page);
    await page.getByRole("button", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
    // Re-visiting a protected route bounces again.
    await page.goto("/goals");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("3 · Goals workflow", () => {
  test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");

  test("3.1-3.5 · create, edit, complete, list sections", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();

    // Create a goal.
    await page.getByRole("button", { name: "+ Add goal" }).click();
    await page.getByPlaceholder(/essay|goal|title|marathon/i).first().fill(GOAL_TITLE);
    const dateInputs = page.locator('input[type="date"]');
    await dateInputs.nth(0).fill("2026-10-20");
    await dateInputs.nth(1).fill("2026-11-15");
    // Exact: "/Add goal/" would also match the "+ Add goal" trigger.
    await page.getByRole("button", { name: "Add goal", exact: true }).click();
    await expect(page.getByText(GOAL_TITLE)).toBeVisible({ timeout: 10_000 });

    // Edit it.
    await page.getByText(GOAL_TITLE).click();
    await page.getByPlaceholder(/essay|goal|title|marathon/i).first().fill(`${GOAL_TITLE} (edited)`);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(`${GOAL_TITLE} (edited)`)).toBeVisible();

    // Mark complete → moves to the Done section. The toggle's accessible
    // name carries the title as-is (which the edit step just changed).
    await page
      .getByRole("button", {
        name: new RegExp(`Mark "${GOAL_TITLE} \\(edited\\)" as done`),
      })
      .first()
      .click();
    await expect(page.getByText("Done", { exact: true })).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    // Cleanup: delete it.
    await page.getByText(`${GOAL_TITLE} (edited)`).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText(`${GOAL_TITLE} (edited)`)).toBeHidden({ timeout: 10_000 });

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

test.describe("4 · Obligations workflow", () => {
  test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");

  test("4.1-4.4 · create recurring, reload persists, edit, delete", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    await page.goto("/obligations");
    await expect(page.getByRole("heading", { name: "Obligations" })).toBeVisible();

    // Create from an empty grid slot.
    await page.getByTitle(/add obligation/).first().click();
    await expect(page.getByRole("heading", { name: "New obligation" })).toBeVisible();
    await page.getByPlaceholder(/e\.g\.|lecture|gym/i).fill(OBLIGATION_TITLE);
    // Day toggles carry aria-labels from the full day names ("Mon", not "M").
    await page.getByRole("button", { name: "Mon", exact: true }).click();
    await page.getByRole("button", { name: "Pin it" }).click();
    // The pinned calendar block is also a button carrying the title. The
    // obligation lands on the slot's day plus every toggled day, so more
    // than one block can match.
    await expect(
      page
        .getByRole("button", { name: new RegExp(`${OBLIGATION_TITLE} \\d`) })
        .first(),
    ).toBeVisible({ timeout: 10_000 });

    // Reload → recurrence persists. A pinned obligation renders one block
    // per selected day, so target the block button (unique accessible name)
    // rather than the bare text, which appears in every block.
    const block = () =>
      page.getByRole("button", { name: new RegExp(`${OBLIGATION_TITLE} \\d`) });
    await page.reload();
    await expect(block().first()).toBeVisible({ timeout: 10_000 });

    // Edit → rename persists after reload.
    await block().first().click();
    await expect(page.getByRole("heading", { name: "Edit obligation" })).toBeVisible();
    await page.getByPlaceholder(/e\.g\.|lecture|gym/i).fill(`${OBLIGATION_TITLE} (edited)`);
    await page.getByRole("button", { name: "Save" }).click();
    const editedBlock = () =>
      page.getByRole("button", {
        name: new RegExp(`${OBLIGATION_TITLE} \\(edited\\) \\d`),
      });
    await expect(editedBlock().first()).toBeVisible();
    await page.reload();
    await expect(editedBlock().first()).toBeVisible({ timeout: 10_000 });

    // Delete → gone, grid intact.
    await editedBlock().first().click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(editedBlock().first()).toBeHidden({ timeout: 10_000 });

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});

test.describe("5 · Schedule workflow", () => {
  test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");

  test("5.4-5.5 · view loads across widths, no overflow at 360px", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
    await expect(page.getByPlaceholder(/Ask anything|Add an API key/)).toBeVisible();

    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 4,
      );
      expect(overflow, `schedule overflows at ${width}px`).toBe(false);
    }

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});


test.describe("6 · Focus timer and stats", () => {
  test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");

  test("6.1-6.4 · start → stop → rate → save, stats render", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    await page.goto("/stats");
    await expect(page.getByText("Total time spent on task")).toBeVisible();

    await page.getByRole("button", { name: /Start focus/ }).click();
    await expect(
      page.getByRole("button", { name: "Stop focus session" }),
    ).toBeVisible({ timeout: 5_000 });

    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Stop focus session" }).click();

    const rateModal = page.getByRole("dialog", { name: "Rate your focus" });
    await expect(rateModal).toBeVisible({ timeout: 5_000 });

    await rateModal.getByRole("button", { name: "7", exact: true }).click();
    await rateModal.getByRole("button", { name: "Save session" }).click();
    await expect(rateModal).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Start focus/ })).toBeVisible();
    await expect(page.getByText("Total time spent on task")).toBeVisible();

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});


test.describe("7 · AI and quota behavior", () => {
  test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");

  test("7.1-7.3 · chat placeholder reflects config; settings dialog operable", async ({
    page,
  }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    // Placeholder flips between configured/unconfigured — both explicit.
    await expect(page.getByPlaceholder(/Ask anything|Add an API key/)).toBeVisible();

    // AI settings dialog opens (explicit failure surface for rate limits:
    // the status line under the form).
    await page.getByRole("button", { name: "AI settings" }).click();
    const dialog = page.getByRole("dialog", { name: /Connect an AI/ });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });
});


test.describe("8 · Browser extension and privacy", () => {
  test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");

  test("8.1-8.3 · token create → shown once → copy → revoke", async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await signIn(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // Privacy disclosure line visible (8.4/8.5). Scoped to the Browsing data
    // section — the settings page footer repeats similar wording.
    await expect(
      page
        .locator("section")
        .filter({ hasText: "Browsing data" })
        .getByText(/never full URLs/i),
    ).toBeVisible();

    // Create a token.
    await page.getByPlaceholder(/label|name/i).first().fill(`e2e-${UNIQUE}`);
    await page.getByRole("button", { name: "Create token" }).click();
    // Shown exactly once with a copy affordance.
    await expect(page.getByText(/shown only once/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();

    // Revoke → row marked revoked.
    await page.getByRole("button", { name: "Revoke" }).first().click();
    await expect(page.getByText("revoked").first()).toBeVisible({ timeout: 10_000 });

    expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  });

  test("8.5 · delete browsing data has confirm + cancel path", async ({ page }) => {
    await signIn(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Browsing data" })).toBeVisible();
    await page.getByRole("button", { name: /Delete my browsing data/ }).click();
    await expect(page.getByRole("button", { name: "Keep it" })).toBeVisible();
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(
      page.getByRole("button", { name: /Delete my browsing data/ }),
    ).toBeVisible();
  });

  test("8.6 · feedback form validates empty input and submits", async ({
    page,
  }) => {
    await signIn(page);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Send feedback" })).toBeVisible();
    // Empty: submit is disabled until there's a message.
    const submit = page.getByRole("button", { name: "Send feedback" });
    await expect(submit).toBeDisabled();
    // Fill and submit → success status appears.
    await page
      .getByLabel("Feedback")
      .fill(`E2E smoke feedback ${UNIQUE} — thanks for everything.`);
    await page.getByRole("button", { name: "Problem" }).click();
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect(page.getByRole("status")).toContainText("Thanks");
  });

  test("8.7 · first visit shows the getting-started steps", async ({ page }) => {
    test.skip(!HAS_ONBOARDING_CREDS, "Set E2E credentials and Supabase public env vars");
    const { client, userId } = await createOnboardingClient();
    await resetOnboarding(client, userId);

    try {
      await signIn(page);
      await expect(
        page.getByRole("heading", { name: "A few things to get started" }),
      ).toBeVisible();
      const onboardingHeading = page.getByRole("heading", {
        name: "A few things to get started",
      });
      expect(
        await onboardingHeading.evaluate((heading) =>
          Boolean(heading.closest("div.h-full.overflow-auto")),
        ),
      ).toBe(true);
      for (const label of ["Add a goal", "Add an obligation", "Connect an AI", "Generate a schedule"]) {
        await expect(page.getByRole("link", { name: new RegExp(label) }).or(
          page.getByRole("button", { name: new RegExp(label) }),
        )).toBeVisible();
      }
    } finally {
      await cleanupOnboarding(client, userId);
    }
  });

  test("8.8 · dismissal persists after reload", async ({ page }) => {
    test.skip(!HAS_ONBOARDING_CREDS, "Set E2E credentials and Supabase public env vars");
    const { client, userId } = await createOnboardingClient();
    await resetOnboarding(client, userId);

    try {
      await signIn(page);
      const heading = page.getByRole("heading", { name: "A few things to get started" });
      await expect(heading).toBeVisible();
      await page.getByRole("button", { name: "Dismiss", exact: true }).click();
      await expect(heading).toBeHidden();
      await page.reload();
      await expect(heading).toBeHidden();
    } finally {
      await cleanupOnboarding(client, userId);
    }
  });

  test("8.9 · an incomplete data step updates when its row is added", async ({ page }) => {
    test.skip(!HAS_ONBOARDING_CREDS, "Set E2E credentials and Supabase public env vars");
    const { client, userId } = await createOnboardingClient();
    const [goals, obligations, events] = await Promise.all([
      client.from("goals").select("id", { count: "exact", head: true }),
      client.from("obligations").select("id", { count: "exact", head: true }),
      client.from("calendar_events").select("id", { count: "exact", head: true }),
    ]);
    if (goals.error || obligations.error || events.error) {
      throw goals.error ?? obligations.error ?? events.error;
    }
    const missingTable =
      goals.count === 0
        ? "goals"
        : obligations.count === 0
          ? "obligations"
          : events.count === 0
            ? "calendar_events"
            : null;
    test.skip(
      !missingTable,
      "The E2E account already has all three data-backed steps; the AI live update is covered in 8.10.",
    );
    await resetOnboarding(client, userId);
    const fixtures: OnboardingFixtures = { goals: [], obligations: [], events: [] };

    try {
      await signIn(page);
      const step = missingTable === "goals"
        ? { label: "Add a goal", locator: page.getByRole("link", { name: "Add a goal, incomplete" }) }
        : missingTable === "obligations"
          ? { label: "Add an obligation", locator: page.getByRole("link", { name: "Add an obligation, incomplete" }) }
          : { label: "Generate a schedule", locator: page.getByRole("link", { name: "Generate a schedule, incomplete" }) };
      await expect(step.locator).toBeVisible();
      const id = await addOnboardingFixture(client, userId, missingTable!);
      fixtures[missingTable === "goals" ? "goals" : missingTable === "obligations" ? "obligations" : "events"].push(id);
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(
        page.getByRole("link", { name: new RegExp(`${step.label}, complete`) }),
      ).toBeVisible();
    } finally {
      await cleanupOnboarding(client, userId, fixtures);
    }
  });

  test("8.10 · completing all steps shows a one-time success state", async ({ page }) => {
    test.skip(!HAS_ONBOARDING_CREDS, "Set E2E credentials and Supabase public env vars");
    const { client, userId } = await createOnboardingClient();
    await resetOnboarding(client, userId);
    const fixtures = await ensureOnboardingFixtures(client, userId);

    try {
      await signIn(page);
      await page.getByRole("button", { name: "Connect an AI, incomplete" }).click();
      const dialog = page.getByRole("dialog", { name: "Connect an AI" });
      await dialog.getByLabel("API key").fill("e2e-not-a-real-provider-key");
      await dialog.getByRole("button", { name: "Save" }).click();

      const success = page.getByRole("heading", { name: "You've got a plan" });
      await expect(success).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Got it" }).click();
      await expect(success).toBeHidden();
      await page.reload();
      await expect(success).toBeHidden();

      const { data, error } = await client
        .from("onboarding")
        .select("completed_at")
        .eq("user_id", userId)
        .single();
      if (error) throw error;
      expect(data.completed_at).not.toBeNull();
    } finally {
      await cleanupOnboarding(client, userId, fixtures);
    }
  });

  test("8.11 · a failed onboarding load shows a retry and recovers", async ({ page }) => {
    test.skip(!HAS_ONBOARDING_CREDS, "Set E2E credentials and Supabase public env vars");
    const { client, userId } = await createOnboardingClient();
    await resetOnboarding(client, userId);
    let rejectGoalsRequest = true;
    await page.route("**/rest/v1/goals**", (route) =>
      rejectGoalsRequest ? route.abort() : route.continue(),
    );

    try {
      await signIn(page);
      await expect(
        page.getByText("Couldn't load your getting-started steps."),
      ).toBeVisible();
      rejectGoalsRequest = false;
      await page.getByRole("button", { name: "Try again" }).click();
      await expect(
        page.getByRole("heading", { name: "A few things to get started" }),
      ).toBeVisible();
    } finally {
      await cleanupOnboarding(client, userId);
    }
  });
});


test.describe("9 · Accessibility and responsive QA", () => {
  test("9.1 · keyboard Tab reaches interactive elements on landing", async ({
    page,
  }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? { tag: el.tagName, text: el.textContent?.trim() } : null;
    });
    expect(active).not.toBeNull();
    expect(active!.tag).toMatch(/A|BUTTON|INPUT/);
  });

  test("9.2 · all links/buttons have discernible names", async ({ page }) => {
    await page.goto("/login");
    const unnamed = await page.evaluate(() => {
      const results: string[] = [];
      document.querySelectorAll("button, a[href]").forEach((el) => {
        const text = (el.textContent || "").trim();
        const aria = el.getAttribute("aria-label");
        const title = el.getAttribute("title");
        if (!text && !aria && !title) results.push(el.outerHTML.slice(0, 120));
      });
      return results;
    });
    expect(unnamed, `unnamed controls: ${unnamed.join(" | ")}`).toHaveLength(0);
  });

  test("9.3 · no horizontal overflow at 360 / 768 / 1280", async ({ page }) => {
    for (const path of ["/", "/login", "/privacy"]) {
      for (const width of [360, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth + 4,
        );
        expect(overflow, `${path} overflows at ${width}px`).toBe(false);
      }
    }
  });

  test("9.4 · form inputs labelled; validation blocks bad input", async ({
    page,
  }) => {
    await page.goto("/login");
    const email = page.getByLabel("Email");
    const pass = page.getByLabel("Password");
    await expect(email).toBeVisible();
    await expect(pass).toBeVisible();
    await email.fill("not-an-email-at-all");
    await pass.fill("x");
    // Scope to the form: the mode-toggle tab is also named "Log in".
    await page
      .locator("form")
      .getByRole("button", { name: "Log in" })
      .click();
    const invalid = await email.evaluate(
      (el) => !(el as HTMLInputElement).checkValidity(),
    );
    const hasAlert = await page
      .getByRole("alert")
      .isVisible()
      .catch(() => false);
    expect(invalid || hasAlert).toBe(true);
  });
});

test.describe("10 · Deployment safety", () => {
  test("10.1 · no service-role / secret keys in served HTML", async ({
    request,
  }) => {
    for (const path of ["/", "/login", "/privacy"]) {
      const res = await request.get(path);
      const body = await res.text();
      expect(body).not.toContain("service_role");
      expect(body).not.toContain("sb_secret_");
    }
  });

  test("10.2 · security headers present, x-powered-by absent", async ({
    request,
  }) => {
    const res = await request.get("/privacy");
    const h = res.headers();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(h["x-powered-by"]).toBeUndefined();
  });

  test("10.3 · unauthenticated AI routes reject with 401", async ({ request }) => {
    // Each route's own verb: quota is GET-only (POST there is a 405, not 401).
    const checks: { path: string; method: "get" | "post" }[] = [
      { path: "/api/ai", method: "post" },
      { path: "/api/ai/quota", method: "get" },
      { path: "/api/ai/schedule", method: "post" },
      { path: "/api/ai/subgoals", method: "post" },
    ];
    for (const { path, method } of checks) {
      const res =
        method === "get"
          ? await request.get(path)
          : await request.post(path, { data: {} });
      expect(res.status(), `${path} (${method}) should be 401`).toBe(401);
    }
  });

  test("10.4 · open redirect on auth callback is blocked", async ({ request }) => {
    const res = await request.get("/auth/callback?next=https://evil.example/phish", {
      maxRedirects: 0,
    });
    const location = res.headers()["location"];
    if (location) {
      expect(location).not.toMatch(/^https?:\/\/(?!localhost)/);
    }
  });

  test("10.5 · extension manifest safe for release", async () => {
    const fs = await import("node:fs");
    const manifest = JSON.parse(
      fs.readFileSync("extension/manifest.json", "utf8"),
    );
    expect(manifest.version).toMatch(/^\d+\.\d+$/);
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.incognito).toBe("not_allowed");
    const perms: string[] = manifest.permissions;
    expect(perms).toEqual(
      expect.arrayContaining(["tabs", "storage", "alarms", "idle", "favicon"]),
    );
    expect(perms).not.toContain("history");
    expect(perms).not.toContain("webRequest");
    expect(perms).not.toContain("cookies");
    expect(manifest.host_permissions).toEqual([
      "https://mkxzfanqdfjbrlotxsmk.supabase.co/*",
    ]);
  });
});
