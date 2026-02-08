"use client";

import { useQuery } from "@tanstack/react-query";
import { Play, Eye, Clock, Youtube } from "lucide-react";

interface VideoViewProps {
  data?: any;
}

interface VideoItem {
  videoId: string;
  title: string;
  channel: string;
  channelUrl?: string;
  viewCount?: string | number;
  duration?: string;
  thumbnail?: string;
  publishedAt?: string;
}

async function fetchVideos(): Promise<VideoItem[]> {
  try {
    const resp = await fetch("http://localhost:3000/api/videos", {
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) throw new Error("Failed");
    const data = await resp.json();
    return data.videos || data || [];
  } catch {
    return [];
  }
}

function formatViewCount(count: string | number | undefined): string {
  if (!count) return "";
  const num = typeof count === "string" ? parseInt(count, 10) : count;
  if (isNaN(num)) return String(count);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M views`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K views`;
  return `${num} views`;
}

function getThumbnail(video: VideoItem): string {
  if (video.thumbnail) return video.thumbnail;
  if (video.videoId) return `https://i.ytimg.com/vi/${video.videoId}/mqdefault.jpg`;
  return "";
}

export function VideoView({ data }: VideoViewProps) {
  const { data: videos } = useQuery({
    queryKey: ["videos"],
    queryFn: fetchVideos,
  });

  const items: VideoItem[] = videos || data?.videos || (Array.isArray(data) ? data : []);

  if (items.length === 0) {
    return (
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="skeleton h-48 rounded-2xl" />
        <div className="flex items-center justify-center gap-2 py-4">
          <div className="flex gap-1.5">
            <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
            <div className="w-1.5 h-1.5 bg-neutral-600 rounded-full typing-dot" />
          </div>
          <span className="text-[11px] text-neutral-600">Loading videos</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Header */}
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <Youtube className="h-4 w-4 text-red-500" />
          <h2 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium">
            Videos
          </h2>
        </div>
        <p className="text-[13px] text-neutral-600">
          Curated content from your interests
        </p>
      </div>

      {/* Video cards */}
      <div className="px-5 pb-8 space-y-3">
        {items.map((video, i) => {
          const thumb = getThumbnail(video);
          return (
            <div
              key={video.videoId || i}
              className="card-interactive overflow-hidden animate-fade-up"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              {/* Thumbnail */}
              <div className="relative aspect-video bg-[#0a0a0a]">
                {thumb && (
                  <img
                    src={thumb}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                )}
                {/* Play overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 hover:opacity-100 transition-opacity">
                  <div className="h-12 w-12 rounded-full bg-white/90 flex items-center justify-center">
                    <Play className="h-5 w-5 text-black ml-0.5" />
                  </div>
                </div>
                {/* Duration badge */}
                {video.duration && (
                  <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-white font-mono tabular-nums">
                    {video.duration}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="px-4 py-3">
                <h3 className="text-[13px] font-medium text-neutral-200 leading-snug mb-1.5 line-clamp-2">
                  {video.title}
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-neutral-500 font-medium">
                    {video.channel}
                  </span>
                  {video.viewCount && (
                    <span className="text-[10px] text-neutral-600 flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      {formatViewCount(video.viewCount)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
