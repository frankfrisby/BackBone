"use client";

import { useBackbone } from "@/lib/backbone-context";
import { PortfolioView } from "./portfolio-view";
import { HealthView } from "./health-view";
import { GoalsView } from "./goals-view";
import { TradingView } from "./trading-view";
import { FinancialView } from "./financial-view";
import { CalendarView } from "./calendar-view";
import { TicketView } from "./ticket-view";
import { SkeletonView } from "./skeleton-view";
import { VapiCallView } from "../call/vapi-call";
import { LayoutGrid } from "lucide-react";

export function ViewContainer() {
  const { state } = useBackbone();
  const { activeTab } = state;

  if (!activeTab) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-neutral-600">
        <LayoutGrid className="h-8 w-8 mb-3 text-neutral-700" />
        <p className="text-sm">Your views will appear here</p>
        <p className="text-xs text-neutral-700 mt-1">
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
    case "call":
      return <VapiCallView />;
    default:
      return <SkeletonView title={activeTab.title} viewType={viewType || "unknown"} />;
  }
}
