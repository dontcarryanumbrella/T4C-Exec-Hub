# T4C Exec Hub

A shared workspace for a student club's exec board. Everyone plans their week, the board sees who's doing what, and nothing falls through the cracks.

## What it does

- **Weekly plans.** Each exec picks 1–3 outcomes for the week; This Week shows everyone's card side by side, with overdue, blocked, and help-wanted work at the top.
- **Folders for the work.** One standing folder per role, plus a folder per project. Tasks have owners, due dates, and "waiting on" steps; unowned tasks are up for grabs, and a task can go to everyone at once.
- **Meetings that turn into tasks.** Meeting pages build an agenda from the board, and action items become real tasks.
- **Asking for and offering help**, @mentions, and shoutouts.
- **One morning email** with what's due tomorrow, new pings, and a weekly check-in reminder.
- **Calendar** of every deadline and meeting, downloadable or subscribable in Google Calendar.
- **Admin controls**: invite members, set per-person permissions, and approve proposed ideas.

## Technical features

**Stack:** Next.js 15 (App Router, React Server Components, Server Actions), React 19, Prisma 6 on Postgres, deployed on Vercel. No client state library and no UI framework: plain CSS with design tokens.

**Passwordless sign-in.** Admins invite people by email. Links are single-use and expiring (72 h for invites, 30 min for sign-ins), and only a SHA-256 hash of each token is stored. The link opens a "Continue" button rather than signing in on load, so email scanners can't spend it. Sessions last 120 days per device. The sign-in form is rate-limited per person and per IP, and never reveals who is a member.

**Server-side permissions.** Seven per-person permissions (propose, create projects, approve, manage tasks, write notes, manage templates, manage members), filled from presets and adjustable per box. Every Server Action re-checks permission and ownership on the server; hidden buttons are never the only guard.

**Undo for nearly everything.** Each action records how to reverse itself; the notice offers Undo for 30 minutes. Undo re-checks ownership, age, and permission, and refuses if the record changed since (for example, a task handed off again).

**Race-safe writes.** Claiming a task only succeeds while it has no owner. A weekly check-in saves in one transaction and rolls back entirely if any task changed mid-save. Editing a task that someone else just reassigned is refused with a message.

**Morning digest.** A Vercel Cron job (`/api/reminders`, 13:00 UTC, protected by `CRON_SECRET`) builds one email per person from pending pings, tasks due tomorrow, a Sunday/Monday check-in reminder, and other open tasks. Pings are queued with an email state, so nothing is sent twice and pings already read on the site are skipped. Nobody is emailed before their first sign-in. Mail goes out through Gmail SMTP (Nodemailer) with an app password; without one, emails print to the server console.

**Calendar feeds.** Per-person iCal feed behind a long random key (resettable), plus one-off `.ics` downloads and "Add to Google Calendar" links.

**Presence.** An open, visible tab sends a heartbeat each minute; avatars show a green dot while someone is online and "Active 2 hr ago" otherwise.

**Interface.** A Drive-style layout: one **+ New** button, a left rail, and a search bar across tasks, folders, people, and notes. A first-visit tour spotlights each control in turn. Each person's avatar color themes their own view. Works at phone width.

**Hardening.** Text inputs are trimmed and length-capped, links must be `http(s)`, dates must be real dates, and referenced records are checked to exist. "Waiting on" links can't form cycles. Redirects stay inside the app. Security headers block framing and referrer leaks.

**Tests.** `npm test` runs workflow regressions (week boundaries, reminders, card placement, handoffs and Undo, check-in choices, digest rules) against the real TypeScript with an in-memory database and a fixed clock. No network or email.

## Run it locally

You need Node 20+ and a Postgres database (a free hosted one, such as Prisma Postgres or Neon, works).

```bash
npm install
cp .env.example .env      # then set DATABASE_URL to your Postgres connection string
npm run db:setup          # creates the tables and seeds the roster, folders, and templates
npm run dev
```

Open http://localhost:3000 and sign in as `vp@example.com`. With no Gmail credentials set, the sign-in link prints in the terminal running `npm run dev`. Change the placeholder emails in `prisma/seed.mjs`, or on the Admin page, before inviting real people.

## Deploy

1. Import the repo into Vercel and attach a Postgres database.
2. Set `DATABASE_URL`, `APP_URL`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, and `CRON_SECRET` in the project's environment variables.
3. Run `npm run db:setup` once against the production database.

The daily email job is already scheduled in `vercel.json`.

## License

MIT. See [LICENSE](LICENSE).
