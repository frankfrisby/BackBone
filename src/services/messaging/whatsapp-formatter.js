/**
 * WhatsApp Message Formatter
 *
 * Converts standard markdown and data into beautiful WhatsApp-native formatting.
 *
 * WhatsApp formatting reference:
 *   *bold*          — bold text
 *   _italic_        — italic text
 *   ~strikethrough~ — strikethrough
 *   ```code```      — monospace/code
 *   > quote         — blockquote (single line)
 *   - bullet        — bullet point (standard dash)
 *   1. numbered     — numbered list
 *
 * WhatsApp limits:
 *   - Max message length: ~65,536 chars (keep under 4096 for readability)
 *   - No inline images in text (use mediaUrl separately)
 *   - No clickable link labels — raw URLs auto-link
 */

// ── Section emoji map for visual headers ──────────────────────────

const SECTION_EMOJI = {
  portfolio: "📊",
  market: "📈",
  trading: "📈",
  health: "🏥",
  sleep: "😴",
  readiness: "⚡",
  activity: "🏃",
  goals: "🎯",
  calendar: "📅",
  signal: "📡",
  trade: "💹",
  news: "📰",
  alert: "⚠️",
  summary: "📋",
  recommendation: "💡",
  weather: "🌤",
};

/**
 * Convert standard markdown to WhatsApp-native format.
 * Handles headers, bold, italic, code, links, lists, and dividers.
 */
export function markdownToWhatsApp(md) {
  if (!md || typeof md !== "string") return "";

  let text = md;

  // ── Strip markdown headers → just bold text ──
  // WhatsApp has NO header syntax — # ## ### are meaningless raw characters
  // # H1 → *TITLE* (bold, uppercased)
  text = text.replace(/^#\s+(.+)$/gm, (_, title) => `*${title.trim().toUpperCase()}*`);
  // ## H2 → *Title* (bold)
  text = text.replace(/^##\s+(.+)$/gm, (_, title) => `*${title.trim()}*`);
  // ### H3+ → *Title* (bold)
  text = text.replace(/^#{3,6}\s+(.+)$/gm, (_, title) => `*${title.trim()}*`);
  // Catch any remaining bare # at line start (no space variant)
  text = text.replace(/^#{1,6}([A-Za-z])/gm, "*$1");

  // ── Bold: **text** or __text__ → *text* ──
  text = text.replace(/\*\*(.+?)\*\*/g, "*$1*");
  text = text.replace(/__(.+?)__/g, "*$1*");

  // ── Strikethrough: ~~text~~ → ~text~ ──
  text = text.replace(/~~(.+?)~~/g, "~$1~");

  // ── Inline code: `code` → ```code``` ──
  text = text.replace(/(?<!`)`([^`\n]+)`(?!`)/g, "```$1```");

  // ── Code blocks: keep ```...``` as-is (WhatsApp supports them) ──
  // Already compatible — no change needed

  // ── Links: [text](url) → text: url ──
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1: $2");

  // ── Images: ![alt](url) → 🖼 alt: url ──
  text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "🖼 $1: $2");

  // ── Horizontal rules → clean divider ──
  text = text.replace(/^[-*_]{3,}$/gm, "─────────────────");

  // ── Blockquotes: > text → ❝ _text_ ──
  text = text.replace(/^>\s*(.+)$/gm, "❝ _$1_");

  // ── Bullet lists: - item → • item ──
  text = text.replace(/^[-*]\s+/gm, "• ");

  // ── Nested bullets: indent + - item → ◦ item ──
  text = text.replace(/^\s{2,}[-*]\s+/gm, "  ◦ ");

  // ── Clean up excessive newlines (max 2) ──
  text = text.replace(/\n{4,}/g, "\n\n\n");

  // ── Trim trailing whitespace per line ──
  text = text.replace(/[ \t]+$/gm, "");

  return text.trim();
}

/**
 * Format an AI response for WhatsApp delivery.
 * Adds visual structure: header, formatted body, footer.
 */
export function formatAIResponse(text, options = {}) {
  if (!text) return "";

  const { source = "cli", includeFooter = true } = options;

  // Convert markdown to WhatsApp format
  let formatted = markdownToWhatsApp(text);

  // Add BACKBONE header
  const header = "🦴 *BACKBONE*";

  // Add subtle footer
  const footer = includeFooter
    ? `\n\n_— ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}_`
    : "";

  return `${header}\n\n${formatted}${footer}`;
}

/**
 * Format a number with sign prefix
 */
function signedNum(n, decimals = 2) {
  if (typeof n !== "number" || isNaN(n)) return "?";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(decimals)}`;
}

/**
 * Format currency
 */
function currency(n) {
  if (typeof n !== "number" || isNaN(n)) return "$?";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Format a text progress bar
 */
function progressBar(percent, width = 10) {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return "▓".repeat(filled) + "░".repeat(empty);
}

// ── Structured Data Formatters ──────────────────────────────────

/**
 * Format a portfolio update for WhatsApp
 */
export function formatPortfolioUpdate(portfolio) {
  if (!portfolio) return "📊 _Portfolio data unavailable_";

  const { equity, cash, positions, dayPL, dayPLPercent } = portfolio;

  let msg = `📊 *Portfolio Update*\n─────────────────\n`;
  msg += `💰 *Equity:* ${currency(parseFloat(equity) || 0)}\n`;
  if (cash) msg += `🏦 *Cash:* ${currency(parseFloat(cash) || 0)}\n`;
  if (typeof dayPL === "number") {
    const emoji = dayPL >= 0 ? "🟢" : "🔴";
    msg += `${emoji} *Day P&L:* ${signedNum(dayPL)}`;
    if (typeof dayPLPercent === "number") msg += ` (${signedNum(dayPLPercent)}%)`;
    msg += "\n";
  }

  if (positions && Array.isArray(positions) && positions.length > 0) {
    msg += `\n*Positions:*\n`;
    for (const p of positions.slice(0, 8)) {
      const pl = parseFloat(p.unrealized_pl || p.pl || 0);
      const emoji = pl >= 0 ? "↗" : "↘";
      const plStr = pl >= 0 ? `+${pl.toFixed(2)}` : pl.toFixed(2);
      msg += `  ${emoji} *${p.symbol}* × ${p.qty} → ${currency(parseFloat(p.market_value || p.value || 0))} _(${plStr})_\n`;
    }
  }

  return msg.trim();
}

/**
 * Format health data for WhatsApp
 */
export function formatHealthUpdate(health) {
  if (!health) return "🏥 _Health data unavailable_";

  let msg = `🏥 *Health Update*\n─────────────────\n`;
  if (health.sleep) msg += `😴 *Sleep:* ${health.sleep}/100 ${scoreEmoji(health.sleep)}\n`;
  if (health.readiness) msg += `⚡ *Readiness:* ${health.readiness}/100 ${scoreEmoji(health.readiness)}\n`;
  if (health.activity) msg += `🏃 *Activity:* ${health.activity}/100 ${scoreEmoji(health.activity)}\n`;
  if (health.steps) msg += `👟 *Steps:* ${health.steps.toLocaleString()}\n`;
  if (health.hrv) msg += `💓 *HRV:* ${health.hrv}ms\n`;

  return msg.trim();
}

/**
 * Score-based emoji indicator
 */
function scoreEmoji(score) {
  if (score >= 85) return "🟢";
  if (score >= 70) return "🟡";
  if (score >= 50) return "🟠";
  return "🔴";
}

/**
 * Format goals summary for WhatsApp
 */
export function formatGoalsSummary(goals) {
  if (!goals || goals.length === 0) return "🎯 _No active goals_";

  let msg = `🎯 *Active Goals*\n─────────────────\n`;
  for (const g of goals.slice(0, 5)) {
    const progress = g.progress || 0;
    const bar = progressBar(progress);
    const emoji = progress >= 75 ? "🟢" : progress >= 40 ? "🟡" : "⚪";
    msg += `\n${emoji} *${g.title}*\n   ${bar} ${progress}%\n`;
  }

  return msg.trim();
}

/**
 * Format a trade notification for WhatsApp
 */
export function formatTradeNotification(trade) {
  const { symbol, action, quantity, price, total, reason } = trade;
  const emoji = action === "buy" ? "🟢" : "🔴";
  const actionWord = action === "buy" ? "BOUGHT" : "SOLD";

  let msg = `💹 *Trade Executed*\n─────────────────\n`;
  msg += `${emoji} *${actionWord}* ${quantity}× *${symbol}*\n`;
  msg += `💵 *Price:* ${currency(price)}\n`;
  msg += `📦 *Total:* ${currency(total)}`;
  if (reason) msg += `\n\n_${reason}_`;

  return msg;
}

/**
 * Format trading signals for WhatsApp
 */
export function formatSignals(signals) {
  if (!signals || signals.length === 0) return "📡 _No active signals_";

  let msg = `📡 *Trading Signals*\n─────────────────\n`;
  for (const s of signals.slice(0, 10)) {
    const emoji = s.signal === "BUY" || s.signal === "EXTREME_BUY" ? "🟢"
      : s.signal === "SELL" || s.signal === "EXTREME_SELL" ? "🔴"
      : "⚪";
    msg += `${emoji} *${s.symbol}* ${s.signal} _(${s.score?.toFixed(1) || "?"})_\n`;
  }

  return msg.trim();
}

/**
 * Format an engine cycle summary for WhatsApp
 */
export function formatCycleSummary(cycle) {
  const { action, delta, reward, cycleCount, handoff } = cycle;
  const emoji = reward > 0.05 ? "🟢" : reward < -0.05 ? "🔴" : "⚪";

  let msg = `🤖 *Engine Cycle #${cycleCount}*\n─────────────────\n`;
  msg += `${emoji} *Action:* _${action?.label || action?.type || "unknown"}_\n`;
  msg += `📐 *Strategy:* ${action?.strategy || "?"}\n`;
  msg += `📊 *Reward:* ${signedNum(reward, 3)}\n`;

  // Show meaningful dimension changes
  if (delta && typeof delta === "object") {
    const changes = Object.entries(delta)
      .filter(([k, v]) => !k.startsWith("_") && Math.abs(v) > 0.01)
      .map(([k, v]) => `  ${v > 0 ? "↗" : "↘"} ${k}: ${signedNum(v)}`)
      .join("\n");
    if (changes) {
      msg += `\n*Changes:*\n${changes}\n`;
    }
  }

  if (handoff?.nextTask) {
    msg += `\n💡 *Next:* _${handoff.nextTask}_`;
  }

  return msg;
}

// ── Brief Formatters ────────────────────────────────────────────

/**
 * Build a morning/evening brief in WhatsApp format
 */
export function formatBriefForWhatsApp(brief) {
  if (typeof brief === "string") {
    return formatAIResponse(brief, { includeFooter: true });
  }

  // Build from structured data
  const parts = [];

  if (brief.greeting) {
    parts.push(`☀️ *${brief.greeting}*`);
  }

  if (brief.health) {
    parts.push(formatHealthUpdate(brief.health));
  }

  if (brief.portfolio) {
    parts.push(formatPortfolioUpdate(brief.portfolio));
  }

  if (brief.goals && brief.goals.length > 0) {
    parts.push(formatGoalsSummary(brief.goals));
  }

  if (brief.calendar && brief.calendar.length > 0) {
    let cal = `📅 *Today's Calendar*\n─────────────────\n`;
    for (const e of brief.calendar.slice(0, 5)) {
      cal += `• ${e.time ? `*${e.time}* ` : ""}${e.title}\n`;
    }
    parts.push(cal.trim());
  }

  if (brief.signals && brief.signals.length > 0) {
    parts.push(formatSignals(brief.signals));
  }

  if (brief.priorities && brief.priorities.length > 0) {
    let pri = `⭐ *Priorities*\n─────────────────\n`;
    brief.priorities.slice(0, 3).forEach((p, i) => {
      pri += `${i + 1}. ${p}\n`;
    });
    parts.push(pri.trim());
  }

  if (brief.weather) {
    parts.push(`🌤 _${brief.weather}_`);
  }

  return `🦴 *BACKBONE Daily Brief*\n━━━━━━━━━━━━━━━━━\n\n${parts.join("\n\n")}`;
}

// ── Message Chunking ────────────────────────────────────────────

/**
 * Chunk a long message into WhatsApp-friendly parts.
 * Splits at paragraph boundaries. Each chunk stays under maxLen.
 */
export function chunkMessage(text, maxLen = 4000) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  const paragraphs = text.split("\n\n");
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxLen) {
      if (current) chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current) chunks.push(current.trim());

  // Hard-split any chunks still over limit
  const result = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxLen) {
      result.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += maxLen) {
        result.push(chunk.slice(i, i + maxLen));
      }
    }
  }

  // Add continuation markers for multi-part messages
  if (result.length > 1) {
    return result.map((chunk, i) =>
      i === 0 ? chunk : `_(continued ${i + 1}/${result.length})_\n\n${chunk}`
    );
  }

  return result;
}
