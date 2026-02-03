"use client";

import { useQuery } from "@tanstack/react-query";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
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

  // Empower/Personal Capital style sections
  const netWorth = equity;
  const investmentValue = equity * 0.85;
  const cashValue = equity * 0.15;

  // Mock spending categories for the Empower-style breakdown
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
      <div className="px-5 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <DollarSign className="h-5 w-5 text-orange-500" />
          <span className="text-xs text-neutral-500 uppercase tracking-wide">
            Net Worth
          </span>
        </div>
        <div className="text-4xl font-bold text-neutral-100 tracking-tight">
          {formatCurrency(netWorth)}
        </div>
        <div className="flex items-center gap-1 mt-1 text-sm text-green-500">
          <ArrowUpRight className="h-3.5 w-3.5" />
          <span>+2.4% this month</span>
        </div>
      </div>

      {/* Net Worth Breakdown Bar */}
      <div className="px-5 mb-5">
        <div className="h-3 rounded-full overflow-hidden flex bg-neutral-800">
          <div
            className="bg-green-500 transition-all duration-1000"
            style={{ width: "85%" }}
          />
          <div
            className="bg-orange-500 transition-all duration-1000"
            style={{ width: "15%" }}
          />
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-neutral-400">Investments</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-xs text-neutral-400">Cash</span>
          </div>
        </div>
      </div>

      {/* Account Cards */}
      <div className="px-5 grid grid-cols-2 gap-3 mb-5">
        <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-green-500/10 flex items-center justify-center">
              <TrendingUp className="h-3.5 w-3.5 text-green-500" />
            </div>
            <span className="text-xs text-neutral-500">Investments</span>
          </div>
          <div className="text-lg font-semibold text-neutral-100">
            {formatCurrency(investmentValue)}
          </div>
        </div>

        <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <PiggyBank className="h-3.5 w-3.5 text-orange-500" />
            </div>
            <span className="text-xs text-neutral-500">Cash</span>
          </div>
          <div className="text-lg font-semibold text-neutral-100">
            {formatCurrency(cashValue)}
          </div>
        </div>

        <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <CreditCard className="h-3.5 w-3.5 text-blue-500" />
            </div>
            <span className="text-xs text-neutral-500">Credit Cards</span>
          </div>
          <div className="text-lg font-semibold text-red-500">
            -$1,240
          </div>
        </div>

        <div className="bg-neutral-900 rounded-xl p-3.5 border border-neutral-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Landmark className="h-3.5 w-3.5 text-purple-500" />
            </div>
            <span className="text-xs text-neutral-500">Savings</span>
          </div>
          <div className="text-lg font-semibold text-neutral-100">
            $8,500
          </div>
        </div>
      </div>

      {/* Monthly Spending */}
      <div className="px-5 pb-6">
        <h3 className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
          Monthly Spending
        </h3>
        <div className="space-y-2.5">
          {spendingCategories.map((cat) => (
            <div key={cat.name} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-neutral-300">{cat.name}</span>
                  <span className="text-xs text-neutral-400">
                    {formatCurrency(cat.amount)}
                  </span>
                </div>
                <div className="h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cat.color} transition-all duration-1000`}
                    style={{ width: `${cat.percent * 2}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-800">
          <span className="text-sm text-neutral-300">Total Spending</span>
          <span className="text-sm font-semibold text-neutral-100">
            {formatCurrency(
              spendingCategories.reduce((sum, c) => sum + c.amount, 0)
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
