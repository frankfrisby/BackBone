"use client";

import { useBackbone } from "@/lib/backbone-context";
import { PortfolioView } from "./portfolio-view";
import { HealthView } from "./health-view";
import { GoalsView } from "./goals-view";
import { TradingView } from "./trading-view";
import { FinancialView } from "./financial-view";
import { CalendarView } from "./calendar-view";
import { TicketView } from "./ticket-view";
import { NewsView } from "./news-view";
import { VideoView } from "./video-view";
import { DocumentView } from "./document-view";
import { SkeletonView } from "./skeleton-view";
import { VapiCallView } from "../call/vapi-call";
import { LayoutGrid } from "lucide-react";

export function ViewContainer() {
  const { state } = useBackbone();
  const { activeTab } = state;

  if (!activeTab) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="h-12 w-12 rounded-2xl bg-[#111] border border-[#1a1a1a] flex items-center justify-center mb-3">
          <LayoutGrid className="h-5 w-5 text-neutral-700" />
        </div>
        <p className="text-[13px] text-neutral-600">
          Your views will appear here
        </p>
        <p className="text-[11px] text-neutral-700 mt-1">
          Ask a question to generate a view
        </p>
      </div>
    );
  }

  const viewType = activeTab.viewType;

  switch (viewType) {
    case "portfolio":
      return <PortfolioView data={activeTab.data} isLive={activeTab.isLive} />;
    case "trading":
      return <TradingView data={activeTab.data} isLive={activeTab.isLive} />;
    case "health":
      return <HealthView data={activeTab.data} />;
    case "goals":
      return <GoalsView data={activeTab.data} />;
    case "financial":
      return <FinancialView data={activeTab.data} />;
    case "calendar":
      return <CalendarView data={activeTab.data} />;
    case "ticket":
      return <TicketView data={activeTab.data} />;
    case "news":
      return <NewsView data={activeTab.data} />;
    case "video":
      return <VideoView data={activeTab.data} />;
    case "document":
      return <DocumentView data={activeTab.data} />;
    case "call":
      return <VapiCallView />;
    default:
      return <SkeletonView title={activeTab.title} viewType={viewType || "unknown"} />;
  }
}
