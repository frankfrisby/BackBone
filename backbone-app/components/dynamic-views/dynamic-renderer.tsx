"use client";

// This file is kept for backwards compatibility.
// The new view system uses components/views/view-container.tsx
// which is driven by the BackboneContext tab system.

export type ViewType = "portfolio" | "health" | "trading" | "calendar" | "goals";

export function DynamicRenderer({ viewType }: { viewType: ViewType }) {
  return null;
}
