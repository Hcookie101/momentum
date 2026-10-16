Project overview
This project is Momentum, an AI-powered productivity and scheduling
app. Its goal is to help people follow through on plans, not merely
generate schedules.
Core product areas: - Goals: Create goals with deadlines and break
them into manageable subgoals with AI assistance. - Obligations:
Record recurring commitments, including the days and times they occur. -
Schedule: Generate a schedule from goals, deadlines, obligations,
and available time. Let users edit events manually and ask AI to revise
the plan. - Stats: Track focused time, time spent on tasks, and
supported website/app usage. - AI advisor: Give context-aware advice
based on the user's goals, obligations, schedule, and available
statistics. - Browser extension: In a later or connected part of the
project, collect only the browsing activity needed for user-facing
productivity statistics.
The main stack is Next.js, React, and Tailwind CSS, with possible
future React Native support. Confirm the actual dependencies and project
structure before assuming a particular implementation.
Critical Next.js instructions
<!-- BEGIN:nextjs-agent-rules -->
This is NOT the Next.js you know
This version has breaking changes --- APIs, conventions, and file
structure may all differ from your training data. Read the relevant
guide in node_modules/next/dist/docs/ (resolved from this file's
directory; in monorepos the next package may not be visible from the
repo root) before writing any code. Heed deprecation notices.
This block is written and re-added by next dev --- verify at
node_modules/next/dist/server/lib/generate-agent-files.js. Removing it
from a diff only re-creates the uncommitted change; committing it with
your work keeps the tree clean.
<!-- END:nextjs-agent-rules -->
Before changing Next.js-specific code: 1. Inspect package.json and the
installed Next.js version. 2. Read the relevant local documentation
under node_modules/next/dist/docs/. Do not rely on memory or assume
older Next.js APIs still apply. 3. Follow the conventions and APIs
documented for the installed version. 4. Preserve the generated
agent-rules block above. Do not remove it just to make a diff cleaner.
General working rules
- Inspect before editing. Read the relevant files and nearby
  components before making changes. Understand existing patterns
  before introducing a new abstraction.
- Make focused changes. Implement the requested feature with the
  smallest coherent change; avoid unrelated refactors.
- Preserve working behavior. Do not remove existing functionality,
  routes, styling, or data handling unless the task explicitly
  requires it.
- Verify assumptions. Check actual package versions, available
  scripts, component APIs, database schema, and environment variables
  instead of inventing them.
- Prefer existing dependencies. Do not add a package when the
  current stack can handle the task cleanly. If a new dependency is
  genuinely useful, explain why.
- Keep TypeScript safe. Avoid any, unsafe casts, and suppression
  comments. If one is unavoidable, keep it narrow and explain why.
- Use clear names. Choose names that describe product concepts and
  behavior rather than implementation details.
- Avoid placeholder functionality. Do not present mocked data or
  nonfunctional controls as production features. If a feature must be
  a prototype, make that limitation clear.
- Report what changed. At the end of a task, summarize the
  important files changed, behavior added, and checks run. Be explicit
  about anything not tested.
Product and UX principles
- Momentum should help users act on their plans and recover when
  reality changes.
- Keep the interface professional, calm, and easy to scan. Use
  consistent spacing, typography, colors, borders, and interaction
  patterns.
- Prioritize useful information hierarchy over decorative effects.
  Avoid unnecessary gradients, visual clutter, and excessive
  animation.
- Make common actions obvious: create or edit a goal, add an
  obligation, inspect the schedule, adjust an event, and review
  progress.
- Design for realistic schedule changes. Users should be able to
  correct a plan without losing unrelated events or commitments.
- Show useful empty, loading, success, and error states. Do not leave
  users wondering whether an action worked.
- Use accessible semantic elements, keyboard-operable controls,
  visible focus states, and labels for form fields.
- Ensure layouts work at narrow and wide viewport sizes. Avoid fixed
  dimensions that break on smaller screens.
- Reuse the project's existing design tokens and shared components
  when available. Do not introduce competing design systems.
Scheduling and data integrity
- Treat user-created goals, deadlines, obligations, and manually
  edited schedule events as meaningful user data.
- Do not silently overwrite manual edits when regenerating a schedule.
  Preserve them or clearly explain the proposed changes and ask for
  confirmation when appropriate.
- Account for recurring obligations, deadlines, event durations, and
  conflicts when building or modifying schedules.
- Use a consistent time-zone strategy. Store and display dates/times
  intentionally, and avoid assuming every user is in the same time
  zone.
- Validate user input at the boundary, including dates, durations,
  recurrence rules, and IDs.
- Prefer explicit types and well-defined data models for goals,
  subgoals, obligations, schedule events, and statistics.
- Handle failed saves and network/API errors visibly. Do not show
  success until the operation has actually succeeded.
- Avoid duplicate submissions and race conditions for actions such as
  saving, generating, or rescheduling.
AI features
- Treat AI output as a proposal, not an unquestionable source of
  truth.
- Validate structured AI output before using it to update application
  state or persist it.
- Handle malformed responses, timeouts, rate limits, and unavailable
  model services gracefully.
- Keep AI prompts and outputs aligned with the user's actual goals,
  obligations, schedule, and available statistics. Do not invent
  personal data or statistics.
- Require user confirmation before destructive or broad changes to an
  existing schedule.
- Keep secrets and API keys on the server. Never expose private keys
  in client-side code or commit secrets to the repository.
- Make it clear to users when content is AI-generated where that
  distinction matters.
Privacy and browser-usage tracking
- Collect only the data needed for a clearly explained user-facing
  feature.
- Request browser permissions only when needed and explain what the
  permission enables.
- Do not collect page contents, form inputs, passwords, or other
  sensitive page data for ordinary time-tracking.
- Minimize data retention and avoid sending browsing history to
  external services unless the feature explicitly requires it and the
  user has been informed.
- Keep extension permissions as narrow as possible. Follow the
  browser's current extension APIs and manifest requirements rather
  than assuming older conventions.
- Make tracking status and user controls understandable. Respect
  pause/disable controls and avoid hidden tracking.
- Separate raw events from summarized statistics where appropriate,
  and document what is stored and why.
Frontend implementation
- Follow the existing App Router or Pages Router structure; determine
  which one the repository uses before adding routes.
- Keep components focused. Extract shared components when doing so
  improves consistency or readability, not merely to reduce line
  count.
- Use Server Components by default where supported by the installed
  Next.js version. Add client boundaries only when interactivity or
  browser APIs require them, following the local docs.
- Keep browser-only APIs out of server-rendered code.
- Use the project's established Tailwind conventions and shared CSS
  variables. Avoid duplicating large sets of utility classes when a
  reusable component or class is already established.
- Make forms resilient: label inputs, validate values, show
  field-level errors where useful, and prevent accidental double
  submission.
- Use semantic HTML and do not use clickable non-interactive elements
  as substitutes for buttons or links.
- Keep components and styles consistent with existing navigation,
  active-page states, dialogs, schedule grids, and event-color
  conventions.
Backend, database, and integrations
- Inspect the existing persistence layer and schema before modifying
  data access. Do not assume a particular database or ORM.
- Keep authorization and data validation on the server; never trust
  client-supplied user IDs or permissions.
- Use the project's existing server actions, route handlers, or API
  conventions as appropriate for the installed Next.js version.
- Make database writes safe and predictable. Use transactions when
  multiple related writes must succeed together.
- Do not log secrets, tokens, private browsing URLs, or sensitive user
  content.
- Keep environment variables documented with safe example names, but
  never put real credentials in source control.
- Handle external-service failures without corrupting user data or
  leaving the UI in a misleading state.
Testing and verification
Before finishing a change: 1. Run the most relevant checks available in
package.json (for example, lint, type-check, tests, or build). Use the
actual script names that exist. 2. Add or update tests for meaningful
logic, especially scheduling constraints, date/time handling,
recurrence, and data transformations. 3. Manually inspect relevant UI
states when possible: default, empty, loading, error, and narrow-screen
layouts. 4. If a check cannot be run, state why. Never claim a test
passed unless it was actually run. 5. Review the final diff for
accidental changes, secrets, debug code, and unrelated formatting.
Git and change management
- Do not discard user changes or run destructive Git commands.
- Do not overwrite configuration files without inspecting their
  current contents.
- Avoid broad formatting or refactoring changes unrelated to the task.
- Keep commits and changes small enough to review.
- If a generated file changes automatically, check the relevant
  generator and project instructions before trying to remove the
  change.
Definition of done
A task is complete when: - The requested behavior is implemented in the
existing project patterns. - The UI is usable, responsive, and
accessible where applicable. - Relevant validation, error handling, and
data-integrity concerns are addressed. - Appropriate checks have been
run, with results reported accurately. - Any remaining limitations or
assumptions are stated clearly.