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
        <div>✦ Idea to propose</div>
        <div>☰ Meeting notes</div>
        <div>♡ Shoutout</div>
      </div>
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
