import fetch from "node-fetch";

/**
 * Wealth Management Integration Service for BACKBONE
 * Supports Fidelity, Robinhood, Personal Capital (Empower), Schwab, Vanguard
 */

export const getWealthConfig = () => {
  return {
    // Robinhood (unofficial API - requires auth token)
    robinhood: {
      authToken: process.env.ROBINHOOD_AUTH_TOKEN,
      deviceToken: process.env.ROBINHOOD_DEVICE_TOKEN,
      ready: Boolean(process.env.ROBINHOOD_AUTH_TOKEN)
    },
    // Personal Capital / Empower API
    personalCapital: {
      apiKey: process.env.PERSONAL_CAPITAL_API_KEY,
      sessionId: process.env.PERSONAL_CAPITAL_SESSION,
      ready: Boolean(process.env.PERSONAL_CAPITAL_SESSION)
    },
    // Plaid integration (connects to multiple banks/brokerages)
    plaid: {
      clientId: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_SECRET,
      accessToken: process.env.PLAID_ACCESS_TOKEN,
      ready: Boolean(process.env.PLAID_ACCESS_TOKEN)
    },
    // Fidelity (via Plaid or manual)
    fidelity: {
      accessToken: process.env.FIDELITY_ACCESS_TOKEN,
      ready: Boolean(process.env.FIDELITY_ACCESS_TOKEN)
    },
    // Primary wealth provider
    primaryProvider: process.env.WEALTH_PRIMARY_PROVIDER || "plaid",
    ready: Boolean(
      process.env.ROBINHOOD_AUTH_TOKEN ||
      process.env.PERSONAL_CAPITAL_SESSION ||
      process.env.PLAID_ACCESS_TOKEN ||
      process.env.FIDELITY_ACCESS_TOKEN
    )
  };
};

/**
 * Wealth provider definitions
 */
export const WEALTH_PROVIDERS = {
  robinhood: {
    name: "Robinhood",
    icon: "\u{1F4C8}",
    color: "#00c805",
    connectUrl: "https://robinhood.com",
    description: "Commission-free stock & crypto trading"
  },
  personalCapital: {
    name: "Personal Capital / Empower",
    icon: "\u{1F4B0}",
    color: "#0066cc",
    connectUrl: "https://www.empower.com",
    description: "Full portfolio aggregation & net worth tracking"
  },
  fidelity: {
    name: "Fidelity",
    icon: "\u{1F3E6}",
    color: "#4a8f3c",
    connectUrl: "https://www.fidelity.com",
    description: "Investment accounts, 401k, IRAs"
  },
  plaid: {
    name: "Plaid",
    icon: "\u{1F517}",
    color: "#0a85ea",
    connectUrl: "https://plaid.com",
    description: "Connect multiple financial accounts"
  },
  schwab: {
    name: "Charles Schwab",
    icon: "\u{1F4CA}",
    color: "#00a0df",
    connectUrl: "https://www.schwab.com",
    description: "Brokerage & retirement accounts"
  },
  vanguard: {
    name: "Vanguard",
    icon: "\u{1F3AF}",
    color: "#c70000",
    connectUrl: "https://www.vanguard.com",
    description: "Index funds & retirement accounts"
  }
};

/**
 * Fetch Robinhood portfolio
 */
export const fetchRobinhoodPortfolio = async (config) => {
  if (!config.robinhood.ready) return null;

  try {
    const response = await fetch("https://api.robinhood.com/portfolios/", {
      headers: {
        Authorization: `Bearer ${config.robinhood.authToken}`,
        "User-Agent": "BACKBONE/2.0"
      }
    });

    if (!response.ok) {
      throw new Error(`Robinhood API error: ${response.status}`);
    }

    const data = await response.json();
    const portfolio = data.results?.[0];

    if (!portfolio) return null;

    return {
      provider: "robinhood",
      equity: parseFloat(portfolio.equity) || 0,
      extendedHoursEquity: parseFloat(portfolio.extended_hours_equity) || 0,
      marketValue: parseFloat(portfolio.market_value) || 0,
      lastCoreEquity: parseFloat(portfolio.last_core_equity) || 0,
      excess_margin: parseFloat(portfolio.excess_margin) || 0,
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error("Robinhood fetch failed:", error.message);
    return null;
  }
};

/**
 * Fetch Robinhood positions
 */
export const fetchRobinhoodPositions = async (config) => {
  if (!config.robinhood.ready) return [];

  try {
    const response = await fetch("https://api.robinhood.com/positions/?nonzero=true", {
      headers: {
        Authorization: `Bearer ${config.robinhood.authToken}`,
        "User-Agent": "BACKBONE/2.0"
      }
    });

    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error("Robinhood positions fetch failed:", error.message);
    return [];
  }
};

/**
 * Fetch Personal Capital / Empower accounts
 */
export const fetchPersonalCapitalAccounts = async (config) => {
  if (!config.personalCapital.ready) return null;

  try {
    const response = await fetch("https://home.personalcapital.com/api/newaccount/getAccounts2", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `CSRF=${config.personalCapital.sessionId}`
      },
      body: `csrf=${config.personalCapital.sessionId}&apiClient=WEB`
    });

    const data = await response.json();
    return data.spData?.accounts || [];
  } catch (error) {
    console.error("Personal Capital fetch failed:", error.message);
    return null;
  }
};

/**
 * Fetch Plaid accounts & balances
 */
export const fetchPlaidAccounts = async (config) => {
  if (!config.plaid.ready) return null;

  try {
    const response = await fetch("https://production.plaid.com/accounts/balance/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.plaid.clientId,
        secret: config.plaid.secret,
        access_token: config.plaid.accessToken
      })
    });

    const data = await response.json();
    return data.accounts || [];
  } catch (error) {
    console.error("Plaid fetch failed:", error.message);
    return null;
  }
};

/**
 * Fetch Plaid investment holdings
 */
export const fetchPlaidHoldings = async (config) => {
  if (!config.plaid.ready) return null;

  try {
    const response = await fetch("https://production.plaid.com/investments/holdings/get", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: config.plaid.clientId,
        secret: config.plaid.secret,
        access_token: config.plaid.accessToken
      })
    });

    const data = await response.json();
    return {
      accounts: data.accounts || [],
      holdings: data.holdings || [],
      securities: data.securities || []
    };
  } catch (error) {
    console.error("Plaid holdings fetch failed:", error.message);
    return null;
  }
};

/**
 * Build comprehensive wealth summary
 */
export const buildWealthSummary = async (config) => {
  if (!config.ready) {
    return {
      connected: false,
      totalNetWorth: null,
      accounts: [],
      providers: []
    };
  }

  const summary = {
    connected: true,
    totalNetWorth: 0,
    investmentValue: 0,
    cashValue: 0,
    retirementValue: 0,
    accounts: [],
    providers: [],
    lastUpdated: new Date().toISOString()
  };

  // Fetch from all connected providers
  if (config.robinhood.ready) {
    const portfolio = await fetchRobinhoodPortfolio(config);
    if (portfolio) {
      summary.providers.push("robinhood");
      summary.investmentValue += portfolio.equity;
      summary.totalNetWorth += portfolio.equity;
      summary.accounts.push({
        provider: "Robinhood",
        type: "brokerage",
        balance: portfolio.equity,
        marketValue: portfolio.marketValue
      });
    }
  }

  if (config.plaid.ready) {
    const accounts = await fetchPlaidAccounts(config);
    const holdings = await fetchPlaidHoldings(config);

    if (accounts) {
      summary.providers.push("plaid");
      accounts.forEach((account) => {
        const balance = account.balances?.current || 0;
        summary.totalNetWorth += balance;

        if (account.type === "investment") {
          summary.investmentValue += balance;
        } else if (account.type === "depository") {
          summary.cashValue += balance;
        }

        summary.accounts.push({
          provider: account.name,
          type: account.type,
          subtype: account.subtype,
          balance: balance,
          mask: account.mask
        });
      });
    }
  }

  if (config.personalCapital.ready) {
    const accounts = await fetchPersonalCapitalAccounts(config);
    if (accounts) {
      summary.providers.push("personalCapital");
      accounts.forEach((account) => {
        const balance = account.balance || 0;
        summary.totalNetWorth += balance;

        if (account.isOnUs && account.accountType === "INVESTMENT") {
          summary.investmentValue += balance;
        } else if (account.accountType === "BANK") {
          summary.cashValue += balance;
        } else if (account.is401k || account.isIRA) {
          summary.retirementValue += balance;
        }

        summary.accounts.push({
          provider: account.firmName,
          type: account.accountType,
          name: account.name,
          balance: balance
        });
      });
    }
  }

  return summary;
};

/**
 * Get connection prompts for wealth providers
 */
export const getWealthConnectionPrompts = (config) => {
  const prompts = [];

  if (!config.plaid.ready) {
    prompts.push({
      provider: "Plaid",
      envVars: ["PLAID_CLIENT_ID", "PLAID_SECRET", "PLAID_ACCESS_TOKEN"],
      message: "Connect Plaid to aggregate all your financial accounts",
      priority: 1
    });
  }

  if (!config.robinhood.ready) {
    prompts.push({
      provider: "Robinhood",
      envVars: ["ROBINHOOD_AUTH_TOKEN"],
      message: "Connect Robinhood for stock trading data",
      priority: 2
    });
  }

  if (!config.personalCapital.ready) {
    prompts.push({
      provider: "Personal Capital",
      envVars: ["PERSONAL_CAPITAL_SESSION"],
      message: "Connect Personal Capital for net worth tracking",
      priority: 3
    });
  }

  return prompts.sort((a, b) => a.priority - b.priority);
};
