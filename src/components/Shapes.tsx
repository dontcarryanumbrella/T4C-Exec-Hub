// The hub's flat shape family (flower, pill, clover, circle, tilted square):
// small identity marks for section titles, totals, and the rail's footer.
// Never used as backgrounds, so the pages stay white.
const SHAPES = {
  flower:
    "M12 1.5c1.6 0 2.4 1.4 3.6 1.9 1.3.5 2.9-.1 4 1s.5 2.7 1 4c.5 1.2 1.9 2 1.9 3.6s-1.4 2.4-1.9 3.6c-.5 1.3.1 2.9-1 4s-2.7.5-4 1c-1.2.5-2 1.9-3.6 1.9s-2.4-1.4-3.6-1.9c-1.3-.5-2.9.1-4-1s-.5-2.7-1-4C2.9 14.4 1.5 13.6 1.5 12s1.4-2.4 1.9-3.6c.5-1.3-.1-2.9 1-4s2.7-.5 4-1C9.6 2.9 10.4 1.5 12 1.5z",
  clover:
    "M12 10.2C10 6.4 8.3 2.5 5.8 2.5 3.3 2.5 1.5 4.6 1.5 7c0 2.3 2 3.9 5.7 5-3.7 1.1-5.7 2.7-5.7 5 0 2.4 1.8 4.5 4.3 4.5 2.5 0 4.2-3.9 6.2-7.7 2 3.8 3.7 7.7 6.2 7.7 2.5 0 4.3-2.1 4.3-4.5 0-2.3-2-3.9-5.7-5 3.7-1.1 5.7-2.7 5.7-5 0-2.4-1.8-4.5-4.3-4.5-2.5 0-4.2 3.9-6.2 7.7z",
  pill: "M7.5 6h9a6 6 0 0 1 0 12h-9a6 6 0 0 1 0-12z",
  circle: "M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z",
  // A rounded square tilted 12°.
  square: "M5.1 5.1q-.7-3.4 2.7-4.1l9-1.9q3.4-.7 4.1 2.7l1.9 9q.7 3.4-2.7 4.1l-9 1.9q-3.4.7-4.1-2.7z",
} as const;

export type ShapeName = keyof typeof SHAPES;

export function Shape({ name, color, size = 24, className }: { name: ShapeName; color: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`shape${className ? ` ${className}` : ""}`} aria-hidden>
      <path d={SHAPES[name]} fill={color} transform={name === "square" ? "translate(.5 3)" : undefined} />
    </svg>
  );
}

// The T4C mark: four of the family's shapes in a 2×2 grid, one per quarter.
// Kept in sync with src/app/icon.svg (the favicon).
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" className="brand-mark" aria-hidden>
      <g><circle cx="6.5" cy="6.5" r="6" fill="#2451d6" /></g>
      <g><path d={SHAPES.flower} fill="#f2703d" transform="translate(14.8 .8) scale(.52)" /></g>
      <g><rect x="1.5" y="16.5" width="10" height="10" rx="3" fill="#d9a514" transform="rotate(-12 6.5 21.5)" /></g>
      <g><path d={SHAPES.clover} fill="#0e6b3e" transform="translate(15 15) scale(.5)" /></g>
    </svg>
  );
}

// A few shapes peeking up from the bottom of the left rail.
export function ShapeFoot() {
  const at = (name: ShapeName, color: string, x: number, y: number, s: number) => (
    <path d={SHAPES[name]} fill={color} transform={`translate(${x} ${y}) scale(${s})`} />
  );
  return (
    <svg className="shape-foot" viewBox="0 0 212 84" aria-hidden>
      {at("flower", "#f2703d", -6, 30, 2.6)}
      {at("pill", "#2451d6", 46, 40, 2.4)}
      {at("clover", "#0e6b3e", 100, 18, 3)}
      {at("circle", "#f7a8cf", 164, 36, 2.1)}
      {at("square", "#d9a514", 182, 14, 1.1)}
    </svg>
  );
}
