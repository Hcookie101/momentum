# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> 5 · Schedule workflow >> 5.4-5.5 · view loads across widths, no overflow at 360px
- Location: tests\smoke.spec.ts:191:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Schedule' })
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByRole('heading', { name: 'Schedule' }) with timeout 10000ms
  - waiting for getByRole('heading', { name: 'Schedule' })

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
  107 |     await expect(page.getByRole("heading", { name: "Goals" })).toBeVisible();
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
> 196 |     await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();
      |                                                                   ^ Error: expect(locator).toBeVisible() failed
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
  208 |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  209 |   });
  210 | });
  211 | 
  212 | 
  213 | test.describe("6 · Focus timer and stats", () => {
  214 |   test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");
  215 | 
  216 |   test("6.1-6.4 · start → stop → rate → save, stats render", async ({ page }) => {
  217 |     const errors = trackConsoleErrors(page);
  218 |     await signIn(page);
  219 |     await page.goto("/stats");
  220 |     await expect(page.getByText("Total time spent on task")).toBeVisible();
  221 | 
  222 |     await page.getByRole("button", { name: /Start focus/ }).click();
  223 |     await expect(
  224 |       page.getByRole("button", { name: "Stop focus session" }),
  225 |     ).toBeVisible({ timeout: 5_000 });
  226 | 
  227 |     await page.waitForTimeout(1500);
  228 |     await page.getByRole("button", { name: "Stop focus session" }).click();
  229 | 
  230 |     const rateModal = page.getByRole("dialog", { name: "Rate your focus" });
  231 |     await expect(rateModal).toBeVisible({ timeout: 5_000 });
  232 | 
  233 |     await rateModal.getByRole("button", { name: "7", exact: true }).click();
  234 |     await rateModal.getByRole("button", { name: "Save session" }).click();
  235 |     await expect(rateModal).toBeHidden({ timeout: 10_000 });
  236 |     await expect(page.getByRole("button", { name: /Start focus/ })).toBeVisible();
  237 |     await expect(page.getByText("Total time spent on task")).toBeVisible();
  238 | 
  239 |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  240 |   });
  241 | });
  242 | 
  243 | 
  244 | test.describe("7 · AI and quota behavior", () => {
  245 |   test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");
  246 | 
  247 |   test("7.1-7.3 · chat placeholder reflects config; settings dialog operable", async ({
  248 |     page,
  249 |   }) => {
  250 |     const errors = trackConsoleErrors(page);
  251 |     await signIn(page);
  252 |     // Placeholder flips between configured/unconfigured — both explicit.
  253 |     await expect(page.getByPlaceholder(/Ask anything|Add an API key/)).toBeVisible();
  254 | 
  255 |     // AI settings dialog opens (explicit failure surface for rate limits:
  256 |     // the status line under the form).
  257 |     await page.getByRole("button", { name: "AI settings" }).click();
  258 |     const dialog = page.getByRole("dialog", { name: /Connect an AI/ });
  259 |     await expect(dialog).toBeVisible();
  260 |     await page.keyboard.press("Escape");
  261 |     await expect(dialog).toBeHidden();
  262 | 
  263 |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  264 |   });
  265 | });
  266 | 
  267 | 
  268 | test.describe("8 · Browser extension and privacy", () => {
  269 |   test.skip(!HAS_CREDS, "Set E2E_EMAIL and E2E_PASSWORD to run authenticated flows");
  270 | 
  271 |   test("8.1-8.3 · token create → shown once → copy → revoke", async ({ page }) => {
  272 |     const errors = trackConsoleErrors(page);
  273 |     await signIn(page);
  274 |     await page.goto("/settings");
  275 |     await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  276 | 
  277 |     // Privacy disclosure line visible (8.4/8.5). Scoped to the Browsing data
  278 |     // section — the settings page footer repeats similar wording.
  279 |     await expect(
  280 |       page
  281 |         .locator("section")
  282 |         .filter({ hasText: "Browsing data" })
  283 |         .getByText(/never full URLs/i),
  284 |     ).toBeVisible();
  285 | 
  286 |     // Create a token.
  287 |     await page.getByPlaceholder(/label|name/i).first().fill(`e2e-${UNIQUE}`);
  288 |     await page.getByRole("button", { name: "Create token" }).click();
  289 |     // Shown exactly once with a copy affordance.
  290 |     await expect(page.getByText(/shown only once/i)).toBeVisible({ timeout: 15_000 });
  291 |     await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
  292 | 
  293 |     // Revoke → row marked revoked.
  294 |     await page.getByRole("button", { name: "Revoke" }).first().click();
  295 |     await expect(page.getByText("revoked").first()).toBeVisible({ timeout: 10_000 });
  296 | 
```