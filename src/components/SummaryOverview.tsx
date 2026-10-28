import { Shape, type ShapeName } from "./Shapes";

export type StatusCounts = { live: number; overdue: number; done: number };

const SEGMENTS: { key: keyof StatusCounts; label: string; color: string; shape: ShapeName }[] = [
  { key: "live", label: "Live", color: "#2451d6", shape: "pill" },
  { key: "overdue", label: "Overdue", color: "#f2703d", shape: "flower" },
  { key: "done", label: "Completed", color: "#0e6b3e", shape: "clover" },
];

// The ring (one stroke-dashed circle per status, with a small white gap
// between segments) and a tile per count. Hovering either highlights the
// status in both, in CSS alone.
export default function SummaryOverview({ counts, assigned, upForGrabs }: { counts: StatusCounts; assigned: number; upForGrabs: number }) {
  const total = counts.live + counts.overdue + counts.done;
  const R = 96;
  const C = 2 * Math.PI * R;
  const shown = SEGMENTS.filter((s) => counts[s.key] > 0);
  const gap = shown.length > 1 ? 3 : 0;
  let start = 0;
  const arcs = shown.map((s) => {
    const len = (counts[s.key] / total) * C;
    const arc = { ...s, dash: `${Math.max(len - gap, 0.5)} ${C}`, offset: -start };
    start += len;
    return arc;
  });
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <section className="overview" aria-label="Task totals">
      <div className="donut">
        <svg viewBox="0 0 240 240" role="img" aria-label={`${counts.live} live, ${counts.overdue} overdue, ${counts.done} completed`}>
          <circle cx="120" cy="120" r={R} fill="none" stroke="var(--line-soft)" strokeWidth="28" />
          {arcs.map((a) => (
            <circle
              key={a.key}
              data-k={a.key}
              className="donut-slice"
              cx="120"
              cy="120"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth="28"
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              transform="rotate(-90 120 120)"
            >
              <title>{`${a.label}: ${counts[a.key]}`}</title>
            </circle>
          ))}
        </svg>
        <div className="donut-center">
          <b>{total}</b>
          <span>{total === 1 ? "task" : "tasks"}</span>
        </div>
      </div>
      <div className="stat-tiles">
        <div className="stat-tile">
          <Shape name="square" color="var(--ink)" />
          <span className="num">{assigned}</span>
          <span className="lbl">Assigned <em>· {upForGrabs} up for grabs</em></span>
        </div>
        {SEGMENTS.map((s) => (
          <div key={s.key} className="stat-tile" data-k={s.key}>
            <Shape name={s.shape} color={s.color} />
            <span className="num">{counts[s.key]}</span>
            <span className="lbl">{s.label} <em>· {pct(counts[s.key])}%</em></span>
          </div>
        ))}
      </div>
    </section>
  );
}
