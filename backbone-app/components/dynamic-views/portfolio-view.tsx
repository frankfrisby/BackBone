"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { backboneApi } from "@/lib/api/backbone";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export function PortfolioView() {
  const { data: portfolio, isLoading: portfolioLoading } = useQuery({
    queryKey: ["portfolio"],
    queryFn: backboneApi.getPortfolio,
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const { data: positions, isLoading: positionsLoading } = useQuery({
    queryKey: ["positions"],
    queryFn: backboneApi.getPositions,
    refetchInterval: 30000,
  });

  if (portfolioLoading || positionsLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-400">Loading portfolio...</div>
      </div>
    );
  }

  if (!portfolio || !positions) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-slate-400">No portfolio data available</div>
      </div>
    );
  }

  const totalPLColor = portfolio.totalPL >= 0 ? "text-green-500" : "text-red-500";

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      {/* Portfolio Summary */}
      <Card className="bg-slate-900 border-slate-700">
        <CardHeader>
          <CardTitle className="text-slate-100">Portfolio Value</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-4xl font-bold text-slate-100">
              {formatCurrency(portfolio.equity)}
            </div>
            <div className={`text-lg font-semibold flex items-center gap-2 ${totalPLColor}`}>
              {portfolio.totalPL >= 0 ? (
                <TrendingUp className="h-5 w-5" />
              ) : (
                <TrendingDown className="h-5 w-5" />
              )}
              {formatCurrency(portfolio.totalPL)} ({formatPercentage(portfolio.totalPLPercent)})
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-700">
            <div>
              <div className="text-sm text-slate-400">Day P/L</div>
              <div className={`text-lg font-semibold ${portfolio.dayPL >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(portfolio.dayPL)}
              </div>
              <div className={`text-sm ${portfolio.dayPLPercent >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatPercentage(portfolio.dayPLPercent)}
              </div>
            </div>
            <div>
              <div className="text-sm text-slate-400">Buying Power</div>
              <div className="text-lg font-semibold text-slate-100">
                {formatCurrency(portfolio.buyingPower)}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Holdings */}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold text-slate-100">Holdings</h2>
        {positions.length === 0 ? (
          <Card className="bg-slate-900 border-slate-700">
            <CardContent className="p-6 text-center text-slate-400">
              No positions yet. Start investing!
            </CardContent>
          </Card>
        ) : (
          positions.map((position) => {
            const plColor = position.unrealizedPL >= 0 ? "text-green-500" : "text-red-500";
            return (
              <Card key={position.symbol} className="bg-slate-900 border-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-lg font-bold text-slate-100">
                        {position.symbol}
                      </div>
                      <div className="text-sm text-slate-400">
                        {position.qty} shares @ {formatCurrency(position.avgEntryPrice)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-slate-100">
                        {formatCurrency(position.currentPrice)}
                      </div>
                      <div className={`text-sm font-semibold ${plColor}`}>
                        {formatPercentage(position.unrealizedPLPercent)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                    <div>
                      <div className="text-sm text-slate-400">Market Value</div>
                      <div className="text-base font-semibold text-slate-100">
                        {formatCurrency(position.marketValue)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-400">Unrealized P/L</div>
                      <div className={`text-base font-semibold ${plColor}`}>
                        {formatCurrency(position.unrealizedPL)}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="outline"
                      className="flex-1 border-green-600 text-green-500 hover:bg-green-600 hover:text-white"
                      onClick={() => {
                        // Handle buy
                        console.log("Buy", position.symbol);
                      }}
                    >
                      Buy
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 border-red-600 text-red-500 hover:bg-red-600 hover:text-white"
                      onClick={() => {
                        // Handle sell
                        console.log("Sell", position.symbol);
                      }}
                    >
                      Sell
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
