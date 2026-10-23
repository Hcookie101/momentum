# Momentum release checklist

Use this before any private beta or public launch. It focuses on the critical user journeys and the deployment risks most likely to surface in this app.

## Must-pass checks

### 1. Build and quality gates
- [ ] `npm run build` succeeds in a clean environment
- [ ] `npm run lint` succeeds with no errors
- [ ] No console errors on the main routes
- [ ] No TypeScript or Next.js warnings that indicate broken runtime assumptions

### 2. Authentication and onboarding
- [ ] Sign-in flow works for an existing account
- [ ] Sign-out clears session state correctly
- [ ] Redirects from protected routes work as expected
- [ ] Loading, empty, and error states render clearly
- [ ] Getting-started steps reflect live goal, obligation, AI, and schedule data
- [ ] Dismissing onboarding persists across reloads and devices
- [ ] Completing every step shows the one-time success state, then stays hidden

### 3. Goals workflow
- [ ] Create a goal with a title, start date, and target date
- [ ] Edit an existing goal without losing unrelated data
- [ ] Mark a goal complete and confirm the view updates
- [ ] Goal list sorts and displays correctly across active and completed items
- [ ] Empty state appears when there are no goals

### 4. Obligations workflow
- [ ] Create a recurring obligation with the right days/times
- [ ] Save and reload an obligation without losing the recurrence data
- [ ] Edit or delete an obligation without affecting other calendar items
- [ ] Conflicts or overlapping obligations are visibly handled

### 5. Schedule workflow
- [ ] Schedule generation succeeds with realistic goal and obligation data
- [ ] Existing user changes are preserved when the plan is regenerated
- [ ] Manual edits are not silently overwritten by AI-generated changes
- [ ] Schedule view loads correctly across days/weeks and narrow screens
- [ ] Empty or failed generation states are obvious to the user

### 6. Focus timer and stats
- [ ] Focus timer starts, pauses, and resets correctly
- [ ] Stats update from real focus sessions rather than stale data
- [ ] Time totals are consistent with the actual tracked period
- [ ] No duplicate session entries appear on repeat interactions

### 7. AI and quota behavior
- [ ] AI responses are shown with a clear loading state
- [ ] Quota usage is visible and updates without incorrect double-counting
- [ ] Failure cases (rate limit, quota exceeded, error response) are surfaced clearly
- [ ] AI-generated schedule changes require explicit confirmation when appropriate

### 8. Browser extension and privacy
- [ ] Browser token creation works end-to-end
- [ ] Token is only displayed once and can be copied
- [ ] Revoke flow removes the token and updates the UI
- [ ] Extension permissions are explained clearly in the UI
- [ ] Usage data is limited to the feature’s stated purpose
- [ ] Feedback form in Settings validates input and confirms submission

### 9. Accessibility and responsive QA
- [ ] Keyboard navigation works for primary actions
- [ ] Focus states are visible on buttons, links, and inputs
- [ ] Text remains readable at mobile and desktop widths
- [ ] Form controls have accessible labels and error messaging

### 10. Deployment safety
- [ ] Environment variables are present for production and staging
- [ ] Supabase keys and AI provider keys are not exposed to the client
- [ ] No debug scripts or stale temporary routes remain in production code
- [ ] Browser extension manifest version and permissions are reviewed before release

## Recommended manual smoke path

1. Sign in to the app
2. Create one goal and one obligation
3. Generate a schedule
4. Edit a schedule item manually
5. Regenerate the plan and confirm manual data is preserved
6. Start a focus session and confirm stats update
7. Create and revoke a browser token in settings
8. Check the app on a narrow viewport
9. Verify no console errors appear during the full flow

## Launch recommendation

- Internal beta: proceed once all must-pass checks are green
- Public release: require all checks above plus a brief manual QA pass on production-like data

## Notes

Automated smoke coverage now exists: `npm run test:e2e` runs
`tests/smoke.spec.ts` (Playwright) against a production build on `:3100`.
It covers build gates, auth redirects, a11y, responsive overflow, deployment
safety, the extension manifest, and onboarding display, dismissal, live
progress, and completion. The authenticated workflows (goals,
obligations, schedule, focus timer, token flows) run only when
`E2E_EMAIL` / `E2E_PASSWORD` are set — export them first, then run the suite.
A brief manual QA pass on production-like data is still required for public
release, especially AI generation with a real provider key.
