import { XP, type Level } from "@/lib/xp";

// Your level, how far into it you are, and how points are earned. Only ever
// shown to you: it's encouragement, not a scoreboard.
export function LevelCard({ level }: { level: Level }) {
  const pct = Math.round((level.into / level.span) * 100);
  return (
    <div className="level-card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>
          <span className={`tier tier-${level.tier}`}>{level.title}</span> <span className="small muted">Lv {level.level}</span>
        </span>
        <span className="small muted">{level.xp} XP</span>
      </div>
      <div className={`xp-bar xp-${level.tier}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to next level">
        <span style={{ width: `${pct}%` }} />
      </div>
      <details className="small">
        <summary className="muted">{level.span - level.into} XP to the next level · how to earn</summary>
        <ul className="xp-list">
          <li>Weekly check-in <span>+{XP.checkIn}</span></li>
          <li>Finish a task you own <span>+{XP.taskDone}</span></li>
          <li>…and it&apos;s a milestone <span>+{XP.milestoneBonus}</span></li>
          <li>Your help gets accepted <span>+{XP.helpAccepted}</span></li>
          <li>Your idea gets approved <span>+{XP.ideaApproved}</span></li>
          <li>Someone gives you a shoutout <span>+{XP.shoutoutReceived}</span></li>
          <li>Thank someone new <span>+{XP.personThanked}</span></li>
        </ul>
      </details>
    </div>
  );
}

// Compact version for the account menu.
export function LevelLine({ level }: { level: Level }) {
  const pct = Math.round((level.into / level.span) * 100);
  return (
    <div className="level-line">
      <span className="small"><span className={`tier tier-${level.tier}`}>{level.title}</span> <span className="muted">Lv {level.level}</span></span>
      <div className={`xp-bar xp-${level.tier}`}><span style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
