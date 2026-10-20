# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> 8 · Browser extension and privacy >> 8.6 · feedback form validates empty input and submits
- Location: tests\smoke.spec.ts:312:7

# Error details

```
Error: expect(locator).toBeEnabled() failed

Locator: getByRole('button', { name: 'Send feedback' })
Expected: enabled
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeEnabled" getByRole('button', { name: 'Send feedback' }) with timeout 10000ms
  - waiting for getByRole('button', { name: 'Send feedback' })
    3 × locator resolved to <button disabled type="submit" class="rounded-lg bg-[#16759b] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:bg-[#1b83ad] disabled:cursor-not-allowed disabled:opacity-40">Send feedback</button>
      - unexpected value "disabled"

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
  297 |     expect(errors, `console errors: ${errors.join(" | ")}`).toHaveLength(0);
  298 |   });
  299 | 
  300 |   test("8.5 · delete browsing data has confirm + cancel path", async ({ page }) => {
  301 |     await signIn(page);
  302 |     await page.goto("/settings");
  303 |     await expect(page.getByRole("heading", { name: "Browsing data" })).toBeVisible();
  304 |     await page.getByRole("button", { name: /Delete my browsing data/ }).click();
  305 |     await expect(page.getByRole("button", { name: "Keep it" })).toBeVisible();
  306 |     await page.getByRole("button", { name: "Keep it" }).click();
  307 |     await expect(
  308 |       page.getByRole("button", { name: /Delete my browsing data/ }),
  309 |     ).toBeVisible();
  310 |   });
  311 | 
  312 |   test("8.6 · feedback form validates empty input and submits", async ({
  313 |     page,
  314 |   }) => {
  315 |     await signIn(page);
  316 |     await page.goto("/settings");
  317 |     await expect(page.getByRole("heading", { name: "Send feedback" })).toBeVisible();
  318 |     // Empty: submit is disabled until there's a message.
  319 |     const submit = page.getByRole("button", { name: "Send feedback" });
  320 |     await expect(submit).toBeDisabled();
  321 |     // Fill and submit → success status appears.
  322 |     await page
  323 |       .getByLabel("Feedback")
  324 |       .fill(`E2E smoke feedback ${UNIQUE} — thanks for everything.`);
  325 |     await page.getByRole("button", { name: "Problem" }).click();
> 326 |     await expect(submit).toBeEnabled();
      |                          ^ Error: expect(locator).toBeEnabled() failed
  327 |     await submit.click();
  328 |     await expect(page.getByRole("status")).toContainText("Thanks");
  329 |   });
  330 | });
  331 | 
  332 | 
  333 | test.describe("9 · Accessibility and responsive QA", () => {
  334 |   test("9.1 · keyboard Tab reaches interactive elements on landing", async ({
  335 |     page,
  336 |   }) => {
  337 |     await page.goto("/");
  338 |     await page.keyboard.press("Tab");
  339 |     const active = await page.evaluate(() => {
  340 |       const el = document.activeElement as HTMLElement | null;
  341 |       return el ? { tag: el.tagName, text: el.textContent?.trim() } : null;
  342 |     });
  343 |     expect(active).not.toBeNull();
  344 |     expect(active!.tag).toMatch(/A|BUTTON|INPUT/);
  345 |   });
  346 | 
  347 |   test("9.2 · all links/buttons have discernible names", async ({ page }) => {
  348 |     await page.goto("/login");
  349 |     const unnamed = await page.evaluate(() => {
  350 |       const results: string[] = [];
  351 |       document.querySelectorAll("button, a[href]").forEach((el) => {
  352 |         const text = (el.textContent || "").trim();
  353 |         const aria = el.getAttribute("aria-label");
  354 |         const title = el.getAttribute("title");
  355 |         if (!text && !aria && !title) results.push(el.outerHTML.slice(0, 120));
  356 |       });
  357 |       return results;
  358 |     });
  359 |     expect(unnamed, `unnamed controls: ${unnamed.join(" | ")}`).toHaveLength(0);
  360 |   });
  361 | 
  362 |   test("9.3 · no horizontal overflow at 360 / 768 / 1280", async ({ page }) => {
  363 |     for (const path of ["/", "/login", "/privacy"]) {
  364 |       for (const width of [360, 768, 1280]) {
  365 |         await page.setViewportSize({ width, height: 800 });
  366 |         await page.goto(path);
  367 |         const overflow = await page.evaluate(
  368 |           () => document.documentElement.scrollWidth > window.innerWidth + 4,
  369 |         );
  370 |         expect(overflow, `${path} overflows at ${width}px`).toBe(false);
  371 |       }
  372 |     }
  373 |   });
  374 | 
  375 |   test("9.4 · form inputs labelled; validation blocks bad input", async ({
  376 |     page,
  377 |   }) => {
  378 |     await page.goto("/login");
  379 |     const email = page.getByLabel("Email");
  380 |     const pass = page.getByLabel("Password");
  381 |     await expect(email).toBeVisible();
  382 |     await expect(pass).toBeVisible();
  383 |     await email.fill("not-an-email-at-all");
  384 |     await pass.fill("x");
  385 |     // Scope to the form: the mode-toggle tab is also named "Log in".
  386 |     await page
  387 |       .locator("form")
  388 |       .getByRole("button", { name: "Log in" })
  389 |       .click();
  390 |     const invalid = await email.evaluate(
  391 |       (el) => !(el as HTMLInputElement).checkValidity(),
  392 |     );
  393 |     const hasAlert = await page
  394 |       .getByRole("alert")
  395 |       .isVisible()
  396 |       .catch(() => false);
  397 |     expect(invalid || hasAlert).toBe(true);
  398 |   });
  399 | });
  400 | 
  401 | test.describe("10 · Deployment safety", () => {
  402 |   test("10.1 · no service-role / secret keys in served HTML", async ({
  403 |     request,
  404 |   }) => {
  405 |     for (const path of ["/", "/login", "/privacy"]) {
  406 |       const res = await request.get(path);
  407 |       const body = await res.text();
  408 |       expect(body).not.toContain("service_role");
  409 |       expect(body).not.toContain("sb_secret_");
  410 |     }
  411 |   });
  412 | 
  413 |   test("10.2 · security headers present, x-powered-by absent", async ({
  414 |     request,
  415 |   }) => {
  416 |     const res = await request.get("/privacy");
  417 |     const h = res.headers();
  418 |     expect(h["x-frame-options"]).toBe("DENY");
  419 |     expect(h["x-content-type-options"]).toBe("nosniff");
  420 |     expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  421 |     expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  422 |     expect(h["x-powered-by"]).toBeUndefined();
  423 |   });
  424 | 
  425 |   test("10.3 · unauthenticated AI routes reject with 401", async ({ request }) => {
  426 |     // Each route's own verb: quota is GET-only (POST there is a 405, not 401).
```