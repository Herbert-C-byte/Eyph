# EYPH — Earn Your Phase

A focused OKR and KPI execution tracker built for high-output learning sprints.  
One target locked. One metric moving. One phase at a time.

---

## What it does

EYPH organizes your goals into three layers:

- **OKRs** — objectives with deadlines. The destination.
- **KPIs** — measurable results attached to each OKR. Hours targets or task lists.
- **Tasks** — specific actions that move a KPI forward. Each task can carry notes, links, or context.

The **Focus Panel** locks one KPI at a time so your attention never splits.  
The **Dashboard** gives you a macro and micro view across all objectives — progress rings, completion bars, and a year-level chart.  
Deadline urgency is surfaced automatically: warnings at 3 days, pulsing red past deadline.

---

## Stack

- Vanilla HTML, CSS, JavaScript — zero dependencies, zero build step
- Supabase (PostgreSQL + REST API) for persistent backend storage
- Vercel for hosting
- Three-file architecture: `index.html`, `style.css`, `script.js`

---

## Running locally

```bash
git clone https://github.com/YOUR_USERNAME/eyph.git
cd eyph
# Open index.html in any browser — no server required
open index.html
```

The app connects to Supabase on load. Data persists across devices and browsers.

---

## Project structure

```
eyph/
├── index.html   — markup, views (focus + dashboard), modal structure
├── style.css    — cyberpunk design system, CSS variables, responsive layout
└── script.js    — APP module: DB layer, state, CRUD, render, events
```

---

## Database schema (Supabase / PostgreSQL)

```
okrs         — id, title, deadline, created_at
kpis         — id, okr_id (→ okrs), title, type, target, progress, created_at
tasks        — id, kpi_id (→ kpis), title, description, done, created_at
app_settings — key, value  (stores focus_kpi_id)
```

All foreign keys use `ON DELETE CASCADE`. RLS is enabled with open policies (single-user app, auth deferred).

---

## How to use

1. Click **+ OKR** to create an objective with a deadline
2. Click **+ KPI** to attach a measurable result, choose Hours or Tasks type
3. Click any KPI in the sidebar to lock it as your active focus
4. You can add descriptions to the KPIs
5. Log hours or check off tasks in the focus panel
6. Press **F** or click **⚡ CHANGE FOCUS** to switch between KPIs
7. Switch to **◎ DASHBOARD** to see macro progress, OKR rings, and KPI bars
8. Double-click any OKR or KPI title to rename it inline
9. Click **⬇ EXPORT** to download a full JSON backup

---

## Deploying

Files must be present locally before deploying. From the project directory:

```powershell
npx -y @vercel/mcp@latest --site-id 8a36cd7e-2c83-4fd0-bb3d-1ec72fc9abf8 --proxy-path "<proxy-path>"
```

---

## Roadmap

**Next — Security**
- Supabase Auth (email/password, single user)
- Row Level Security policies scoped to `auth.uid()`
- Login screen that gates the entire app

**Planned features**
- Phase entity between OKR and KPI — gate KPIs behind phase completion
- Completed state for OKRs — archive finished objectives out of the sidebar
- Weekly summary view — hours logged and tasks completed for the current week
- Dark/dim mode toggle for late-night sessions

---

## Design principles

- One focus at a time — the panel shows only the active KPI
- Execution over planning — logging is proof of work
- Urgency is automatic — deadlines surface without manual review
- Zero noise — no streaks, no notifications, no gamification

---

## License

MIT
