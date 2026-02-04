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
import { DashboardView } from "../dashboard/dashboard-view";
import { BriefView } from "./brief-view";
import { LayoutGrid } from "lucide-react";

export function ViewContainer() {
  const { state } = useBackbone();
  const { activeTab } = state;

  if (!activeTab) {
    // Default to dashboard view when no active tab
    return <DashboardView />;
  }

  const viewType = activeTab.viewType;

  switch (viewType) {
    case "dashboard":
      return <DashboardView />;
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
    case "brief":
      return <BriefView />;
    default:
      return <SkeletonView title={activeTab.title} viewType={viewType || "unknown"} />;
  }
}
