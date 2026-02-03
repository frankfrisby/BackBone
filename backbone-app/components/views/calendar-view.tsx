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

const timeColors = [
  "border-l-orange-500",
  "border-l-green-500",
  "border-l-blue-500",
  "border-l-purple-500",
  "border-l-yellow-500",
  "border-l-pink-500",
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
    return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
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

  // Generate mock events if none available
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

  // Current time indicator
  const now = new Date();
  const currentHour = now.getHours();
  const timeSlots = Array.from({ length: 12 }, (_, i) => i + 7); // 7am-6pm

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-semibold text-neutral-100">Schedule</h2>
        </div>
        <p className="text-xs text-neutral-500">
          {new Date().toLocaleDateString([], {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Time indicator */}
      <div className="px-5 mb-4">
        <div className="bg-neutral-900 rounded-xl p-3 border border-neutral-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-orange-500" />
            <span className="text-sm text-neutral-300">
              {now.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs text-neutral-600">
              {displayEvents.length} events today
            </span>
          </div>
        </div>
      </div>

      {/* Events */}
      {Object.entries(grouped).map(([dateKey, dateEvents]) => (
        <div key={dateKey} className="px-5 mb-5">
          <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
            {formatDateHeader(dateEvents[0]?.startTime)}
          </h3>

          <div className="space-y-2">
            {dateEvents.map((evt: any, idx: number) => {
              const isPast =
                new Date(evt.endTime || evt.startTime) < now;
              const isNow =
                new Date(evt.startTime) <= now &&
                new Date(evt.endTime || evt.startTime) >= now;

              return (
                <div
                  key={evt.id || idx}
                  className={`bg-neutral-900 rounded-xl p-3.5 border-l-2 ${
                    timeColors[idx % timeColors.length]
                  } border border-neutral-800 ${
                    isPast ? "opacity-50" : ""
                  } ${isNow ? "ring-1 ring-orange-500/30" : ""}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4
                        className={`text-sm font-medium ${
                          isPast ? "text-neutral-500" : "text-neutral-100"
                        }`}
                      >
                        {evt.title}
                      </h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-neutral-500">
                          {formatTime(evt.startTime)}
                          {evt.endTime && ` - ${formatTime(evt.endTime)}`}
                        </span>
                      </div>
                      {evt.location && (
                        <div className="flex items-center gap-1 mt-1">
                          {evt.isVirtual ? (
                            <Video className="h-3 w-3 text-neutral-600" />
                          ) : (
                            <MapPin className="h-3 w-3 text-neutral-600" />
                          )}
                          <span className="text-xs text-neutral-600">
                            {evt.location}
                          </span>
                        </div>
                      )}
                    </div>
                    {isNow && (
                      <span className="text-[10px] text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">
                        NOW
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
        <div className="px-5 py-10 text-center">
          <Calendar className="h-8 w-8 text-neutral-700 mx-auto mb-2" />
          <p className="text-sm text-neutral-500">No events scheduled</p>
        </div>
      )}
    </div>
  );
}
