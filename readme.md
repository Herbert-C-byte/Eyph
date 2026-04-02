# EYPH — Earn Your Phase

A focused OKR and KPI execution tracker built for high-output learning sprints.
No dashboards. No bloat. One target locked, one metric moving, one phase at a time.

## What it does

EYPH organizes your goals into three layers:

- **OKRs** — objectives with deadlines. The destination.
- **KPIs** — measurable results attached to each OKR. Hours targets or task lists.
- **Tasks** — the specific actions that move a KPI forward.

The focus panel locks one KPI at a time so your attention never splits.
Deadline urgency is surfaced automatically — warnings at 3 days, overdue pulse animation past deadline.

## Stack

- Vanilla HTML, CSS, JavaScript — zero dependencies, zero build step
- localStorage for persistence (local dev)
- Single-file architecture: `index.html`, `style.css`, `script.js`

## Running locally
```bash
git clone https://github.com/YOUR_USERNAME/eyph.git
cd eyph
# Open index.html in any browser — no server required
open index.html
```

## Project structure
```
eyph/
├── index.html   — markup and modal structure
├── style.css    — cyberpunk design system, CSS variables, responsive layout
└── script.js    — APP module: state, persistence, CRUD, render, events
```

## How to use

1. Click **+ OKR** to create an objective with a deadline
2. Click **+ KPI** to add a measurable result — choose Hours or Tasks type
3. Click any KPI in the sidebar to lock it as your active focus
4. Log hours or check off tasks in the focus panel
5. Use **⚡ CHANGE FOCUS** to switch between active KPIs

## Design principles

- One focus at a time — the panel shows only the active KPI
- Every phase ends with a shipped artifact, not a finished course
- Urgency is automatic — deadlines surface warnings without manual review

## License

MIT