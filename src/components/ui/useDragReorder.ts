"use client";

import { useCallback, useState } from "react";
import type { DragEvent } from "react";

interface DragState {
  index: number;
}

export interface DragHandlers {
  draggable: true;
  onDragStart: (e: DragEvent) => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}

// Ported from Admin Console.dc.html's Component.dragHandlers — plain HTML5
// drag events, one drag "kind" per hook instance (blocks vs rows use separate
// hook calls so they never interfere with each other).
export function useDragReorder(apply: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);

  const handlers = useCallback(
    (index: number): DragHandlers => ({
      draggable: true,
      onDragStart: (e: DragEvent) => {
        e.dataTransfer.effectAllowed = "move";
        setDrag({ index });
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      },
      onDrop: (e: DragEvent) => {
        e.preventDefault();
        setDrag((d) => {
          if (!d || d.index === index) return null;
          apply(d.index, index);
          return null;
        });
      },
      onDragEnd: () => setDrag(null),
      dragging: drag?.index === index,
    }),
    [drag, apply],
  );

  return handlers;
}

export function reorder<T>(list: T[], from: number, to: number): T[] {
  const out = list.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
