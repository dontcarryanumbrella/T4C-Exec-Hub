import { AvatarArt } from "./AvatarArt";

// Tiny drawn versions of the hub's own screens, used by the first-login tour
// and the Guide so people can see what to look for. Purely decorative.

export function MiniWeek() {
  const people = [
    { n: "Avery", c: "pink", s: "arch", t: ["Book Sanford room", "Draft agenda"] },
    { n: "Sam", c: "blue", s: "circle", t: ["Finish design"] },
    { n: "Morgan", c: "yellow", s: "bear", t: ["Poster v2", "Post on IG"] },
  ];
  return (
    <div className="mini mini-week">
      {people.map((p) => (
        <div key={p.n} className="mini-card">
          <div className="mini-row"><AvatarArt name={p.n} look={{ avatarColor: p.c, avatarShape: p.s, avatarFace: "dots" }} size={18} /><b>{p.n}</b></div>
          {p.t.map((t) => <div key={t} className="mini-line">{t}</div>)}
        </div>
      ))}
    </div>
  );
}

export function MiniNew() {
  return (
    <div className="mini mini-new">
      <span className="mini-newbtn">＋ New</span>
      <div className="mini-menu">
        <div>✓ Plan this week</div>
        <div>▢ Project</div>
        <div>▭ General folder</div>
        <div>✦ Idea to propose</div>
        <div>♡ Shoutout</div>
      </div>
    </div>
  );
}

export function MiniSummary() {
  // A tiny ring (live / overdue / done) beside a few linked dots.
  const R = 22;
  const C = 2 * Math.PI * R;
  const parts = [
    { color: "#2451d6", share: 0.55 },
    { color: "#f2703d", share: 0.15 },
    { color: "#0e6b3e", share: 0.3 },
  ];
  let start = 0;
  return (
    <div className="mini mini-summary">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        {parts.map((p) => {
          const len = p.share * C;
          const el = <circle key={p.color} cx="32" cy="32" r={R} fill="none" stroke={p.color} strokeWidth="9" strokeDasharray={`${len - 2} ${C}`} strokeDashoffset={-start} transform="rotate(-90 32 32)" />;
          start += len;
          return el;
        })}
      </svg>
      <svg width="96" height="72" viewBox="0 0 96 72" aria-hidden>
        <g stroke="#c9ceda" strokeWidth="1">
          <line x1="30" y1="34" x2="14" y2="16" /><line x1="30" y1="34" x2="12" y2="50" /><line x1="30" y1="34" x2="48" y2="56" />
          <line x1="70" y1="28" x2="48" y2="56" /><line x1="70" y1="28" x2="86" y2="12" /><line x1="70" y1="28" x2="88" y2="46" />
        </g>
        <circle cx="30" cy="34" r="12" fill="#2451d6" />
        <circle cx="70" cy="28" r="9" fill="#fff" stroke="#0e6b3e" strokeWidth="3" />
        <rect x="40" y="48" width="16" height="16" rx="6" fill="#f26fae" />
        {[[14, 16], [12, 50], [86, 12], [88, 46]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.5" fill={i === 1 ? "#f2703d" : "#7d93d9"} />)}
      </svg>
    </div>
  );
}

export function MiniPanel() {
  return (
    <div className="mini mini-panel">
      <b>Poster v2</b>
      <div className="mini-muted">In progress · due Thu</div>
      <div className="mini-seg"><span>Not started</span><span className="on">In progress</span><span>Done ✓</span></div>
      <div className="mini-row"><span className="mini-ghostbtn">I can help</span><span className="mini-ghostbtn">Ping Morgan</span><span className="mini-dots">⋯</span></div>
    </div>
  );
}

export function MiniCheckin() {
  return (
    <div className="mini mini-check">
      <div className="mini-row">Confirm a speaker</div>
      <div className="mini-seg"><span className="on">This week</span><span>Later</span><span>Done</span></div>
      <div className="mini-row">Draft newsletter</div>
      <div className="mini-seg"><span>This week</span><span className="on">Later</span><span>Done</span></div>
      <div className="mini-xp">Plan saved</div>
    </div>
  );
}

export function MiniFolders() {
  return (
    <div className="mini mini-folders">
      {["Events & Programming", "Brand & Marketing", "Fall speaker event"].map((f, i) => (
        <div key={f} className={`mini-folder${i === 2 ? " proj" : ""}`}>{i === 2 ? "▤" : "▰"} {f}</div>
      ))}
    </div>
  );
}

export function MiniPing() {
  return (
    <div className="mini mini-ping">
      <div className="mini-input">Can you check this <span className="mini-at">@Morgan</span></div>
      <div className="mini-bell">🔔<span>1</span></div>
    </div>
  );
}

export function MiniCalendar() {
  return (
    <div className="mini mini-cal">
      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
        <div key={d} className="mini-day">
          <i>{d}</i>
          {i === 1 && <span className="mini-ev">3pm Poster</span>}
          {i === 3 && <span className="mini-ev due">Due Speaker</span>}
        </div>
      ))}
    </div>
  );
}

export function MiniUndo() {
  return (
    <div className="mini mini-undo">
      <span className="mini-toast">✓ Marked “Poster v2” done. <u>Undo</u></span>
    </div>
  );
}

export function MiniBuddy() {
  const looks = [
    { avatarColor: "yellow", avatarShape: "arch", avatarFace: "wink", avatarExtra: "headphones" },
    { avatarColor: "coral", avatarShape: "triangle", avatarFace: "dots", avatarExtra: "glasses" },
    { avatarColor: "teal", avatarShape: "bear", avatarFace: "happy", avatarExtra: "none" },
    { avatarColor: "purple", avatarShape: "bunny", avatarFace: "blush", avatarExtra: "bow" },
  ];
  return (
    <div className="mini mini-buddy">
      {looks.map((l, i) => <AvatarArt key={i} name="T4C" look={l} size={40} />)}
    </div>
  );
}
