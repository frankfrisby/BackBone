"use client";

import { useState } from "react";
import {
  useDashboardConfig,
  useConnectedSources,
  WIDGET_META,
  type WidgetConfig,
} from "@/lib/dashboard";
import {
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Minimize2,
  X,
  Unplug,
} from "lucide-react";

interface DashboardSettingsProps {
  onClose: () => void;
}

export function DashboardSettings({ onClose }: DashboardSettingsProps) {
  const { config, updateConfig } = useDashboardConfig();
  const { sources } = useConnectedSources();
  const [widgets, setWidgets] = useState<WidgetConfig[]>(
    config?.widgets || []
  );

  const handleToggle = (sourceId: string) => {
    setWidgets((prev) =>
      prev.map((w) =>
        w.sourceId === sourceId ? { ...w, enabled: !w.enabled } : w
      )
    );
  };

  const handleSizeToggle = (sourceId: string) => {
    setWidgets((prev) =>
      prev.map((w) =>
        w.sourceId === sourceId
          ? { ...w, size: w.size === "half" ? "full" : "half" }
          : w
      )
    );
  };

  const handleMove = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[target]] = [next[target], next[index]];
    setWidgets(next);
  };

  const handleSave = async () => {
    await updateConfig({ widgets, updatedAt: new Date().toISOString() });
    onClose();
  };

  const isConnected = (sourceId: string): boolean => {
    if (!sources) return true; // Assume connected if we can't check
    switch (sourceId) {
      case "portfolio":
      case "tickers":
      case "trading":
        return sources.alpaca ?? false;
      case "health":
        return sources.oura ?? false;
      case "goals":
        return sources.goals ?? true;
      case "lifeScores":
        return true;
      default:
        return true;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#1a1a1a]">
          <h2 className="text-[14px] font-semibold text-white">
            Dashboard Widgets
          </h2>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg bg-[#111] flex items-center justify-center hover:bg-[#1a1a1a] transition-colors"
          >
            <X className="h-3.5 w-3.5 text-neutral-400" />
          </button>
        </div>

        {/* Widget list */}
        <div className="p-4 space-y-2 max-h-[400px] overflow-auto no-scrollbar">
          {widgets.map((widget, index) => {
            const meta = WIDGET_META[widget.sourceId];
            if (!meta) return null;
            const Icon = meta.icon;
            const connected = isConnected(widget.sourceId);

            return (
              <div
                key={widget.sourceId}
                className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors ${
                  widget.enabled
                    ? "border-[#1a1a1a] bg-[#111]"
                    : "border-transparent bg-[#0a0a0a]"
                } ${!connected ? "opacity-50" : ""}`}
              >
                {/* Icon */}
                <div
                  className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${meta.color}15` }}
                >
                  <Icon
                    className="h-4 w-4"
                    style={{ color: meta.color }}
                  />
                </div>

                {/* Label */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-[12px] font-medium text-white">
                      {meta.label}
                    </p>
                    {!connected && (
                      <Unplug className="h-3 w-3 text-neutral-600" />
                    )}
                  </div>
                  <p className="text-[10px] text-neutral-600 truncate">
                    {meta.description}
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {/* Size toggle */}
                  <button
                    onClick={() => handleSizeToggle(widget.sourceId)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-[#1a1a1a] transition-colors"
                    title={widget.size === "half" ? "Expand to full width" : "Shrink to half width"}
                  >
                    {widget.size === "full" ? (
                      <Minimize2 className="h-3 w-3 text-neutral-500" />
                    ) : (
                      <Maximize2 className="h-3 w-3 text-neutral-500" />
                    )}
                  </button>

                  {/* Move up/down */}
                  <button
                    onClick={() => handleMove(index, "up")}
                    disabled={index === 0}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-[#1a1a1a] transition-colors disabled:opacity-30"
                  >
                    <ChevronUp className="h-3 w-3 text-neutral-500" />
                  </button>
                  <button
                    onClick={() => handleMove(index, "down")}
                    disabled={index === widgets.length - 1}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-[#1a1a1a] transition-colors disabled:opacity-30"
                  >
                    <ChevronDown className="h-3 w-3 text-neutral-500" />
                  </button>

                  {/* Enable toggle */}
                  <button
                    onClick={() => handleToggle(widget.sourceId)}
                    className="h-6 w-6 rounded flex items-center justify-center hover:bg-[#1a1a1a] transition-colors"
                  >
                    {widget.enabled ? (
                      <Eye className="h-3.5 w-3.5 text-white" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5 text-neutral-600" />
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-[#1a1a1a]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-[12px] text-neutral-400 hover:text-white transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors rounded-lg"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
