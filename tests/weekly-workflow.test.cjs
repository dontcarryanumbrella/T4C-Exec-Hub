const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

// Execute the real TypeScript with an isolated database and clock. No mail or
// production connections are allowed in these workflow regressions.
function load(file, mocks = {}, now = "2026-10-25T13:00:00Z", cache = new Map()) {
  file = path.resolve(file);
  if (cache.has(file)) return cache.get(file);
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return new Date(now).getTime(); }
  }
  const exports = {};
  cache.set(file, exports);
  const requireModule = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith(".") || name.startsWith("@/")) {
      const target = name.startsWith("@/") ? path.resolve("src", name.slice(2)) : path.resolve(path.dirname(file), name);
      if (target.endsWith(path.join("lib", "db"))) return mocks.dbModule;
      return load(target + (fs.existsSync(target + ".ts") ? ".ts" : ".tsx"), mocks, now, cache);
    }
    return require(name);
  };
  const code = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require: requireModule, Date: Clock, FormData, process: { env: {} }, console }, { filename: file });
  return exports;
}

function fixture() {
  let seq = 0;
  const state = { member: [{ id: "a", name: "Alex", kind: "exec" }, { id: "b", name: "Blair", kind: "exec" }], task: [], commitment: [], checkIn: [], helpRequest: [], undoEntry: [], project: [] };
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value === undefined) return true;
    if (key === "OR") return value.some((w) => matches(row, w));
    if (key === "memberId_taskId_weekStart" || key === "memberId_weekStart") return matches(row, value);
    if (key === "task") return matches(state.task.find((t) => t.id === row.taskId) ?? {}, value);
    if (value && typeof value === "object" && !(value instanceof Date)) return Object.entries(value).every(([op, v]) => {
      if (op === "in") return v.includes(row[key]);
      if (op === "notIn") return !v.includes(row[key]);
      if (op === "not") return row[key] !== v;
      if (op === "gte") return row[key] >= v;
      if (op === "gt") return row[key] > v;
      if (op === "lt") return row[key] < v;
      if (op === "lte") return row[key] <= v;
      if (op === "some") return (row[key] ?? []).some((r) => matches(r, v));
      throw new Error("Unhandled fixture operator: " + op);
    });
    return row[key] === value;
  });
  // Relation writes ({ connect } / { set }) become a plain list of { id }.
  const relations = (data) => {
    const out = { ...data };
    if (out.coOwners) out.coOwners = (out.coOwners.set ?? out.coOwners.connect ?? []).map(({ id }) => ({ id }));
    return out;
  };
  const db = {};
  for (const model of Object.keys(state)) {
    const table = {
      findUnique: async ({ where }) => structuredClone(state[model].find((r) => matches(r, where)) ?? null),
      findFirst: async ({ where }) => structuredClone(state[model].find((r) => matches(r, where)) ?? null),
      findMany: async ({ where = {} } = {}) => structuredClone(state[model].filter((r) => matches(r, where))),
      count: async ({ where = {} } = {}) => state[model].filter((r) => matches(r, where)).length,
      create: async ({ data }) => { const row = { id: `new-${++seq}`, ...(model === "undoEntry" ? { usedAt: null } : {}), ...(model === "task" ? { status: "todo", coOwners: [] } : {}), createdAt: new Date("2026-10-25T13:00:00Z"), ...relations(data) }; state[model].push(row); return structuredClone(row); },
      updateMany: async ({ where, data }) => { const rows = state[model].filter((r) => matches(r, where)); rows.forEach((r) => Object.assign(r, relations(data))); return { count: rows.length }; },
      update: async ({ where, data }) => { const row = state[model].find((r) => matches(r, where)); if (!row) throw new Error("Record changed"); Object.assign(row, relations(data)); return structuredClone(row); },
      deleteMany: async ({ where }) => { state[model] = state[model].filter((r) => !matches(r, where)); },
      upsert: async ({ where, update, create }) => (await table.findUnique({ where })) ? table.update({ where, data: update }) : table.create({ data: create }),
    };
    db[model] = table;
  }
  db.$transaction = async (fn) => {
    const before = structuredClone(state);
    try { return await fn(db); } catch (error) { Object.assign(state, before); throw error; }
  };
  const notices = [];
  const mocks = {
    dbModule: { db },
    "@/lib/auth": { requireExec: async () => state.member[0], requireMember: async () => state.member[0] },
    "next/navigation": { redirect: (href) => { throw Object.assign(new Error("redirect"), { href }); } },
    "next/cache": { revalidatePath() {} },
    "next/headers": {},
    "@/lib/email": { sendEmail() { throw new Error("No emails in tests"); } },
    "@/lib/flash": { setFlash: async (notice) => notices.push(notice) },
    "@/lib/pings": { notify: async () => {}, pingMentions: async () => [] },
    "@/lib/xp": { xpFor: async () => 0, xpNote: async () => "" },
  };
  return { state, db, mocks, notices, actions: load("src/app/actions.ts", mocks) };
}
function form(values) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(values)) for (const v of Array.isArray(value) ? value : [value]) fd.append(key, v);
  return fd;
}
const redirected = (fn, href) => assert.rejects(fn, (e) => e.href === href);
const task = (id, extra = {}) => ({ id, title: id, ownerId: "a", coOwners: [], status: "todo", projectId: null, due: null, completedAt: null, description: "", blockedReason: "", ...extra });
const commitment = (memberId, weekStart, taskId = "work") => ({ id: `${memberId}-${weekStart}-${taskId}`, memberId, weekStart, taskId });

test("current week stays put on Saturday and Sunday, including year and DST boundaries", () => {
  const dates = load("src/lib/dates.ts");
  assert.equal(dates.activeWeek("2026-10-24"), "2026-10-19");
  assert.equal(dates.activeWeek("2026-10-25"), "2026-10-19");
  assert.equal(dates.activeWeek("2026-10-26"), "2026-10-26");
  assert.equal(dates.activeWeek("2027-01-03"), "2026-12-28");
  assert.equal(dates.activeWeek("2026-11-01"), "2026-10-26");
  assert.equal(dates.isISODate("2026-02-30"), false);
});

test("only Sunday reminds people to plan next week, and not once they have", async () => {
  for (const date of ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]) {
    for (const checked of [false, true]) {
      let queriedWeek;
      const db = { member: { findMany: async (query) => {
        queriedWeek = query.include.checkIns.where.weekStart;
        return [{ name: "Alex", email: "alex@example.test", kind: "exec", ownedTasks: [], notifications: [], checkIns: checked ? [{ id: "checked" }] : [] }];
      } } };
      const digest = load("src/lib/digest.ts", { dbModule: { db }, "./email": {} }, `${date}T13:00:00Z`);
      const emails = await digest.buildDigests();
      assert.equal(queriedWeek, "2026-10-26");
      const shouldRemind = !checked && date === "2026-10-25";
      assert.equal(emails.length, shouldRemind ? 1 : 0);
      if (shouldRemind) assert.match(emails[0].text, /checkin\?week=2026-10-26/);
    }
  }
});

test("self-created and assigned tasks join the same week; future deadlines stay in the backlog", async () => {
  const f = fixture();
  await redirected(() => f.actions.createTask(form({ title: "Self task" })), "/");
  assert.equal(f.state.commitment[0].memberId, "a");
  assert.equal(f.state.commitment[0].weekStart, "2026-10-19");
  f.state.member[0].canManageTasks = true;
  await redirected(() => f.actions.createTask(form({ title: "Assigned task", ownerId: "b" })), "/");
  assert.equal(f.state.commitment[1].memberId, "b");
  await redirected(() => f.actions.createTask(form({ title: "Next month", due: "2026-11-10" })), "/");
  assert.equal(f.state.commitment.length, 2);
  assert.match(f.notices.at(-1).text, /Not on a weekly card yet/);
});

test("handoff moves current and future cards, preserves history, and Undo restores placement", async () => {
  const f = fixture();
  f.state.task.push(task("work"));
  f.state.commitment.push(...["2026-10-12", "2026-10-19", "2026-10-26"].map((w) => commitment("a", w)));
  await redirected(() => f.actions.updateTask(form({ taskId: "work", ownerId: "b", title: "work" })), "/");
  assert.equal(f.state.task[0].ownerId, "b");
  assert.equal(f.state.commitment.find((c) => c.weekStart === "2026-10-12").memberId, "a");
  assert.ok(f.state.commitment.filter((c) => c.weekStart >= "2026-10-19").every((c) => c.memberId === "b"));
  const undo = load("src/lib/undo.ts", f.mocks);
  await undo.applyUndo(f.state.member[0], f.notices.at(-1).undoId);
  assert.equal(f.state.task[0].ownerId, "a");
  assert.equal(f.state.commitment.length, 3);
  assert.ok(f.state.commitment.every((c) => c.memberId === "a"));
});

test("releasing work removes upcoming cards and a full recipient never leaves it on the former owner's card", async () => {
  const f = fixture();
  f.state.task.push(task("work"));
  f.state.commitment.push(commitment("a", "2026-10-19"));
  for (let i = 0; i < 10; i++) { f.state.task.push(task(`busy-${i}`, { ownerId: "b" })); f.state.commitment.push(commitment("b", "2026-10-19", `busy-${i}`)); }
  await redirected(() => f.actions.updateTask(form({ taskId: "work", ownerId: "b" })), "/");
  assert.equal(f.state.commitment.filter((c) => c.taskId === "work").length, 0);
  assert.equal(f.state.task[0].ownerId, "b");
  f.state.member[0].canManageTasks = true;
  await redirected(() => f.actions.updateTask(form({ taskId: "work", ownerId: "open" })), "/");
  assert.equal(f.state.task[0].ownerId, null);
});

test("one check-in can defer work, finish work, and ask for help on the selected outcome", async () => {
  const f = fixture();
  f.state.task.push(task("later"), task("finish"), task("keep"));
  f.state.commitment.push(commitment("a", "2026-10-19", "later"), commitment("a", "2026-10-19", "finish"));
  f.state.helpRequest.push({ id: "help", taskId: "finish", status: "open" });
  await redirected(() => f.actions.submitCheckIn({}, form({ week: "2026-10-19", task: ["later", "finish", "keep"], plan_later: "later", plan_finish: "done", plan_keep: "week", help_keep: "Need a room", date_keep: "2026-10-25" })), "/");
  assert.equal(f.state.task.find((t) => t.id === "later").ownerId, "a");
  assert.equal(f.state.task.find((t) => t.id === "finish").status, "done");
  assert.equal(f.state.helpRequest[0].status, "resolved");
  assert.ok(f.state.helpRequest.some((r) => r.taskId === "keep" && r.message === "Need a room"));
  assert.deepEqual(f.state.commitment.map((c) => c.taskId).sort(), ["finish", "keep"]);
  assert.equal(f.state.checkIn[0].weekStart, "2026-10-19");
});

test("planning next week preserves this week; quiet-week check-in is valid", async () => {
  const f = fixture();
  f.state.task.push(task("work"));
  f.state.commitment.push(commitment("a", "2026-10-19"));
  await redirected(() => f.actions.submitCheckIn({}, form({ week: "2026-10-26", task: "work", plan_work: "later" })), "/?week=2026-10-26");
  assert.equal(f.state.commitment.length, 1);
  assert.equal(f.state.commitment[0].weekStart, "2026-10-19");
  assert.equal(f.state.checkIn[0].weekStart, "2026-10-26");
  const invalid = await f.actions.submitCheckIn({}, form({ week: "2026-10-12" }));
  assert.match(invalid.error, /week has changed/);
});

test("a stale check-in cannot change someone else's task or erase the existing plan", async () => {
  const f = fixture();
  f.state.task.push(task("work", { ownerId: "b" }));
  f.state.commitment.push(commitment("a", "2026-10-19"));
  const result = await f.actions.submitCheckIn({}, form({ week: "2026-10-19", task: "work", plan_work: "done" }));
  assert.match(result.error, /changed ownership or status/);
  assert.equal(f.state.task[0].status, "todo");
  assert.equal(f.state.commitment.length, 1);
  assert.equal(f.state.checkIn.length, 0);
});


test("the board shows overdue and dependency-blocked work before more than six help requests", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const f = fixture();
  for (let i = 0; i < 8; i++) f.state.task.push(task(`help-${i}`, { owner: f.state.member[0], helpRequests: [{ status: "open", message: "Need help" }], waitingOn: null }));
  f.state.task.push(task("Overdue room booking", { due: "2026-10-20", owner: f.state.member[0], waitingOn: null, helpRequests: [] }));
  f.state.task.push(task("Blocked publicity", { due: "2026-10-27", owner: f.state.member[0], waitingOn: { title: "Confirm speaker", status: "todo" }, helpRequests: [] }));
  const mocks = {
    ...f.mocks,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, className: props.className }, children) },
    "@/components/bits": { Avatar: () => null, StatusText: () => null, withTask: () => "/" },
    "@/components/TaskPanel": { default: () => null },
    "@/components/shell": { PageHeader: ({ title, actions }) => React.createElement("header", null, title, actions) },
    "@/components/icons": { Icon: () => null },
    "@/components/MoreToggle": { default: () => null },
  };
  const page = load("src/app/(hub)/page.tsx", mocks);
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Needs attention now · 10/);
  assert.ok(html.indexOf("Overdue room booking") < html.indexOf("help-0"));
  assert.ok(html.indexOf("Blocked publicity") < html.indexOf("help-0"));
  assert.match(html, /help-7/);
  assert.match(html, /Plan next week/);
});


test("a mid-save task change rolls back the whole check-in", async () => {
  const f = fixture();
  f.state.task.push(task("first"), task("second"));
  f.state.commitment.push(commitment("a", "2026-10-19", "first"));
  const update = f.db.task.updateMany;
  f.db.task.updateMany = async (args) => args.where.id === "second" ? { count: 0 } : update(args);
  const result = await f.actions.submitCheckIn({}, form({ week: "2026-10-19", task: ["first", "second"], plan_first: "done", plan_second: "week" }));
  assert.match(result.error, /changed while you were saving/);
  assert.ok(f.state.task.every((t) => t.status === "todo"));
  assert.equal(f.state.commitment.length, 1);
  assert.equal(f.state.checkIn.length, 0);
});

test("planning week is next week only on Sunday", () => {
  const dates = load("src/lib/dates.ts");
  assert.equal(dates.planningWeek("2026-10-25"), "2026-10-26");
  assert.equal(dates.planningWeek("2026-10-24"), "2026-10-19");
  assert.equal(dates.planningWeek("2026-10-26"), "2026-10-26");
});

test("tasks finished in check-in can be undone, reopening their help requests", async () => {
  const f = fixture();
  f.state.task.push(task("work", { status: "in_progress" }));
  f.state.helpRequest.push({ id: "h1", taskId: "work", status: "open" });
  f.state.commitment.push(commitment("a", "2026-10-26"));
  await redirected(() => f.actions.submitCheckIn({}, form({ week: "2026-10-19", task: ["work"], plan_work: "done" })), "/");
  assert.equal(f.state.task[0].status, "done");
  assert.equal(f.state.helpRequest[0].status, "resolved");
  assert.equal(f.state.commitment.length, 0);
  const undo = load("src/lib/undo.ts", f.mocks);
  assert.ok(await undo.applyUndo(f.state.member[0], f.notices.at(-1).undoId));
  assert.equal(f.state.task[0].status, "in_progress");
  assert.equal(f.state.task[0].completedAt, null);
  assert.equal(f.state.helpRequest[0].status, "open");
  assert.equal(f.state.commitment.length, 1);
});

test("a task handed to someone else mid-edit is refused with a message, not an error page", async () => {
  const f = fixture();
  f.state.task.push(task("work"));
  f.db.task.update = async () => { throw Object.assign(new Error("Record to update not found."), { code: "P2025" }); };
  await redirected(() => f.actions.updateTask(form({ taskId: "work", title: "work", ownerId: "a" })), "/");
  assert.equal(f.notices.at(-1).tone, "error");
  assert.match(f.notices.at(-1).text, /changed who owns this task/);
});

test("the board shows a task given to Everyone once, with a count", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const f = fixture();
  for (const owner of f.state.member) f.state.task.push(task(`copy-${owner.id}`, { title: "Send availability", ownerId: owner.id, owner, due: "2026-10-28", waitingOn: null, helpRequests: [] }));
  const mocks = {
    ...f.mocks,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, className: props.className }, children) },
    "@/components/bits": { Avatar: () => null, StatusText: () => null, withTask: () => "/" },
    "@/components/TaskPanel": { default: () => null },
    "@/components/shell": { PageHeader: ({ title, actions }) => React.createElement("header", null, title, actions) },
    "@/components/icons": { Icon: () => null },
    "@/components/MoreToggle": { default: () => null },
  };
  const page = load("src/app/(hub)/page.tsx", mocks);
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Needs attention now · 1/);
  assert.equal(html.split("Send availability").length - 1, 1);
  assert.match(html, /2 people, incl. you/);
});

test("morning emails wait until someone has signed in, then skip pings from before", async () => {
  const joined = new Date("2026-10-20T12:00:00Z");
  const people = [
    { name: "Never", email: "never@example.test", kind: "exec", joinedAt: null, ownedTasks: [], checkIns: [],
      notifications: [{ id: "n0", text: "Ping for someone not here yet", href: "/", readAt: null, createdAt: new Date("2026-10-24T12:00:00Z") }] },
    { name: "Joined", email: "joined@example.test", kind: "exec", joinedAt: joined, ownedTasks: [], checkIns: [{ id: "c" }],
      notifications: [
        { id: "old", text: "Ping from before joining", href: "/", readAt: null, createdAt: new Date("2026-10-19T12:00:00Z") },
        { id: "new", text: "Ping after joining", href: "/", readAt: null, createdAt: new Date("2026-10-24T12:00:00Z") },
      ] },
  ];
  const db = { member: { findMany: async ({ where }) => people.filter((m) => !where?.joinedAt || m.joinedAt !== null) } };
  const digest = load("src/lib/digest.ts", { dbModule: { db }, "./email": {} }, "2026-10-25T13:00:00Z");
  const emails = await digest.buildDigests();
  assert.equal(emails.map((e) => e.to).join(","), "joined@example.test");
  assert.match(emails[0].text, /Ping after joining/);
  assert.doesNotMatch(emails[0].text, /before joining/);
  assert.equal([...emails[0].pingIds].sort().join(","), "new,old");
});

test("unknown emails get told so (NetIDs get the alias reminder); members get a link", async () => {
  const f = fixture();
  f.state.member[0].email = "alex.a@duke.edu";
  f.state.member[1].email = "bb12@duke.edu";
  let sentTo = null;
  const actions = load("src/app/actions.ts", {
    ...f.mocks,
    "next/headers": { headers: async () => new Map() },
    "@/lib/auth": {
      ...f.mocks["@/lib/auth"],
      canSendLoginLink: async () => true,
      createLoginLink: async () => "https://hub.test/auth/verify?token=x",
    },
    "@/lib/email": { sendEmail: async (to) => { sentTo = to; } },
  });
  await redirected(() => actions.requestLogin(form({ email: "ab123@duke.edu" })), "/login?error=netid");
  assert.equal(sentTo, null);
  await redirected(() => actions.requestLogin(form({ email: "BB12@duke.edu" })), "/login?sent=1");
  assert.equal(sentTo, "bb12@duke.edu");
  sentTo = null;
  await redirected(() => actions.requestLogin(form({ email: "alex.a@duke.edu" })), "/login?sent=1");
  assert.equal(sentTo, "alex.a@duke.edu");
  sentTo = null;
  await redirected(() => actions.requestLogin(form({ email: "someone.else@duke.edu" })), "/login?error=unknown");
  assert.equal(sentTo, null);
});

test("on Sunday the check-in page opens next week's plan; the ending week only when asked", async () => {
  const React = require("react");
  const f = fixture();
  let shown;
  const mocks = {
    ...f.mocks,
    "next/link": { default: ({ href, children }) => React.createElement("a", { href }, children) },
    "@/components/shell": { PageHeader: ({ title }) => React.createElement("h1", null, title) },
    "./CheckInForm": { default: (props) => { shown = props.week; return null; } },
  };
  f.db.project = { findMany: async () => [] };
  const page = load("src/app/(hub)/checkin/page.tsx", mocks);
  const render = async (query) => { const el = await page.default({ searchParams: Promise.resolve(query) }); require("react-dom/server").renderToStaticMarkup(el); return shown; };
  assert.equal(await render({}), "2026-10-26");
  assert.equal(await render({ from: "reminder" }), "2026-10-26");
  assert.equal(await render({ week: "2026-10-19" }), "2026-10-19");
  assert.equal(await render({ week: "2026-01-05" }), "2026-10-26");
});

test("on Sunday the This Week plan button opens next week's plan", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const f = fixture();
  f.state.checkIn.push({ id: "c", memberId: "a", weekStart: "2026-10-19" });
  const mocks = {
    ...f.mocks,
    "next/link": { default: ({ href, children, ...props }) => React.createElement("a", { href, className: props.className }, children) },
    "@/components/bits": { Avatar: () => null, StatusText: () => null, withTask: () => "/" },
    "@/components/TaskPanel": { default: () => null },
    "@/components/shell": { PageHeader: ({ title, actions }) => React.createElement("header", null, title, actions) },
    "@/components/icons": { Icon: () => null },
    "@/components/MoreToggle": { default: () => null },
  };
  const page = load("src/app/(hub)/page.tsx", mocks);
  const html = renderToStaticMarkup(await page.default({ searchParams: Promise.resolve({}) }));
  assert.doesNotMatch(html, /href="\/checkin\?week=2026-10-19"/);
  assert.match(html, /<a href="\/checkin\?week=2026-10-26" class="button">Plan next week<\/a>/);
});

test("links never get a double slash when APP_URL ends with one", () => {
  const code = ts.transpileModule(fs.readFileSync("src/lib/url.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, process: { env: { APP_URL: "https://hub.example.test/" } } });
  assert.equal(`${exports.appUrl()}/checkin`, "https://hub.example.test/checkin");
});

test("extra people on a task can plan it into their own week; the owner can't be listed twice", async () => {
  const f = fixture();
  f.state.task.push(task("shared", { ownerId: "b" }));
  await redirected(() => f.actions.toggleThisWeek(form({ taskId: "shared" })), "/");
  assert.equal(f.state.commitment.length, 0);
  f.state.member[0].canManageTasks = true;
  await redirected(() => f.actions.updateTask(form({ taskId: "shared", ownerId: "b", title: "shared", coOwnerId: ["a", "b"] })), "/");
  assert.deepEqual(f.state.task[0].coOwners, [{ id: "a" }]);
  f.state.member[0].canManageTasks = false;
  await redirected(() => f.actions.toggleThisWeek(form({ taskId: "shared" })), "/");
  assert.deepEqual(f.state.commitment.map((c) => c.memberId), ["a"]);
});

test("renaming an Everyone task can update every copy, and Undo puts them all back", async () => {
  const f = fixture();
  const at = new Date("2026-10-25T12:00:00Z");
  f.state.task.push(
    task("mine", { title: "feedback?", projectId: "p", createdAt: at }),
    task("theirs", { title: "feedback?", projectId: "p", ownerId: "b", status: "done", createdAt: at }),
    task("other", { title: "feedback?", projectId: "p", ownerId: "b", createdAt: new Date("2026-10-01T12:00:00Z") }),
  );
  f.state.member[0].canManageTasks = true;
  await redirected(() => f.actions.updateTask(form({ taskId: "mine", ownerId: "a", title: "Site feedback", everyone: "yes" })), "/");
  assert.deepEqual(f.state.task.map((t) => t.title), ["Site feedback", "Site feedback", "feedback?"]);
  assert.equal(f.state.task[1].status, "done");
  assert.equal(f.state.task[1].ownerId, "b");
  const undoId = f.state.undoEntry.at(-1).id;
  await redirected(() => f.actions.undo(form({ undoId })), "/");
  assert.deepEqual(f.state.task.map((t) => t.title), ["feedback?", "feedback?", "feedback?"]);
});

test("deleting erases the task; only its owner or a manager can, and managers can erase every copy", async () => {
  const f = fixture();
  const at = new Date("2026-10-25T12:00:00Z");
  f.state.task.push(
    task("helping", { ownerId: "b", coOwners: [{ id: "a" }] }),
    task("mine", { title: "feedback?", createdAt: at }),
    task("theirs", { title: "feedback?", ownerId: "b", createdAt: at }),
  );
  await assert.rejects(() => f.actions.deleteTask(form({ taskId: "helping" })), /permission/);
  await redirected(() => f.actions.deleteTask(form({ taskId: "mine", everyone: "yes" })), "/");
  assert.deepEqual(f.state.task.map((t) => t.id), ["helping", "theirs"]);
  f.state.member[0].canManageTasks = true;
  f.state.task.push(task("mine2", { title: "feedback?", createdAt: at }));
  await redirected(() => f.actions.deleteTask(form({ taskId: "mine2", everyone: "yes" })), "/");
  assert.deepEqual(f.state.task.map((t) => t.id), ["helping"]);
});
