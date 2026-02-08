"use client";

import { useQuery } from "@tanstack/react-query";
import { Calendar, Clock, MapPin, Video } from "lucide-react";

interface CalendarViewProps {
  data?: any;
}

async function fetchEvents() {
  try {
    const resp = await fetch("http://localhost:3000/api/calendar", {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error("Failed");
    return resp.json();
  } catch {
    return null;
  }
}

const accentColors = [
  { border: "border-l-orange-500", bg: "bg-orange-500/10", dot: "bg-orange-500" },
  { border: "border-l-green-500", bg: "bg-green-500/10", dot: "bg-green-500" },
  { border: "border-l-blue-500", bg: "bg-blue-500/10", dot: "bg-blue-500" },
  { border: "border-l-purple-500", bg: "bg-purple-500/10", dot: "bg-purple-500" },
  { border: "border-l-yellow-500", bg: "bg-yellow-500/10", dot: "bg-yellow-500" },
  { border: "border-l-pink-500", bg: "bg-pink-500/10", dot: "bg-pink-500" },
];

function formatTime(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

function formatDateHeader(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    return d.toLocaleDateString([], {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function CalendarView({ data }: CalendarViewProps) {
  const { data: events } = useQuery({
    queryKey: ["calendar"],
    queryFn: fetchEvents,
  });

  const evts = events || data?.events || [];

  const displayEvents =
    evts.length > 0
      ? evts
      : [
          {
            id: "1",
            title: "Morning Standup",
            startTime: new Date().toISOString(),
            endTime: new Date(Date.now() + 1800000).toISOString(),
            location: "Google Meet",
            isVirtual: true,
          },
          {
            id: "2",
            title: "Deep Work Block",
            startTime: new Date(Date.now() + 3600000).toISOString(),
            endTime: new Date(Date.now() + 7200000).toISOString(),
            location: "",
            isVirtual: false,
          },
          {
            id: "3",
            title: "Lunch",
            startTime: new Date(Date.now() + 10800000).toISOString(),
            endTime: new Date(Date.now() + 14400000).toISOString(),
            location: "",
            isVirtual: false,
          },
          {
            id: "4",
            title: "Portfolio Review",
            startTime: new Date(Date.now() + 18000000).toISOString(),
            endTime: new Date(Date.now() + 19800000).toISOString(),
            location: "Zoom",
            isVirtual: true,
          },
        ];

  // Group by date
  const grouped: Record<string, any[]> = {};
  for (const evt of displayEvents) {
    const dateKey = new Date(evt.startTime).toDateString();
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(evt);
  }

  const now = new Date();

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Hero Header */}
      <div className="px-6 pt-8 pb-6 gradient-hero">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="h-9 w-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-orange-500" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white tracking-tight">
              Schedule
            </h2>
            <p className="text-[11px] text-neutral-600">
              {now.toLocaleDateString([], {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        </div>
      </div>

      {/* Current Time Card */}
      <div className="px-5 mb-5">
        <div className="card-elevated px-4 py-3 flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-orange-500/10 flex items-center justify-center">
            <Clock className="h-3.5 w-3.5 text-orange-500" />
          </div>
          <div>
            <span className="text-[14px] font-semibold text-white tabular-nums">
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-[11px] text-neutral-600 ml-2">
              {displayEvents.length} event{displayEvents.length !== 1 ? "s" : ""} today
            </span>
          </div>
        </div>
      </div>

      {/* Events by date */}
      {Object.entries(grouped).map(([dateKey, dateEvents]) => (
        <div key={dateKey} className="px-5 mb-5">
          <h3 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium mb-3">
            {formatDateHeader(dateEvents[0]?.startTime)}
          </h3>

          <div className="space-y-1.5">
            {dateEvents.map((evt: any, idx: number) => {
              const isPast =
                new Date(evt.endTime || evt.startTime) < now;
              const isNow =
                new Date(evt.startTime) <= now &&
                new Date(evt.endTime || evt.startTime) >= now;
              const accent = accentColors[idx % accentColors.length];

              return (
                <div
                  key={evt.id || idx}
                  className={`card-interactive border-l-2 ${accent.border} px-4 py-3.5 ${
                    isPast ? "opacity-40" : ""
                  } ${isNow ? "ring-1 ring-orange-500/20" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4
                        className={`text-[13px] font-medium ${
                          isPast ? "text-neutral-500" : "text-white"
                        }`}
                      >
                        {evt.title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] text-neutral-500 tabular-nums">
                          {formatTime(evt.startTime)}
                          {evt.endTime && ` - ${formatTime(evt.endTime)}`}
                        </span>
                      </div>
                      {evt.location && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          {evt.isVirtual ? (
                            <Video className="h-3 w-3 text-neutral-600" />
                          ) : (
                            <MapPin className="h-3 w-3 text-neutral-600" />
                          )}
                          <span className="text-[11px] text-neutral-600">
                            {evt.location}
                          </span>
                        </div>
                      )}
                    </div>
                    {isNow && (
                      <span className="text-[10px] font-semibold text-orange-400 bg-orange-500/10 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                        Now
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Empty state */}
      {displayEvents.length === 0 && (
        <div className="px-5 py-16 text-center">
          <div className="h-12 w-12 rounded-2xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center mx-auto mb-3">
            <Calendar className="h-5 w-5 text-neutral-600" />
          </div>
          <p className="text-[13px] text-neutral-500">No events scheduled</p>
        </div>
      )}
    </div>
  );
}
