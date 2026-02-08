"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  PiggyBank,
  CreditCard,
  Landmark,
  ArrowUpRight,
} from "lucide-react";

interface FinancialViewProps {
  data?: any;
}

async function fetchPortfolio() {
  try {
    const resp = await fetch("http://localhost:3000/api/portfolio", {
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error("Failed");
    return resp.json();
  } catch {
    return null;
  }
}

export function FinancialView({ data }: FinancialViewProps) {
  const { data: portfolio } = useQuery({
    queryKey: ["portfolio"],
    queryFn: fetchPortfolio,
  });

  const p = portfolio || data || {};
  const equity = p.equity || 0;
  const netWorth = equity;
  const investmentValue = equity * 0.85;
  const cashValue = equity * 0.15;

  if (!portfolio && !data) {
    return (
      <div className="h-full overflow-auto p-5 space-y-3">
        <div className="skeleton h-44 rounded-2xl" />
        <div className="skeleton h-3 w-full rounded-full" />
        <div className="skeleton h-24 rounded-2xl" />
        <div className="skeleton h-24 rounded-2xl" />
      </div>
    );
  }

  const spendingCategories = [
    { name: "Housing", amount: 2400, percent: 35, color: "bg-orange-500" },
    { name: "Food & Dining", amount: 850, percent: 12, color: "bg-green-500" },
    { name: "Transportation", amount: 450, percent: 7, color: "bg-blue-500" },
    { name: "Entertainment", amount: 300, percent: 4, color: "bg-purple-500" },
    { name: "Utilities", amount: 280, percent: 4, color: "bg-yellow-500" },
    { name: "Other", amount: 520, percent: 8, color: "bg-neutral-500" },
  ];

  return (
    <div className="h-full overflow-auto no-scrollbar">
      {/* Net Worth Hero */}
      <div className="px-6 pt-8 pb-6 gradient-hero">
        <div className="flex items-center gap-2 mb-1.5">
          <DollarSign className="h-4 w-4 text-orange-500" />
          <span className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium">
            Net Worth
          </span>
        </div>
        <div className="text-[42px] font-bold text-white tracking-value leading-none tabular-nums">
          {formatCurrency(netWorth)}
        </div>
        <div className="flex items-center gap-1.5 mt-3">
          <ArrowUpRight className="h-3.5 w-3.5 text-green-400" />
          <span className="text-[13px] font-semibold text-green-400 tabular-nums">
            +2.4%
          </span>
          <span className="text-[11px] text-neutral-600 ml-0.5">
            this month
          </span>
        </div>
      </div>

      {/* Allocation Bar */}
      <div className="px-5 mb-5">
        <div className="h-2 rounded-full overflow-hidden flex bg-[#1a1a1a]">
          <div
            className="bg-green-500 transition-all duration-1000 rounded-l-full"
            style={{ width: "85%" }}
          />
          <div
            className="bg-orange-500 transition-all duration-1000 rounded-r-full"
            style={{ width: "15%" }}
          />
        </div>
        <div className="flex items-center justify-between mt-2.5">
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span className="text-[11px] text-neutral-500">Investments</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            <span className="text-[11px] text-neutral-500">Cash</span>
          </div>
        </div>
      </div>

      {/* Account Cards */}
      <div className="px-5 grid grid-cols-2 gap-2.5 mb-5">
        {[
          {
            icon: TrendingUp,
            label: "Investments",
            value: formatCurrency(investmentValue),
            iconColor: "text-green-400",
            iconBg: "bg-green-500/10",
            valueColor: "text-white",
          },
          {
            icon: PiggyBank,
            label: "Cash",
            value: formatCurrency(cashValue),
            iconColor: "text-orange-400",
            iconBg: "bg-orange-500/10",
            valueColor: "text-white",
          },
          {
            icon: CreditCard,
            label: "Credit Cards",
            value: "-$1,240",
            iconColor: "text-blue-400",
            iconBg: "bg-blue-500/10",
            valueColor: "text-red-400",
          },
          {
            icon: Landmark,
            label: "Savings",
            value: "$8,500",
            iconColor: "text-purple-400",
            iconBg: "bg-purple-500/10",
            valueColor: "text-white",
          },
        ].map((card) => (
          <div key={card.label} className="card-elevated p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <div
                className={`h-8 w-8 rounded-xl ${card.iconBg} flex items-center justify-center`}
              >
                <card.icon className={`h-3.5 w-3.5 ${card.iconColor}`} />
              </div>
              <span className="text-[11px] text-neutral-500 font-medium">
                {card.label}
              </span>
            </div>
            <div
              className={`text-[18px] font-semibold ${card.valueColor} tabular-nums tracking-tight`}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Monthly Spending */}
      <div className="px-5 pb-8">
        <h3 className="text-[11px] text-neutral-500 uppercase tracking-widest font-medium mb-3">
          Monthly Spending
        </h3>
        <div className="card-surface p-4 space-y-3">
          {spendingCategories.map((cat) => (
            <div key={cat.name}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] text-neutral-300 font-medium">
                  {cat.name}
                </span>
                <span className="text-[12px] text-neutral-500 tabular-nums">
                  {formatCurrency(cat.amount)}
                </span>
              </div>
              <div className="h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${cat.color} transition-all duration-1000`}
                  style={{ width: `${cat.percent * 2}%` }}
                />
              </div>
            </div>
          ))}

          {/* Total */}
          <div className="flex items-center justify-between pt-3 border-t border-[#1a1a1a]">
            <span className="text-[13px] text-neutral-400 font-medium">
              Total
            </span>
            <span className="text-[14px] font-semibold text-white tabular-nums">
              {formatCurrency(
                spendingCategories.reduce((sum, c) => sum + c.amount, 0)
              )}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
