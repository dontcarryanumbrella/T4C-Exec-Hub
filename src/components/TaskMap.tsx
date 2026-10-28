"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { select } from "d3-selection";
import { drag } from "d3-drag";
import { zoom, zoomIdentity } from "d3-zoom";

export type MapTask = { id: string; title: string; state: "live" | "overdue" | "done"; project: string | null; people: string[] };
export type MapHub = { id: string; name: string; kind: "folder" | "project"; color: string };
export type MapPerson = { id: string; name: string; role: string; color: string; ink: string };

type Node = SimulationNodeDatum & { id: string; type: "folder" | "project" | "person" | "task"; r: number; color: string; name: string; sub: string; ink?: string; task?: MapTask };
type Edge = { source: string | Node; target: string | Node; kind: "project" | "person" };

const STATE_COLOR = { live: "#7d93d9", overdue: "#f2703d", done: "#8fb8a1" };
const STATE_LABEL = { live: "Live", overdue: "Overdue", done: "Completed" };

// An Obsidian-style map of the club's work: folders, projects, and people are
// hubs sized by how many tasks they hold, and each task is a dot tied to its
// folder and to everyone on it. Physics comes from d3-force; hover glows and
// traces connections, dragging pulls linked nodes along, and a throw keeps
// its momentum.
export default function TaskMap({ hubs, people, tasks }: { hubs: MapHub[]; people: MapPerson[]; tasks: MapTask[] }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [withDone, setWithDone] = useState(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [moved, setMoved] = useState(false);
  const reset = useRef<() => void>(() => {});
  // The server sends fresh arrays on every refresh (opening a task re-renders
  // the page), so redraw only when the data itself changed, not the layout.
  const data = JSON.stringify([hubs, people, tasks]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      // Redraw only when the width really changes (not on every scrollbar flicker).
      t = setTimeout(() => setSize((s) => (s && Math.abs(s.w - el.clientWidth) < 24 ? s : { w: el.clientWidth, h: el.clientHeight })), 150);
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const el = box.current;
    const tip = tipRef.current;
    if (!el || !tip || !size) return;
    const { w: W, h: H } = size;
    setMoved(false);
    const shown = tasks.filter((t) => withDone || t.state !== "done");

    const deg = new Map<string, number>();
    const bump = (id: string) => deg.set(id, (deg.get(id) ?? 0) + 1);
    shown.forEach((t) => { if (t.project) bump(t.project); t.people.forEach(bump); });
    const scale = W < 640 ? 0.7 : 1;
    const radius = (id: string) => (9 + Math.sqrt(deg.get(id) ?? 0) * 6.5) * scale;

    // Hubs with no visible tasks would float alone; leave them out.
    const nodes: Node[] = [
      ...hubs.filter((h) => deg.has(h.id)).map((h): Node => ({ id: h.id, type: h.kind, r: radius(h.id), color: h.color, name: h.name, sub: h.kind === "folder" ? "General folder" : "Project" })),
      ...people.filter((p) => deg.has(p.id)).map((p): Node => ({ id: p.id, type: "person", r: radius(p.id) * 0.82, color: p.color, ink: p.ink, name: p.name, sub: p.role })),
      ...shown.map((t): Node => ({ id: t.id, type: "task", r: t.state === "overdue" ? 4.5 : 3.5, color: STATE_COLOR[t.state], name: t.title, sub: STATE_LABEL[t.state], task: t })),
    ];
    // Start hubs on a ring around the middle and tasks beside their hub, so
    // the map unfolds from the center instead of bursting out of a corner.
    const hubCount = nodes.filter((n) => n.type !== "task").length;
    nodes.forEach((n, i) => {
      if (n.type === "task") return;
      const a = (i / hubCount) * 2 * Math.PI;
      n.x = W / 2 + Math.cos(a) * Math.min(W, H) * 0.22;
      n.y = H / 2 + Math.sin(a) * Math.min(W, H) * 0.22;
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    nodes.forEach((n) => {
      if (n.type !== "task") return;
      const home = byId.get(n.task!.project ?? "") ?? byId.get(n.task!.people[0] ?? "");
      n.x = (home?.x ?? W / 2) + (Math.random() - 0.5) * 30;
      n.y = (home?.y ?? H / 2) + (Math.random() - 0.5) * 30;
    });
    const edges: Edge[] = shown.flatMap((t) => [
      ...(t.project && byId.has(t.project) ? [{ source: t.id, target: t.project, kind: "project" as const }] : []),
      ...t.people.filter((p) => byId.has(p)).map((p) => ({ source: t.id, target: p, kind: "person" as const })),
    ]);
    const near = new Map(nodes.map((n) => [n.id, new Set([n.id])]));
    edges.forEach((e) => { near.get(e.source as string)!.add(e.target as string); near.get(e.target as string)!.add(e.source as string); });
    // Hovering a hub also lights the other hubs its tasks connect to.
    const reach = (n: Node) => {
      if (n.type === "task") return near.get(n.id)!;
      const s = new Set(near.get(n.id));
      near.get(n.id)!.forEach((x) => { if (byId.get(x)?.type === "task") near.get(x)!.forEach((y) => s.add(y)); });
      return s;
    };

    // On narrow screens names would pile up, so they show on hover or tap.
    const svg = select(el).insert("svg", ".map-tip").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").classed("compact", scale < 1)
      .attr("aria-label", `Map of ${shown.length} tasks across ${hubs.filter((h) => deg.has(h.id)).length} folders and projects`);
    const g = svg.append("g");
    // Plain scrolling passes through to the page; Ctrl/⌘ + scroll (or a
    // trackpad pinch, which arrives as one) zooms. On touch screens one finger
    // scrolls the page and two pinch or pan the map.
    const zoomer = zoom<SVGSVGElement, unknown>().scaleExtent([0.5, 3])
      .filter((e) => (e.type === "wheel" ? e.ctrlKey || e.metaKey : e.type === "touchstart" ? e.touches.length > 1 : !e.button))
      .on("zoom", (e) => {
      g.attr("transform", e.transform);
      setMoved(e.transform.k !== 1 || e.transform.x !== 0 || e.transform.y !== 0);
    });
    svg.call(zoomer).on("dblclick.zoom", null);
    reset.current = () => {
      svg.call(zoomer.transform, zoomIdentity);
      sim.alpha(0.6).restart();
    };

    const edge = g.append("g").selectAll("line").data(edges).join("line")
      .attr("class", "map-edge").attr("stroke-dasharray", (d) => (d.kind === "person" ? "2 3" : null));
    const node = g.append("g").selectAll<SVGGElement, Node>("g").data(nodes).join("g")
      .attr("class", (d) => `map-node map-${d.type}`).style("--glow", (d) => `${d.color}aa`);
    node.each(function (d) {
      const s = select(this);
      if (d.type === "task") s.append("circle").attr("r", d.r).attr("fill", d.color).attr("stroke", "#fff").attr("stroke-width", 1.5);
      else if (d.type === "project") s.append("circle").attr("r", d.r).attr("fill", d.color).attr("stroke", "#fff").attr("stroke-width", 2);
      else if (d.type === "folder") {
        s.append("circle").attr("r", d.r).attr("fill", "#fff").attr("stroke", d.color).attr("stroke-width", 3);
        s.append("circle").attr("r", d.r * 0.32).attr("fill", d.color);
      } else {
        s.append("rect").attr("x", -d.r).attr("y", -d.r).attr("width", d.r * 2).attr("height", d.r * 2).attr("rx", d.r * 0.42)
          .attr("fill", d.color).attr("stroke", "#fff").attr("stroke-width", 2);
        s.append("text").text(d.name.slice(0, 1).toUpperCase()).attr("text-anchor", "middle").attr("dy", "0.35em")
          .attr("fill", d.ink ?? "#fff").attr("font-weight", 700).attr("font-size", Math.max(11, d.r * 0.7));
      }
    });
    const label = g.append("g").selectAll<SVGGElement, Node>("g").data(nodes.filter((n) => n.type !== "task")).join("g").attr("class", "map-label");
    label.append("path").attr("class", "map-label-line");
    label.append("text").attr("class", (d) => `map-label-text${d.type === "person" ? " person" : ""}`).text((d) => d.name);

    const sim = forceSimulation(nodes)
      .force("link", forceLink<Node, Edge>(edges).id((d) => d.id)
        .distance((l) => (l.kind === "project" ? 26 : 60) + (l.target as Node).r)
        .strength((l) => (l.kind === "project" ? 0.9 : 0.12)))
      .force("charge", forceManyBody<Node>().strength((d) => (d.type === "task" ? -22 : -340)))
      .force("collide", forceCollide<Node>((d) => d.r + (d.type === "task" ? 1.5 : 8)))
      .force("x", forceX(W / 2).strength(0.035))
      .force("y", forceY(H / 2).strength(0.06))
      .velocityDecay(0.28);

    const draw = () => {
      // Keep everything inside the frame, with room above and below hubs for
      // their label elbows.
      for (const d of nodes) {
        const mx = d.r + (d.type === "task" ? 4 : 12);
        const my = d.r + (d.type === "task" ? 4 : 30);
        d.x = Math.max(mx, Math.min(W - mx, d.x ?? 0));
        d.y = Math.max(my, Math.min(H - my, d.y ?? 0));
      }
      edge.attr("x1", (d) => (d.source as Node).x!).attr("y1", (d) => (d.source as Node).y!)
        .attr("x2", (d) => (d.target as Node).x!).attr("y2", (d) => (d.target as Node).y!);
      node.attr("transform", (d) => `translate(${d.x},${d.y})`);
      // Leader-line labels: a short elbow out to the side away from the middle,
      // flipped to the other side when the name wouldn't fit before the edge.
      label.each(function (d) {
        const room = d.r * 0.75 + 36 + d.name.length * (d.type === "person" ? 7 : 7.4);
        let sx = d.x! < W / 2 ? -1 : 1;
        if (sx > 0 && d.x! + room > W) sx = -1;
        else if (sx < 0 && d.x! - room < 0) sx = 1;
        const sy = d.y! < H / 2 ? -1 : 1;
        const x1 = d.x! + sx * d.r * 0.75, y1 = d.y! + sy * d.r * 0.75, x2 = x1 + sx * 14, y2 = y1 + sy * 14, x3 = x2 + sx * 18;
        const s = select(this);
        s.select("path").attr("d", `M${x1},${y1}L${x2},${y2}L${x3},${y2}`);
        s.select("text").attr("x", x3 + sx * 4).attr("y", y2).attr("dy", "0.35em").attr("text-anchor", sx < 0 ? "end" : "start");
      });
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop();
      sim.tick(300);
      draw();
    } else sim.on("tick", draw);

    // Drag pulls everything linked along on springs; let go and the node
    // keeps the throw's momentum, then settles.
    let vel = { x: 0, y: 0, t: 0 };
    let dragging = false;
    let armed: string | null = null;
    node.call(drag<SVGGElement, Node>()
      .on("start", function (e, d) {
        dragging = true;
        if (!e.active) sim.alphaTarget(0.35).restart();
        d.fx = d.x; d.fy = d.y;
        vel = { x: 0, y: 0, t: performance.now() };
        tip.hidden = true;
        select(this).classed("grab", true).raise();
      })
      .on("drag", (e, d) => {
        const now = performance.now(), dt = Math.max(16, now - vel.t);
        vel = { x: 0.6 * vel.x + (0.4 * (e.x - d.fx!) * 16) / dt, y: 0.6 * vel.y + (0.4 * (e.y - d.fy!) * 16) / dt, t: now };
        d.fx = e.x; d.fy = e.y;
      })
      .on("end", function (e, d) {
        if (!e.active) sim.alphaTarget(0);
        sim.alpha(Math.max(sim.alpha(), 0.5)).restart();
        d.fx = null; d.fy = null;
        d.vx = vel.x * 1.4; d.vy = vel.y * 1.4;
        select(this).classed("grab", false);
        dragging = false;
        // The pointer has usually left the node by the time it's dropped.
        if (!(this as SVGGElement).matches(":hover")) clear();
      }));

    const clear = () => {
      g.classed("dim", false);
      node.classed("on", false).classed("glow", false);
      label.classed("on", false);
      edge.classed("on", false);
      tip.hidden = true;
    };
    node
      .on("mouseenter", (_, d) => {
        const on = reach(d);
        const mine = near.get(d.id)!;
        g.classed("dim", true);
        node.classed("on", (x) => on.has(x.id)).classed("glow", (x) => x.id === d.id);
        label.classed("on", (x) => on.has(x.id));
        edge.classed("on", (l) => d.type === "task" ? (l.source as Node).id === d.id : mine.has((l.source as Node).id));
        if (d.task) {
          const hub = d.task.project ? byId.get(d.task.project)?.name : null;
          const who = d.task.people.map((p) => byId.get(p)?.name).filter(Boolean).join(", ") || "Up for grabs";
          tip.innerHTML = "";
          tip.append(Object.assign(document.createElement("b"), { textContent: d.name }), Object.assign(document.createElement("span"), { textContent: [hub, who, d.sub].filter(Boolean).join(" · ") }));
        } else {
          const list = shown.filter((t) => t.project === d.id || t.people.includes(d.id));
          const c = (k: MapTask["state"]) => list.filter((t) => t.state === k).length;
          const parts = [`${c("live")} live`, `${c("overdue")} overdue`, ...(withDone ? [`${c("done")} done`] : [])];
          tip.innerHTML = "";
          tip.append(Object.assign(document.createElement("b"), { textContent: d.name }), Object.assign(document.createElement("span"), { textContent: `${d.sub ? `${d.sub} · ` : ""}${list.length} task${list.length === 1 ? "" : "s"}: ${parts.join(", ")}` }));
        }
        tip.hidden = false;
      })
      .on("mousemove", (e: MouseEvent) => {
        if (dragging) return;
        const b = el.getBoundingClientRect();
        tip.style.left = `${Math.min(e.clientX - b.left + 14, b.width - 250)}px`;
        tip.style.top = `${e.clientY - b.top + 14}px`;
      })
      .on("mouseleave", () => { if (!dragging) clear(); })
      .on("click", (e: PointerEvent, d) => {
        // On touch screens the first tap shows the name and connections; a
        // second tap on the same circle opens it.
        if (e.pointerType === "touch" && armed !== d.id) {
          armed = d.id;
          return;
        }
        clear();
        if (d.type === "task") router.push(`/summary?task=${d.id}`, { scroll: false });
        else if (d.type === "person") router.push(`/people/${d.id}`);
        else router.push(`/projects/${d.id}`);
      });

    return () => { sim.stop(); svg.remove(); tip.hidden = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, withDone, size, router]);

  return (
    <>
      <div className="map-tools">
        <span className="map-key"><i className="k-project" />Project</span>
        <span className="map-key"><i className="k-folder" />General folder</span>
        <span className="map-key"><i className="k-person" />Person</span>
        <span className="map-key"><i className="k-task" style={{ background: STATE_COLOR.live }} />Live</span>
        <span className="map-key"><i className="k-task" style={{ background: STATE_COLOR.overdue }} />Overdue</span>
        {withDone && <span className="map-key"><i className="k-task" style={{ background: STATE_COLOR.done }} />Completed</span>}
        <div className="pill-toggle" role="group" aria-label="Which tasks">
          <button type="button" aria-pressed={!withDone} onClick={() => setWithDone(false)}>Open tasks</button>
          <button type="button" aria-pressed={withDone} onClick={() => setWithDone(true)}>Include completed</button>
        </div>
      </div>
      <div className="task-map" ref={box}>
        <div className="map-tip" ref={tipRef} hidden />
        {moved && <button type="button" className="secondary small map-reset" onClick={() => reset.current()}>Reset view</button>}
      </div>
    </>
  );
}
