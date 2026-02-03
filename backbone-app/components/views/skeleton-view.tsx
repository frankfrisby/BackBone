"use client";

interface SkeletonViewProps {
  title: string;
  viewType: string;
}

export function SkeletonView({ title, viewType }: SkeletonViewProps) {
  return (
    <div className="h-full flex flex-col p-5 animate-fade-in">
      {/* Header skeleton */}
      <div className="mb-6">
        <div className="skeleton h-4 w-24 mb-3" />
        <div className="skeleton h-10 w-48" />
      </div>

      {/* Content skeleton varies by type */}
      <div className="space-y-3 flex-1">
        <div className="skeleton h-32 w-full" />
        <div className="grid grid-cols-2 gap-2.5">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-16 w-full" />
      </div>

      {/* Loading indicator */}
      <div className="flex items-center justify-center gap-2.5 py-4">
        <div className="flex gap-1.5">
          <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
          <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
          <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
        </div>
        <span className="text-[11px] text-neutral-600">
          Building {title} view
        </span>
      </div>
    </div>
  );
}
