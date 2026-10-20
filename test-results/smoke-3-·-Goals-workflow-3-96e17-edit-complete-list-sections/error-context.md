# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> 3 · Goals workflow >> 3.1-3.5 · create, edit, complete, list sections
- Location: tests\smoke.spec.ts:103:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Goals' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Goals' }) with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Goals' })

```

```yaml
- img
- heading "This page couldn’t load" [level=1]
- paragraph: Reload to try again, or go back.
- button "Reload"
- button "Back"
```

# Test source

```ts
  7   | // ---- helpers ---------------------------------------------------------
  8   | 
  9   | function trackConsoleErrors(page: Page) {
  10  |   const errors: string[] = [];
  11  |   page.on("console", (msg) => {
  12  |     if (msg.type() === "error") errors.push(msg.text());
  13  |   });
  14  |   return errors;
  15  | }
  16  | 
  17  | const UNIQUE = `${Date.now()}`;
  18  | const GOAL_TITLE = `E2E smoke goal ${UNIQUE}`;
  19  | const OBLIGATION_TITLE = `E2E smoke obligation ${UNIQUE}`;
  20  | const HAS_CREDS = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);
  21  | 
  22  | async function signIn(page: Page) {
  23  |   await page.goto("/login");
  24  |   await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
  25  |   await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
  26  |   // Scope to the form: the mode-toggle tab is also named "Log in" (see 9.4).
  27  |   await page.locator("form").getByRole("button", { name: "Log in" }).click();
  28  |   await page.waitForURL(/\/schedule/, { timeout: 15_000 });
  29  | }
  30  | 
  31  | test.describe("1 · Build & quality gates", () => {
  32  |   test("1.1 · landing renders with no console errors", async ({ page }) => {
  33  |     const errors = trackConsoleErrors(page);
  34  |     await page.goto("/");
  35  |     await expect(page.locator("h1")).toBeVisible();
  36  |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  37  |   });
  38  | 
  39  |   test("1.2 · privacy page prerendered, no console errors", async ({ page }) => {
  40  |     const errors = trackConsoleErrors(page);
  41  |     await page.goto("/privacy");
  42  |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Momentum");
  43  |     expect(errors).toHaveLength(0);
  44  |   });
  45  | 
  46  |   test("1.3 · login page loads, no console errors", async ({ page }) => {
  47  |     const errors = trackConsoleErrors(page);
  48  |     await page.goto("/login");
  49  |     await expect(page.getByLabel("Email")).toBeVisible();
  50  |     expect(errors).toHaveLength(0);
  51  |   });
  52  | });
  53  | 
  54  | test.describe("2 · Authentication and onboarding", () => {
  55  |   test("2.1 · protected route redirects to login when signed out", async ({
  56  |     page,
  57  |   }) => {
  58  |     await page.context().clearCookies();
  59  |     await page.goto("/schedule");
  60  |     await expect(page).toHaveURL(/\/login/);
  61  |     await expect(page.getByLabel("Email")).toBeVisible();
  62  |   });
  63  | 
  64  |   test("2.2 · login shows empty, error, and pending states", async ({ page }) => {
  65  |     await page.goto("/login");
  66  |     // Empty: submit disabled with blank fields. Scope to the form — the
  67  |     // mode-toggle tab is also named "Log in" but is never disabled.
  68  |     await expect(
  69  |       page.locator("form").getByRole("button", { name: "Log in" }),
  70  |     ).toBeDisabled();
  71  |     // Error: bad creds surface an inline alert.
  72  |     await page.getByLabel("Email").fill(`nobody-${UNIQUE}@example.invalid`);
  73  |     await page.getByLabel("Password").fill("wrong-password-here");
  74  |     await page.locator("form").getByRole("button", { name: "Log in" }).click();
  75  |     await expect(page.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  76  |   });
  77  | 
  78  |   test.skip(
  79  |     !HAS_CREDS,
  80  |     "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows",
  81  |   );
  82  | 
  83  |   test("2.3 · sign-in works for an existing account", async ({ page }) => {
  84  |     const errors = trackConsoleErrors(page);
  85  |     await signIn(page);
  86  |     await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  87  |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  88  |   });
  89  | 
  90  |   test("2.4 · sign-out clears session and lands on login", async ({ page }) => {
  91  |     await signIn(page);
  92  |     await page.getByRole("button", { name: "Log out" }).click();
  93  |     await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  94  |     // Re-visiting a protected route bounces again.
  95  |     await page.goto("/goals");
  96  |     await expect(page).toHaveURL(/\/login/);
  97  |   });
  98  | });
  99  | 
  100 | test.describe("3 · Goals workflow", () => {
  101 |   test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");
  102 | 
  103 |   test("3.1-3.5 · create, edit, complete, list sections", async ({ page }) => {
  104 |     const errors = trackConsoleErrors(page);
  105 |     await signIn(page);
  106 |     await page.goto("/goals");
> 107 |     await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
      |                                                                ^ Error: expect(locator).toBeVisible() failed
  108 | 
  109 |     // Create a goal.
  110 |     await page.getByRole("button", { name: "+ Add goal" }).click();
  111 |     await page.getByPlaceholder(/essay|goal|title|marathon/i).first().fill(GOAL_TITLE);
  112 |     const dateInputs = page.locator('input[type="date"]');
  113 |     await dateInputs.nth(0).fill("2026-10-20");
  114 |     await dateInputs.nth(1).fill("2026-11-15");
  115 |     // Exact: "/Add goal/" would also match the "+ Add goal" trigger.
  116 |     await page.getByRole("button", { name: "Add goal", exact: true }).click();
  117 |     await expect(page.getByText(GOAL_TITLE)).toBeVisible({ timeout: 10_000 });
  118 | 
  119 |     // Edit it.
  120 |     await page.getByText(GOAL_TITLE).click();
  121 |     await page.getByPlaceholder(/essay|goal|title|marathon/i).first().fill(`${GOAL_TITLE} (edited)`);
  122 |     await page.getByRole("button", { name: "Save" }).click();
  123 |     await expect(page.getByText(`${GOAL_TITLE} (edited)`)).toBeVisible();
  124 | 
  125 |     // Mark complete → moves to the Done section.
  126 |     await page
  127 |       .getByRole("button", { name: new RegExp(`Mark "${GOAL_TITLE}"`) })
  128 |       .first()
  129 |       .click();
  130 |     await expect(page.getByText("Done", { exact: true })).toBeVisible();
  131 |     await expect(page.getByText("Active", { exact: true })).toBeVisible();
  132 | 
  133 |     // Cleanup: delete it.
  134 |     await page.getByText(`${GOAL_TITLE} (edited)`).click();
  135 |     await page.getByRole("button", { name: "Delete" }).click();
  136 |     await expect(page.getByText(`${GOAL_TITLE} (edited)`)).toBeHidden({ timeout: 10_000 });
  137 | 
  138 |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  139 |   });
  140 | });
  141 | 
  142 | test.describe("4 · Obligations workflow", () => {
  143 |   test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");
  144 | 
  145 |   test("4.1-4.4 · create recurring, reload persists, edit, delete", async ({
  146 |     page,
  147 |   }) => {
  148 |     const errors = trackConsoleErrors(page);
  149 |     await signIn(page);
  150 |     await page.goto("/obligations");
  151 |     await expect(page.getByRole("heading", { name: "Obligations" })).toBeVisible();
  152 | 
  153 |     // Create from an empty grid slot.
  154 |     await page.getByTitle(/add obligation/).first().click();
  155 |     await expect(page.getByRole("heading", { name: "New obligation" })).toBeVisible();
  156 |     await page.getByPlaceholder(/e\.g\.|lecture|gym/i).fill(OBLIGATION_TITLE);
  157 |     // Day toggles carry aria-labels from the full day names ("Mon", not "M").
  158 |     await page.getByRole("button", { name: "Mon", exact: true }).click();
  159 |     await page.getByRole("button", { name: "Pin it" }).click();
  160 |     await expect(page.getByText(OBLIGATION_TITLE)).toBeVisible({ timeout: 10_000 });
  161 | 
  162 |     // Reload → recurrence persists.
  163 |     await page.reload();
  164 |     await expect(page.getByText(OBLIGATION_TITLE)).toBeVisible({ timeout: 10_000 });
  165 | 
  166 |     // Edit → rename persists after reload.
  167 |     await page.getByText(OBLIGATION_TITLE).click();
  168 |     await expect(page.getByRole("heading", { name: "Edit obligation" })).toBeVisible();
  169 |     await page.getByPlaceholder(/e\.g\.|lecture|gym/i).fill(`${OBLIGATION_TITLE} (edited)`);
  170 |     await page.getByRole("button", { name: "Save" }).click();
  171 |     await expect(page.getByText(`${OBLIGATION_TITLE} (edited)`)).toBeVisible();
  172 |     await page.reload();
  173 |     await expect(page.getByText(`${OBLIGATION_TITLE} (edited)`)).toBeVisible({
  174 |       timeout: 10_000,
  175 |     });
  176 | 
  177 |     // Delete → gone, grid intact.
  178 |     await page.getByText(`${OBLIGATION_TITLE} (edited)`).click();
  179 |     await page.getByRole("button", { name: "Delete" }).click();
  180 |     await expect(page.getByText(`${OBLIGATION_TITLE} (edited)`)).toBeHidden({
  181 |       timeout: 10_000,
  182 |     });
  183 | 
  184 |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  185 |   });
  186 | });
  187 | 
  188 | test.describe("5 · Schedule workflow", () => {
  189 |   test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");
  190 | 
  191 |   test("5.4-5.5 · view loads across widths, no overflow at 360px", async ({
  192 |     page,
  193 |   }) => {
  194 |     const errors = trackConsoleErrors(page);
  195 |     await signIn(page);
  196 |     await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  197 |     await expect(page.getByPlaceholder(/Ask anything|Add an API key/)).toBeVisible();
  198 | 
  199 |     for (const width of [360, 768, 1280]) {
  200 |       await page.setViewportSize({ width, height: 800 });
  201 |       await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
  202 |       const overflow = await page.evaluate(
  203 |         () => document.documentElement.scrollWidth > window.innerWidth + 4,
  204 |       );
  205 |       expect(overflow, `schedule overflows at ${width}px`).toBe(false);
  206 |     }
  207 | 
```