/**
 * Portfolio Data for BACKBONE
 * Supports real Alpaca data with market value and PnL calculations
 */

const randomBetween = (min, max) => min + Math.random() * (max - min);

const formatMoney = (value) => {
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `$${formatted}`;
};

const parseNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const BASE_POSITIONS = [
  { symbol: "NVDA", basePrice: 872.4 },
  { symbol: "AAPL", basePrice: 188.11 },
  { symbol: "TSLA", basePrice: 256.92 },
  { symbol: "AMZN", basePrice: 159.03 },
  { symbol: "MSFT", basePrice: 416.52 }
];

/**
 * Build empty portfolio state - for when not connected
 */
export const buildEmptyPortfolio = () => ({
  mode: "Not connected",
  status: "Not connected",
  equity: "--",
  cash: "--",
  invested: "--",
  buyingPower: "--",
  dayChange: 0,
  totalChange: 0,
  dayChangeDollar: "--",
  totalChangeDollar: "--",
  positions: [],
  lastUpdated: "--:--:--"
});

/**
 * Build mock portfolio - only for development/testing
 * In production, returns empty portfolio to prompt connection
 */
export const buildMockPortfolio = () => {
  const equity = randomBetween(124000, 132500);
  const cash = randomBetween(28000, 42000);
  const invested = Math.max(0, equity - cash);
  const buyingPower = cash * randomBetween(1.6, 2.4);
  const dayChange = randomBetween(-1.8, 2.5);
  const totalChange = randomBetween(-6.5, 9.2);

  const positions = BASE_POSITIONS.map((position) => {
    const shares = Math.round(randomBetween(12, 90));
    const avgPrice = position.basePrice * randomBetween(0.92, 1.04);
    const lastPrice = position.basePrice * randomBetween(0.9, 1.08);
    const change = ((lastPrice - avgPrice) / avgPrice) * 100;
    const marketValue = shares * lastPrice;
    const costBasis = shares * avgPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    return {
      symbol: position.symbol,
      shares,
      avgPrice: formatMoney(avgPrice),
      lastPrice: formatMoney(lastPrice),
      marketValue,
      marketValueFormatted: formatMoney(marketValue),
      costBasis,
      pnl,
      pnlFormatted: formatMoney(pnl),
      pnlPercent,
      change,
      todayChange: randomBetween(-3, 3)
    };
  });

  const dayChangeDollar = (equity * dayChange) / 100;
  const totalChangeDollar = (equity * totalChange) / 100;

  return {
    mode: "Paper",
    status: "Not connected",
    equity: formatMoney(equity),
    cash: formatMoney(cash),
    invested: formatMoney(invested),
    buyingPower: formatMoney(buyingPower),
    dayChange,
    totalChange,
    dayChangeDollar: formatMoney(dayChangeDollar),
    totalChangeDollar: formatMoney(totalChangeDollar),
    positions,
    lastUpdated: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }),
    isMock: true
  };
};

/**
 * Build portfolio from Alpaca API data
 * Includes market value and detailed PnL calculations
 */
export const buildPortfolioFromAlpaca = (account, positions) => {
  const equity = parseNumber(account.equity);
  const cash = parseNumber(account.cash);
  const buyingPower = parseNumber(account.buying_power);
  const lastEquity = parseNumber(account.last_equity || account.equity);
  const invested = Math.max(0, equity - cash);

  const dayChange = lastEquity ? ((equity - lastEquity) / lastEquity) * 100 : 0;
  const totalChange =
    parseNumber(account.equity) && parseNumber(account.last_equity)
      ? ((parseNumber(account.equity) - parseNumber(account.last_equity)) /
          parseNumber(account.last_equity)) *
        100
      : 0;

  const formatPosition = (position) => {
    const avgPrice = parseNumber(position.avg_entry_price);
    const lastPrice = parseNumber(position.current_price);
    const shares = parseNumber(position.qty);
    const change = avgPrice ? ((lastPrice - avgPrice) / avgPrice) * 100 : 0;

    // Calculate market value and PnL
    const marketValue = shares * lastPrice;
    const costBasis = shares * avgPrice;
    const pnl = marketValue - costBasis;
    const pnlPercent = costBasis > 0 ? (pnl / costBasis) * 100 : 0;

    // Get today's change from position data
    // Use unrealized_intraday_plpc directly from Alpaca (already a percentage as decimal)
    // On weekends/holidays when market is closed, this will be 0 (correct behavior)
    const unrealizedPLToday = parseNumber(position.unrealized_intraday_pl);
    const unrealizedPLPCToday = parseNumber(position.unrealized_intraday_plpc);
    // unrealized_intraday_plpc is a decimal (e.g., 0.0123 = 1.23%), so multiply by 100
    const todayChange = unrealizedPLPCToday * 100;

    // Also get total unrealized P/L percent from Alpaca directly
    const unrealizedPlpc = parseNumber(position.unrealized_plpc);

    return {
      symbol: position.symbol,
      shares,
      avgPrice: formatMoney(avgPrice),
      lastPrice: formatMoney(lastPrice),
      marketValue,
      marketValueFormatted: formatMoney(marketValue),
      costBasis,
      pnl,
      pnlFormatted: formatMoney(pnl),
      pnlPercent,
      // unrealizedPlPercent from Alpaca (decimal * 100 for percentage display)
      unrealizedPlPercent: unrealizedPlpc * 100,
      change,
      todayChange,
      todayPnl: unrealizedPLToday,
      todayPnlFormatted: formatMoney(unrealizedPLToday)
    };
  };

  // Determine mode - live accounts don't return trading_environment
  const mode = account.trading_environment || (account.account_number ? "Live" : "Paper");

  // Filter out CVR (Contingent Value Rights) - they don't count as real positions
  const filteredPositions = positions.filter(p => !p.symbol.includes("CVR"));

  return {
    mode,
    status: "Live",
    equity: formatMoney(equity),
    cash: formatMoney(cash),
    invested: formatMoney(invested),
    buyingPower: formatMoney(buyingPower),
    dayChange,
    totalChange,
    dayChangeDollar: formatMoney((equity * dayChange) / 100),
    totalChangeDollar: formatMoney((equity * totalChange) / 100),
    positions: filteredPositions.map(formatPosition),
    lastUpdated: new Date().toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }),
    isMock: false
  };
};

/**
 * Calculate portfolio metrics for analysis
 */
export const calculatePortfolioMetrics = (portfolio) => {
  if (!portfolio || portfolio.positions.length === 0) {
    return null;
  }

  const totalMarketValue = portfolio.positions.reduce((sum, p) => sum + (p.marketValue || 0), 0);
  const totalCostBasis = portfolio.positions.reduce((sum, p) => sum + (p.costBasis || 0), 0);
  const totalPnl = totalMarketValue - totalCostBasis;
  const totalPnlPercent = totalCostBasis > 0 ? (totalPnl / totalCostBasis) * 100 : 0;

  // Position concentration
  const concentration = portfolio.positions.map((p) => ({
    symbol: p.symbol,
    weight: totalMarketValue > 0 ? (p.marketValue / totalMarketValue) * 100 : 0
  }));

  // Largest position
  const largestPosition = portfolio.positions.reduce(
    (max, p) => (p.marketValue > (max.marketValue || 0) ? p : max),
    {}
  );

  return {
    totalMarketValue,
    totalCostBasis,
    totalPnl,
    totalPnlPercent,
    concentration,
    largestPosition: largestPosition.symbol,
    largestPositionWeight:
      totalMarketValue > 0 ? (largestPosition.marketValue / totalMarketValue) * 100 : 0,
    positionCount: portfolio.positions.length
  };
};
