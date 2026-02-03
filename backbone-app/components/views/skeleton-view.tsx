"use client";

import {
  Calendar,
  DollarSign,
  Ticket,
  Loader2,
} from "lucide-react";

interface SkeletonViewProps {
  title: string;
  viewType: string;
}

export function SkeletonView({ title, viewType }: SkeletonViewProps) {
  const icons: Record<string, React.ReactNode> = {
    calendar: <Calendar className="h-6 w-6 text-neutral-600" />,
    financial: <DollarSign className="h-6 w-6 text-neutral-600" />,
    ticket: <Ticket className="h-6 w-6 text-neutral-600" />,
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header skeleton */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-4">
          {icons[viewType] || <Loader2 className="h-5 w-5 text-neutral-600 animate-spin" />}
          <h2 className="text-lg font-semibold text-neutral-300">{title}</h2>
        </div>
        <p className="text-xs text-neutral-600">
          Generating view...
        </p>
      </div>

      {/* Skeleton content */}
      <div className="px-5 space-y-4 flex-1">
        {/* Hero card skeleton */}
        <div className="skeleton h-36 rounded-2xl" />

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="skeleton h-20 rounded-xl" />
          <div className="skeleton h-20 rounded-xl" />
        </div>

        {/* List items */}
        <div className="space-y-2">
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-16 rounded-xl" />
        </div>
      </div>

      {/* Building indicator */}
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 justify-center">
          <Loader2 className="h-3.5 w-3.5 text-orange-500 animate-spin" />
          <span className="text-xs text-neutral-500">
            Building {title.toLowerCase()} view...
          </span>
        </div>
      </div>
    </div>
  );
}
