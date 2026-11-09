"use client";

import { useEffect, useState, useTransition } from "react";
import { reorderProjects } from "@/app/actions";

// Drag items to reorder them; the new order is saved for everyone.
// Items are server-rendered nodes keyed by project id.
export default function Reorder({ items, enabled, className }: { items: { id: string; node: React.ReactNode }[]; enabled: boolean; className?: string }) {
  const [order, setOrder] = useState(items.map((i) => i.id));
  const [dragging, setDragging] = useState<string | null>(null);
  const [, start] = useTransition();
  const key = items.map((i) => i.id).join();
  useEffect(() => setOrder(key ? key.split(",") : []), [key]);
  const byId = new Map(items.map((i) => [i.id, i.node]));

  return (
    <>
      {order.filter((id) => byId.has(id)).map((id) => (
        <div
          key={id}
          className={`${className ?? ""}${dragging === id ? " is-dragging" : ""}`}
          draggable={enabled}
          onDragStart={(e) => { if (!enabled) return; setDragging(id); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => {
            if (!dragging || dragging === id) return;
            e.preventDefault();
            setOrder((o) => { const n = o.filter((x) => x !== dragging); n.splice(n.indexOf(id) + (o.indexOf(dragging) < o.indexOf(id) ? 1 : 0), 0, dragging); return n; });
          }}
          onDrop={(e) => e.preventDefault()}
          onDragEnd={() => { if (!dragging) return; setDragging(null); const saved = order; start(() => reorderProjects(saved)); }}
        >
          {byId.get(id)}
        </div>
      ))}
    </>
  );
}
