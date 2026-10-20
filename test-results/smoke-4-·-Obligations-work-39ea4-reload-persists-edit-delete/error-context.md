# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> 4 · Obligations workflow >> 4.1-4.4 · create recurring, reload persists, edit, delete
- Location: tests\smoke.spec.ts:145:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('E2E smoke obligation 1792456759830')
Expected: visible
Error: strict mode violation: getByText('E2E smoke obligation 1792456759830') resolved to 2 elements:
    1) <span class="block truncate text-[13px] font-medium leading-tight">E2E smoke obligation 1792456759830</span> aka getByRole('button', { name: 'E2E smoke obligation' }).first()
    2) <span class="block truncate text-[13px] font-medium leading-tight">E2E smoke obligation 1792456759830</span> aka getByRole('button', { name: 'E2E smoke obligation' }).nth(1)

Call log:
  - Expect "toBeVisible" getByText('E2E smoke obligation 1792456759830') with timeout 10000ms
  - waiting for getByText('E2E smoke obligation 1792456759830')

```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - banner [ref=f1e3]:
      - generic [ref=f1e4]:
        - generic [ref=f1e5]:
          - img "Momentum Logo" [ref=f1e7]
          - generic [ref=f1e8]: Momentum
        - navigation [ref=f1e9]:
          - link "Goals" [ref=f1e10] [cursor=pointer]:
            - /url: /goals
          - link "Obligations" [ref=f1e11] [cursor=pointer]:
            - /url: /obligations
          - link "Schedule" [ref=f1e12] [cursor=pointer]:
            - /url: /schedule
          - link "Stats" [ref=f1e13] [cursor=pointer]:
            - /url: /stats
          - link "Settings" [ref=f1e14] [cursor=pointer]:
            - /url: /settings
        - generic [ref=f1e15]:
          - button "Start focus" [ref=f1e16]
          - button "Log out" [ref=f1e17]
    - generic [ref=f1e19]:
      - generic [ref=f1e20]:
        - generic [ref=f1e21]:
          - heading "Obligations" [level=1] [ref=f1e22]
          - paragraph [ref=f1e23]: Classes, workouts, family time. Click any empty slot to pin one down.
        - generic [ref=f1e24]:
          - generic [ref=f1e25]: 1 pinned
          - generic [ref=f1e27]:
            - generic [ref=f1e28]: 2h
            - text: locked / week
      - generic [ref=f1e29]:
        - generic [ref=f1e30]:
          - generic [ref=f1e32]: Sun
          - generic [ref=f1e33]: Mon
          - generic [ref=f1e34]: Tue
          - generic [ref=f1e35]: Wed
          - generic [ref=f1e36]: Thu
          - generic [ref=f1e37]: Fri
          - generic [ref=f1e38]: Sat
        - generic [ref=f1e39]:
          - generic [ref=f1e40]:
            - generic [ref=f1e41]: 12 AM
            - generic [ref=f1e42]: 1 AM
            - generic [ref=f1e43]: 2 AM
            - generic [ref=f1e44]: 3 AM
            - generic [ref=f1e45]: 4 AM
            - generic [ref=f1e46]: 5 AM
            - generic [ref=f1e47]: 6 AM
            - generic [ref=f1e48]: 7 AM
            - generic [ref=f1e49]: 8 AM
            - generic [ref=f1e50]: 9 AM
            - generic [ref=f1e51]: 10 AM
            - generic [ref=f1e52]: 11 AM
            - generic [ref=f1e53]: 12 PM
            - generic [ref=f1e54]: 1 PM
            - generic [ref=f1e55]: 2 PM
            - generic [ref=f1e56]: 3 PM
            - generic [ref=f1e57]: 4 PM
            - generic [ref=f1e58]: 5 PM
            - generic [ref=f1e59]: 6 PM
            - generic [ref=f1e60]: 7 PM
            - generic [ref=f1e61]: 8 PM
            - generic [ref=f1e62]: 9 PM
            - generic [ref=f1e63]: 10 PM
            - generic [ref=f1e64]: 11 PM
          - generic [ref=f1e65]:
            - generic "Sun 12 AM - add obligation" [ref=f1e66] [cursor=pointer]
            - generic "Sun 1 AM - add obligation" [ref=f1e67] [cursor=pointer]
            - generic "Sun 2 AM - add obligation" [ref=f1e68] [cursor=pointer]
            - generic "Sun 3 AM - add obligation" [ref=f1e69] [cursor=pointer]
            - generic "Sun 4 AM - add obligation" [ref=f1e70] [cursor=pointer]
            - generic "Sun 5 AM - add obligation" [ref=f1e71] [cursor=pointer]
            - generic "Sun 6 AM - add obligation" [ref=f1e72] [cursor=pointer]
            - generic "Sun 7 AM - add obligation" [ref=f1e73] [cursor=pointer]
            - generic "Sun 8 AM - add obligation" [ref=f1e74] [cursor=pointer]
            - generic "Sun 9 AM - add obligation" [ref=f1e75] [cursor=pointer]
            - generic "Sun 10 AM - add obligation" [ref=f1e76] [cursor=pointer]
            - generic "Sun 11 AM - add obligation" [ref=f1e77] [cursor=pointer]
            - generic "Sun 12 PM - add obligation" [ref=f1e78] [cursor=pointer]
            - generic "Sun 1 PM - add obligation" [ref=f1e79] [cursor=pointer]
            - generic "Sun 2 PM - add obligation" [ref=f1e80] [cursor=pointer]
            - generic "Sun 3 PM - add obligation" [ref=f1e81] [cursor=pointer]
            - generic "Sun 4 PM - add obligation" [ref=f1e82] [cursor=pointer]
            - generic "Sun 5 PM - add obligation" [ref=f1e83] [cursor=pointer]
            - generic "Sun 6 PM - add obligation" [ref=f1e84] [cursor=pointer]
            - generic "Sun 7 PM - add obligation" [ref=f1e85] [cursor=pointer]
            - generic "Sun 8 PM - add obligation" [ref=f1e86] [cursor=pointer]
            - generic "Sun 9 PM - add obligation" [ref=f1e87] [cursor=pointer]
            - generic "Sun 10 PM - add obligation" [ref=f1e88] [cursor=pointer]
            - generic "Sun 11 PM - add obligation" [ref=f1e89] [cursor=pointer]
            - button "E2E smoke obligation 1792456759830 12 AM – 1 AM" [ref=f1e90]:
              - generic [ref=f1e91]: E2E smoke obligation 1792456759830
              - generic [ref=f1e92]: 12 AM – 1 AM
          - generic [ref=f1e93]:
            - generic "Mon 12 AM - add obligation" [ref=f1e94] [cursor=pointer]
            - generic "Mon 1 AM - add obligation" [ref=f1e95] [cursor=pointer]
            - generic "Mon 2 AM - add obligation" [ref=f1e96] [cursor=pointer]
            - generic "Mon 3 AM - add obligation" [ref=f1e97] [cursor=pointer]
            - generic "Mon 4 AM - add obligation" [ref=f1e98] [cursor=pointer]
            - generic "Mon 5 AM - add obligation" [ref=f1e99] [cursor=pointer]
            - generic "Mon 6 AM - add obligation" [ref=f1e100] [cursor=pointer]
            - generic "Mon 7 AM - add obligation" [ref=f1e101] [cursor=pointer]
            - generic "Mon 8 AM - add obligation" [ref=f1e102] [cursor=pointer]
            - generic "Mon 9 AM - add obligation" [ref=f1e103] [cursor=pointer]
            - generic "Mon 10 AM - add obligation" [ref=f1e104] [cursor=pointer]
            - generic "Mon 11 AM - add obligation" [ref=f1e105] [cursor=pointer]
            - generic "Mon 12 PM - add obligation" [ref=f1e106] [cursor=pointer]
            - generic "Mon 1 PM - add obligation" [ref=f1e107] [cursor=pointer]
            - generic "Mon 2 PM - add obligation" [ref=f1e108] [cursor=pointer]
            - generic "Mon 3 PM - add obligation" [ref=f1e109] [cursor=pointer]
            - generic "Mon 4 PM - add obligation" [ref=f1e110] [cursor=pointer]
            - generic "Mon 5 PM - add obligation" [ref=f1e111] [cursor=pointer]
            - generic "Mon 6 PM - add obligation" [ref=f1e112] [cursor=pointer]
            - generic "Mon 7 PM - add obligation" [ref=f1e113] [cursor=pointer]
            - generic "Mon 8 PM - add obligation" [ref=f1e114] [cursor=pointer]
            - generic "Mon 9 PM - add obligation" [ref=f1e115] [cursor=pointer]
            - generic "Mon 10 PM - add obligation" [ref=f1e116] [cursor=pointer]
            - generic "Mon 11 PM - add obligation" [ref=f1e117] [cursor=pointer]
            - button "E2E smoke obligation 1792456759830 12 AM – 1 AM" [ref=f1e118]:
              - generic [ref=f1e119]: E2E smoke obligation 1792456759830
              - generic [ref=f1e120]: 12 AM – 1 AM
          - generic [ref=f1e121]:
            - generic "Tue 12 AM - add obligation" [ref=f1e122] [cursor=pointer]
            - generic "Tue 1 AM - add obligation" [ref=f1e123] [cursor=pointer]
            - generic "Tue 2 AM - add obligation" [ref=f1e124] [cursor=pointer]
            - generic "Tue 3 AM - add obligation" [ref=f1e125] [cursor=pointer]
            - generic "Tue 4 AM - add obligation" [ref=f1e126] [cursor=pointer]
            - generic "Tue 5 AM - add obligation" [ref=f1e127] [cursor=pointer]
            - generic "Tue 6 AM - add obligation" [ref=f1e128] [cursor=pointer]
            - generic "Tue 7 AM - add obligation" [ref=f1e129] [cursor=pointer]
            - generic "Tue 8 AM - add obligation" [ref=f1e130] [cursor=pointer]
            - generic "Tue 9 AM - add obligation" [ref=f1e131] [cursor=pointer]
            - generic "Tue 10 AM - add obligation" [ref=f1e132] [cursor=pointer]
            - generic "Tue 11 AM - add obligation" [ref=f1e133] [cursor=pointer]
            - generic "Tue 12 PM - add obligation" [ref=f1e134] [cursor=pointer]
            - generic "Tue 1 PM - add obligation" [ref=f1e135] [cursor=pointer]
            - generic "Tue 2 PM - add obligation" [ref=f1e136] [cursor=pointer]
            - generic "Tue 3 PM - add obligation" [ref=f1e137] [cursor=pointer]
            - generic "Tue 4 PM - add obligation" [ref=f1e138] [cursor=pointer]
            - generic "Tue 5 PM - add obligation" [ref=f1e139] [cursor=pointer]
            - generic "Tue 6 PM - add obligation" [ref=f1e140] [cursor=pointer]
            - generic "Tue 7 PM - add obligation" [ref=f1e141] [cursor=pointer]
            - generic "Tue 8 PM - add obligation" [ref=f1e142] [cursor=pointer]
            - generic "Tue 9 PM - add obligation" [ref=f1e143] [cursor=pointer]
            - generic "Tue 10 PM - add obligation" [ref=f1e144] [cursor=pointer]
            - generic "Tue 11 PM - add obligation" [ref=f1e145] [cursor=pointer]
          - generic [ref=f1e146]:
            - generic "Wed 12 AM - add obligation" [ref=f1e147] [cursor=pointer]
            - generic "Wed 1 AM - add obligation" [ref=f1e148] [cursor=pointer]
            - generic "Wed 2 AM - add obligation" [ref=f1e149] [cursor=pointer]
            - generic "Wed 3 AM - add obligation" [ref=f1e150] [cursor=pointer]
            - generic "Wed 4 AM - add obligation" [ref=f1e151] [cursor=pointer]
            - generic "Wed 5 AM - add obligation" [ref=f1e152] [cursor=pointer]
            - generic "Wed 6 AM - add obligation" [ref=f1e153] [cursor=pointer]
            - generic "Wed 7 AM - add obligation" [ref=f1e154] [cursor=pointer]
            - generic "Wed 8 AM - add obligation" [ref=f1e155] [cursor=pointer]
            - generic "Wed 9 AM - add obligation" [ref=f1e156] [cursor=pointer]
            - generic "Wed 10 AM - add obligation" [ref=f1e157] [cursor=pointer]
            - generic "Wed 11 AM - add obligation" [ref=f1e158] [cursor=pointer]
            - generic "Wed 12 PM - add obligation" [ref=f1e159] [cursor=pointer]
            - generic "Wed 1 PM - add obligation" [ref=f1e160] [cursor=pointer]
            - generic "Wed 2 PM - add obligation" [ref=f1e161] [cursor=pointer]
            - generic "Wed 3 PM - add obligation" [ref=f1e162] [cursor=pointer]
            - generic "Wed 4 PM - add obligation" [ref=f1e163] [cursor=pointer]
            - generic "Wed 5 PM - add obligation" [ref=f1e164] [cursor=pointer]
            - generic "Wed 6 PM - add obligation" [ref=f1e165] [cursor=pointer]
            - generic "Wed 7 PM - add obligation" [ref=f1e166] [cursor=pointer]
            - generic "Wed 8 PM - add obligation" [ref=f1e167] [cursor=pointer]
            - generic "Wed 9 PM - add obligation" [ref=f1e168] [cursor=pointer]
            - generic "Wed 10 PM - add obligation" [ref=f1e169] [cursor=pointer]
            - generic "Wed 11 PM - add obligation" [ref=f1e170] [cursor=pointer]
          - generic [ref=f1e171]:
            - generic "Thu 12 AM - add obligation" [ref=f1e172] [cursor=pointer]
            - generic "Thu 1 AM - add obligation" [ref=f1e173] [cursor=pointer]
            - generic "Thu 2 AM - add obligation" [ref=f1e174] [cursor=pointer]
            - generic "Thu 3 AM - add obligation" [ref=f1e175] [cursor=pointer]
            - generic "Thu 4 AM - add obligation" [ref=f1e176] [cursor=pointer]
            - generic "Thu 5 AM - add obligation" [ref=f1e177] [cursor=pointer]
            - generic "Thu 6 AM - add obligation" [ref=f1e178] [cursor=pointer]
            - generic "Thu 7 AM - add obligation" [ref=f1e179] [cursor=pointer]
            - generic "Thu 8 AM - add obligation" [ref=f1e180] [cursor=pointer]
            - generic "Thu 9 AM - add obligation" [ref=f1e181] [cursor=pointer]
            - generic "Thu 10 AM - add obligation" [ref=f1e182] [cursor=pointer]
            - generic "Thu 11 AM - add obligation" [ref=f1e183] [cursor=pointer]
            - generic "Thu 12 PM - add obligation" [ref=f1e184] [cursor=pointer]
            - generic "Thu 1 PM - add obligation" [ref=f1e185] [cursor=pointer]
            - generic "Thu 2 PM - add obligation" [ref=f1e186] [cursor=pointer]
            - generic "Thu 3 PM - add obligation" [ref=f1e187] [cursor=pointer]
            - generic "Thu 4 PM - add obligation" [ref=f1e188] [cursor=pointer]
            - generic "Thu 5 PM - add obligation" [ref=f1e189] [cursor=pointer]
            - generic "Thu 6 PM - add obligation" [ref=f1e190] [cursor=pointer]
            - generic "Thu 7 PM - add obligation" [ref=f1e191] [cursor=pointer]
            - generic "Thu 8 PM - add obligation" [ref=f1e192] [cursor=pointer]
            - generic "Thu 9 PM - add obligation" [ref=f1e193] [cursor=pointer]
            - generic "Thu 10 PM - add obligation" [ref=f1e194] [cursor=pointer]
            - generic "Thu 11 PM - add obligation" [ref=f1e195] [cursor=pointer]
          - generic [ref=f1e196]:
            - generic "Fri 12 AM - add obligation" [ref=f1e197] [cursor=pointer]
            - generic "Fri 1 AM - add obligation" [ref=f1e198] [cursor=pointer]
            - generic "Fri 2 AM - add obligation" [ref=f1e199] [cursor=pointer]
            - generic "Fri 3 AM - add obligation" [ref=f1e200] [cursor=pointer]
            - generic "Fri 4 AM - add obligation" [ref=f1e201] [cursor=pointer]
            - generic "Fri 5 AM - add obligation" [ref=f1e202] [cursor=pointer]
            - generic "Fri 6 AM - add obligation" [ref=f1e203] [cursor=pointer]
            - generic "Fri 7 AM - add obligation" [ref=f1e204] [cursor=pointer]
            - generic "Fri 8 AM - add obligation" [ref=f1e205] [cursor=pointer]
            - generic "Fri 9 AM - add obligation" [ref=f1e206] [cursor=pointer]
            - generic "Fri 10 AM - add obligation" [ref=f1e207] [cursor=pointer]
            - generic "Fri 11 AM - add obligation" [ref=f1e208] [cursor=pointer]
            - generic "Fri 12 PM - add obligation" [ref=f1e209] [cursor=pointer]
            - generic "Fri 1 PM - add obligation" [ref=f1e210] [cursor=pointer]
            - generic "Fri 2 PM - add obligation" [ref=f1e211] [cursor=pointer]
            - generic "Fri 3 PM - add obligation" [ref=f1e212] [cursor=pointer]
            - generic "Fri 4 PM - add obligation" [ref=f1e213] [cursor=pointer]
            - generic "Fri 5 PM - add obligation" [ref=f1e214] [cursor=pointer]
            - generic "Fri 6 PM - add obligation" [ref=f1e215] [cursor=pointer]
            - generic "Fri 7 PM - add obligation" [ref=f1e216] [cursor=pointer]
            - generic "Fri 8 PM - add obligation" [ref=f1e217] [cursor=pointer]
            - generic "Fri 9 PM - add obligation" [ref=f1e218] [cursor=pointer]
            - generic "Fri 10 PM - add obligation" [ref=f1e219] [cursor=pointer]
            - generic "Fri 11 PM - add obligation" [ref=f1e220] [cursor=pointer]
          - generic [ref=f1e221]:
            - generic "Sat 12 AM - add obligation" [ref=f1e222] [cursor=pointer]
            - generic "Sat 1 AM - add obligation" [ref=f1e223] [cursor=pointer]
            - generic "Sat 2 AM - add obligation" [ref=f1e224] [cursor=pointer]
            - generic "Sat 3 AM - add obligation" [ref=f1e225] [cursor=pointer]
            - generic "Sat 4 AM - add obligation" [ref=f1e226] [cursor=pointer]
            - generic "Sat 5 AM - add obligation" [ref=f1e227] [cursor=pointer]
            - generic "Sat 6 AM - add obligation" [ref=f1e228] [cursor=pointer]
            - generic "Sat 7 AM - add obligation" [ref=f1e229] [cursor=pointer]
            - generic "Sat 8 AM - add obligation" [ref=f1e230] [cursor=pointer]
            - generic "Sat 9 AM - add obligation" [ref=f1e231] [cursor=pointer]
            - generic "Sat 10 AM - add obligation" [ref=f1e232] [cursor=pointer]
            - generic "Sat 11 AM - add obligation" [ref=f1e233] [cursor=pointer]
            - generic "Sat 12 PM - add obligation" [ref=f1e234] [cursor=pointer]
            - generic "Sat 1 PM - add obligation" [ref=f1e235] [cursor=pointer]
            - generic "Sat 2 PM - add obligation" [ref=f1e236] [cursor=pointer]
            - generic "Sat 3 PM - add obligation" [ref=f1e237] [cursor=pointer]
            - generic "Sat 4 PM - add obligation" [ref=f1e238] [cursor=pointer]
            - generic "Sat 5 PM - add obligation" [ref=f1e239] [cursor=pointer]
            - generic "Sat 6 PM - add obligation" [ref=f1e240] [cursor=pointer]
            - generic "Sat 7 PM - add obligation" [ref=f1e241] [cursor=pointer]
            - generic "Sat 8 PM - add obligation" [ref=f1e242] [cursor=pointer]
            - generic "Sat 9 PM - add obligation" [ref=f1e243] [cursor=pointer]
            - generic "Sat 10 PM - add obligation" [ref=f1e244] [cursor=pointer]
            - generic "Sat 11 PM - add obligation" [ref=f1e245] [cursor=pointer]
  - alert [ref=f1e246]
```

# Test source

```ts
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
> 160 |     await expect(page.getByText(OBLIGATION_TITLE)).toBeVisible({ timeout: 10_000 });
      |                                                    ^ Error: expect(locator).toBeVisible() failed
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
```