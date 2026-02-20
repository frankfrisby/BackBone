/**
 * Chat Actions Service
 *
 * Handles actionable requests from chat messages:
 * - Detects when user wants to perform an action (book tickets, send message, etc.)
 * - Creates goals from user requests with appropriate priority
 * - Manages confirmation flow for high-risk actions (purchases, sends)
 * - Executes tools (browser, WhatsApp, etc.) with user oversight
 *
 * Priority System:
 * - User requests become high-priority goals (recency matters)
 * - AI asks about priority when ambiguous
 * - Most recent request takes precedence
 */

import { EventEmitter } from "events";
import { getGoalManager, GOAL_PRIORITY, GOAL_STATE } from "./goals/goal-manager.js";
import { getGoalTracker, GOAL_CATEGORY } from "./goals/goal-tracker.js";
import { getToolExecutor, TOOL_TYPES } from "./tool-executor.js";
import { sendMessage, getMultiAIConfig, TASK_TYPES } from "./ai/multi-ai.js";
import { sendWhatsAppMessage, isPhoneVerified } from "./firebase/phone-auth.js";
import { getCurrentFirebaseUser } from "./firebase/firebase-auth.js";
import { getCapabilityRuntime } from "./capability-runtime.js";

/**
 * Action risk levels - determines if confirmation is needed
 */
export const RISK_LEVEL = {
  LOW: "low",           // Read-only operations, searches
  MEDIUM: "medium",     // Writing files, creating things
  HIGH: "high",         // Financial, messaging, external actions
  CRITICAL: "critical"  // Purchases, irreversible actions
};

/**
 * Action categories
 */
export const ACTION_CATEGORY = {
  SEARCH: "search",           // Web search, lookup information
  BROWSE: "browse",           // Navigate websites, read content
  PURCHASE: "purchase",       // Buy tickets, products, services
  BOOK: "book",               // Reservations, appointments
  SEND_MESSAGE: "send_message", // WhatsApp, email, etc.
  CREATE: "create",           // Create files, documents
  MODIFY: "modify",           // Edit, update things
  DELETE: "delete",           // Remove, cancel things
  RESEARCH: "research",       // In-depth research tasks
  GENERAL: "general"          // Conversational, questions
};

/**
 * Confirmation status
 */
export const CONFIRMATION_STATUS = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  REJECTED: "rejected",
  MODIFIED: "modified"
};

/**
 * Pending action structure
 */
class PendingAction {
  constructor(action) {
    this.id = `action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.action = action;
    this.status = CONFIRMATION_STATUS.PENDING;
    this.createdAt = Date.now();
    this.confirmedAt = null;
    this.goal = null;
    this.result = null;
  }
}

/**
 * Chat Actions Manager
 */
class ChatActionsManager extends EventEmitter {
  constructor() {
    super();
    this.pendingActions = new Map(); // id -> PendingAction
    this.executingActions = new Map();
    this.actionHistory = [];
    this.initialized = false;
  }

  safeJsonParse(raw) {
    try {
      if (typeof raw === "string") {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } else if (raw && typeof raw === "object") {
        return raw;
      }
    } catch {}
    return null;
  }

  heuristicAnalyzeMessage(message) {
    const text = String(message || "").trim();
    const lower = text.toLowerCase();
    if (!text) return null;

    // Only intercept structured actions — NOT general AI requests like "build me a video"
    // General requests should go through the full AI pipeline, not the action flow
    const actionSignals = [
      "book", "reserve", "schedule", "set a reminder", "add to calendar",
      "delete event", "cancel event", "remove event"
    ];
    const isActionable = actionSignals.some(token => lower.includes(token));
    if (!isActionable) return { isActionable: false };

    const category = lower.includes("book") || lower.includes("reserve")
      ? ACTION_CATEGORY.BOOK
      : lower.includes("send") || lower.includes("message")
        ? ACTION_CATEGORY.SEND_MESSAGE
        : lower.includes("search") || lower.includes("find") || lower.includes("look up")
          ? ACTION_CATEGORY.SEARCH
          : lower.includes("delete")
            ? ACTION_CATEGORY.DELETE
            : lower.includes("update") || lower.includes("modify")
              ? ACTION_CATEGORY.MODIFY
              : lower.includes("create") || lower.includes("build")
                ? ACTION_CATEGORY.CREATE
                : ACTION_CATEGORY.GENERAL;

    const isFinancial = lower.includes("buy") || lower.includes("sell") || lower.includes("purchase") || lower.includes("pay");
    const riskLevel = isFinancial
      ? RISK_LEVEL.CRITICAL
      : (category === ACTION_CATEGORY.BOOK || category === ACTION_CATEGORY.SEND_MESSAGE)
        ? RISK_LEVEL.HIGH
        : (category === ACTION_CATEGORY.CREATE || category === ACTION_CATEGORY.MODIFY)
          ? RISK_LEVEL.MEDIUM
          : RISK_LEVEL.LOW;

    const suggestedTools = [];
    if (category === ACTION_CATEGORY.SEARCH) suggestedTools.push("WebSearch");
    if (category === ACTION_CATEGORY.BOOK) suggestedTools.push("BrowserNavigate");
    if (category === ACTION_CATEGORY.SEND_MESSAGE) suggestedTools.push("SendWhatsApp");

    return {
      isActionable: true,
      category,
      riskLevel,
      summary: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      requiresConfirmation: riskLevel === RISK_LEVEL.HIGH || riskLevel === RISK_LEVEL.CRITICAL,
      suggestedPriority: this.isTimeSensitiveRequest(text) ? 1 : 2,
      priorityReason: this.isTimeSensitiveRequest(text) ? "Time-sensitive request detected" : "Direct user action request",
      shouldAskPriority: false,
      extractedDetails: {
        otherDetails: {}
      },
      suggestedTools,
      steps: [
        "Analyze request details",
        "Execute required tool actions",
        "Confirm completion with clear result"
      ]
    };
  }

  isTimeSensitiveRequest(message, analysis = null) {
    const lower = String(message || "").toLowerCase();
    const fastTokens = ["urgent", "asap", "right now", "immediately", "today", "tonight", "this evening", "now"];
    const hasFastToken = fastTokens.some(token => lower.includes(token));
    const hasDateHint = /\b\d{1,2}:\d{2}\b/.test(lower) || /\b(mon|tue|wed|thu|fri|sat|sun)\b/.test(lower);
    const analysisPriority = Number(analysis?.suggestedPriority || 3);
    const extractedDate = String(analysis?.extractedDetails?.date || "");
    return hasFastToken || hasDateHint || analysisPriority === 1 || extractedDate.length > 0;
  }

  createExecutionReport(pending, analysis, actionMessage) {
    return {
      actionId: pending.id,
      summary: analysis?.summary || actionMessage,
      category: analysis?.category || ACTION_CATEGORY.GENERAL,
      riskLevel: analysis?.riskLevel || RISK_LEVEL.LOW,
      timeSensitive: this.isTimeSensitiveRequest(actionMessage, analysis),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      steps: [],
      failures: [],
      capabilitySetup: null
    };
  }

  addExecutionStep(report, payload = {}) {
    const step = {
      index: report.steps.length + 1,
      timestamp: new Date().toISOString(),
      status: payload.status || "running",
      label: payload.label || "Executing step",
      tool: payload.tool || null,
      target: payload.target || null,
      details: payload.details || null,
      error: payload.error || null
    };
    report.steps.push(step);

    this.emit("action-progress", {
      actionId: report.actionId,
      progress: step.index,
      message: `${step.status === "failed" ? "Failed" : "Step"} ${step.index}: ${step.label}`,
      step: step.index,
      status: step.status,
      tool: step.tool,
      timestamp: step.timestamp
    });

    return step;
  }

  async executeToolStep(toolExecutor, report, label, actionConfig) {
    this.addExecutionStep(report, {
      label,
      status: "running",
      tool: actionConfig.action,
      target: actionConfig.target
    });

    const result = await toolExecutor.execute(actionConfig);
    if (!result?.success) {
      const error = result?.error || `Tool failed: ${actionConfig.action}`;
      this.addExecutionStep(report, {
        label,
        status: "failed",
        tool: actionConfig.action,
        target: actionConfig.target,
        error
      });
      throw new Error(error);
    }

    this.addExecutionStep(report, {
      label,
      status: "completed",
      tool: actionConfig.action,
      target: actionConfig.target,
      details: result
    });
    return result;
  }

  buildExecutionResponse(report) {
    const lines = [];
    lines.push(`Action: ${report.summary}`);
    lines.push(`Status: ${report.status.toUpperCase()}`);
    if (report.timeSensitive) {
      lines.push("Priority: Time-sensitive request handled with immediate execution");
    }
    lines.push("");
    lines.push("Execution Steps:");

    if (report.steps.length === 0) {
      lines.push("1. No executable steps were completed.");
    } else {
      for (const step of report.steps) {
        const marker = step.status === "completed" ? "[ok]" : step.status === "failed" ? "[failed]" : "[running]";
        const toolPart = step.tool ? ` (${step.tool})` : "";
        const errorPart = step.error ? ` - ${step.error}` : "";
        lines.push(`${step.index}. ${marker} ${step.label}${toolPart}${errorPart}`);
      }
    }

    if (report.capabilitySetup) {
      const machineSummary = report.capabilitySetup?.machinePlan?.summary;
      if (machineSummary) {
        lines.push("");
        lines.push(`Machine plan: ${machineSummary}`);
      }

      const addedTools = report.capabilitySetup.scaffoldedTools?.length || 0;
      const addedServers = report.capabilitySetup.scaffoldedMcpServers?.length || 0;
      const skipped = report.capabilitySetup.skippedScaffolds?.length || 0;
      if (addedTools > 0 || addedServers > 0) {
        lines.push("");
        lines.push(`Capability updates: ${addedTools} tool(s), ${addedServers} MCP server mapping(s) added.`);
      }
      if (skipped > 0) {
        lines.push(`Capability updates: ${skipped} scaffold step(s) skipped because installed software is available.`);
      }
    }

    if (report.failures.length > 0) {
      lines.push("");
      lines.push("Failures:");
      report.failures.forEach((failure, idx) => {
        lines.push(`${idx + 1}. ${failure}`);
      });
    }

    return lines.join("\n");
  }

  /**
   * Analyze a user message to detect actionable requests
   * Returns action details or null if not actionable
   */
  async analyzeMessage(message) {
    const prompt = `Analyze this user message and determine if it's an actionable request that requires tool execution.

User message: "${message}"

Respond with JSON only:
{
  "isActionable": true/false,
  "category": "search|browse|purchase|book|send_message|create|modify|delete|research|general",
  "riskLevel": "low|medium|high|critical",
  "summary": "Brief summary of what user wants",
  "requiresConfirmation": true/false,
  "suggestedPriority": 1-4 (1=urgent, 2=high, 3=medium, 4=low),
  "priorityReason": "Why this priority level",
  "shouldAskPriority": true/false,
  "extractedDetails": {
    "destination": "if travel related",
    "date": "if time-sensitive",
    "quantity": "if applicable",
    "recipients": "if messaging",
    "budget": "if financial",
    "otherDetails": {}
  },
  "suggestedTools": ["list of tools needed"],
  "steps": ["ordered list of steps to complete this"]
}

Risk Level Guide:
- low: Reading, searching, gathering information
- medium: Creating content, writing files
- high: Sending messages, making reservations
- critical: Financial transactions, purchases, irreversible actions

Priority Guide:
- 1 (urgent): Time-sensitive, needs immediate action
- 2 (high): Important, user explicitly asked
- 3 (medium): Regular request, can be queued
- 4 (low): Nice to have, no urgency

If the message is a question or conversation (not asking to DO something), return isActionable: false.`;

    try {
      const aiConfig = getMultiAIConfig();
      if (!aiConfig.ready) {
        return this.heuristicAnalyzeMessage(message);
      }

      const response = await sendMessage(prompt, {
        taskType: TASK_TYPES.ANALYSIS,
        maxTokens: 1000
      });

      const parsed = this.safeJsonParse(response);
      if (parsed) {
        return parsed;
      }
    } catch (error) {
      console.error("[ChatActions] Failed to analyze message:", error.message);
    }

    return this.heuristicAnalyzeMessage(message);
  }

  /**
   * Create a goal from a user request
   */
  async createGoalFromRequest(message, analysis) {
    if (!analysis?.isActionable) {
      return null;
    }

    const goalManager = getGoalManager();
    const tracker = getGoalTracker();

    // Determine category based on action type
    let category = GOAL_CATEGORY.GROWTH;
    if (analysis.category === "purchase" || analysis.category === "book") {
      category = GOAL_CATEGORY.FINANCIAL;
    } else if (analysis.category === "research" || analysis.category === "search") {
      category = GOAL_CATEGORY.CAREER;
    }

    // Create the goal
    const goal = {
      title: analysis.summary || message.slice(0, 100),
      category,
      priority: analysis.suggestedPriority || GOAL_PRIORITY.HIGH,
      description: message,
      source: "user_request",
      createdAt: Date.now(),
      extractedDetails: analysis.extractedDetails || {},
      suggestedSteps: analysis.steps || [],
      requiredTools: analysis.suggestedTools || []
    };

    // User requests are high priority by default (recency)
    if (goal.priority > GOAL_PRIORITY.HIGH) {
      goal.priority = GOAL_PRIORITY.HIGH;
    }

    try {
      const createdGoal = await goalManager.addGoal(goal, true); // Set as current
      this.emit("goal-created", { goal: createdGoal, analysis });
      return createdGoal;
    } catch (error) {
      console.error("[ChatActions] Failed to create goal:", error.message);
      return null;
    }
  }

  /**
   * Request confirmation for a high-risk action
   * Returns a pending action that needs user confirmation
   */
  async requestConfirmation(action, analysis, goal = null) {
    const pending = new PendingAction({
      originalMessage: action.message,
      analysis,
      goal,
      category: analysis.category,
      riskLevel: analysis.riskLevel,
      summary: analysis.summary,
      steps: analysis.steps,
      extractedDetails: analysis.extractedDetails
    });

    this.pendingActions.set(pending.id, pending);
    this.emit("confirmation-needed", pending);

    return pending;
  }

  /**
   * Build a confirmation message to show the user
   */
  buildConfirmationMessage(pending) {
    const { action } = pending;
    const { analysis } = action;

    let message = `**Confirm Action: ${analysis.summary}**\n\n`;

    // Show risk level
    const riskEmoji = {
      low: "🟢",
      medium: "🟡",
      high: "🟠",
      critical: "🔴"
    };
    message += `Risk: ${riskEmoji[analysis.riskLevel] || "⚪"} ${analysis.riskLevel.toUpperCase()}\n\n`;

    // Show extracted details
    if (analysis.extractedDetails) {
      const details = analysis.extractedDetails;
      message += "**Details:**\n";
      if (details.destination) message += `- Destination: ${details.destination}\n`;
      if (details.date) message += `- Date: ${details.date}\n`;
      if (details.quantity) message += `- Quantity: ${details.quantity}\n`;
      if (details.recipients) message += `- Recipients: ${details.recipients}\n`;
      if (details.budget) message += `- Budget: ${details.budget}\n`;
      message += "\n";
    }

    // Show planned steps
    if (analysis.steps && analysis.steps.length > 0) {
      message += "**Steps I'll take:**\n";
      analysis.steps.forEach((step, i) => {
        message += `${i + 1}. ${step}\n`;
      });
      message += "\n";
    }

    // Show required tools
    if (analysis.suggestedTools && analysis.suggestedTools.length > 0) {
      message += `**Tools needed:** ${analysis.suggestedTools.join(", ")}\n\n`;
    }

    message += `Type **yes** to confirm, **no** to cancel, or **modify** to change details.`;

    return message;
  }

  /**
   * Confirm a pending action
   */
  async confirmAction(actionId, modifications = null) {
    const pending = this.pendingActions.get(actionId);
    if (!pending) {
      return { success: false, error: "Action not found" };
    }

    pending.status = modifications ? CONFIRMATION_STATUS.MODIFIED : CONFIRMATION_STATUS.CONFIRMED;
    pending.confirmedAt = Date.now();

    if (modifications) {
      pending.action.analysis.extractedDetails = {
        ...pending.action.analysis.extractedDetails,
        ...modifications
      };
    }

    this.emit("action-confirmed", pending);

    // Execute the action
    return await this.executeAction(pending);
  }

  /**
   * Reject a pending action
   */
  rejectAction(actionId) {
    const pending = this.pendingActions.get(actionId);
    if (!pending) {
      return { success: false, error: "Action not found" };
    }

    pending.status = CONFIRMATION_STATUS.REJECTED;
    this.pendingActions.delete(actionId);
    this.emit("action-rejected", pending);

    return { success: true, message: "Action cancelled" };
  }

  /**
   * Execute a confirmed action
   */
  async executeAction(pending) {
    const { action } = pending;
    const { analysis } = action;
    const actionMessage = action.originalMessage || action.message || analysis?.summary || "";
    const report = this.createExecutionReport(pending, analysis, actionMessage);

    this.executingActions.set(pending.id, pending);
    this.emit("action-started", pending);

    const results = [];

    try {
      // Auto-scaffold missing capabilities and register new tool/MCP entries.
      try {
        const capabilityRuntime = getCapabilityRuntime();
        report.capabilitySetup = await capabilityRuntime.ensureForRequest({
          message: actionMessage,
          analysis
        });

        if (report.capabilitySetup?.machinePlan?.summary) {
          this.addExecutionStep(report, {
            status: "completed",
            label: "Machine profile analyzed",
            details: { summary: report.capabilitySetup.machinePlan.summary }
          });
        }

        if ((report.capabilitySetup?.scaffoldedTools?.length || 0) > 0) {
          this.addExecutionStep(report, {
            status: "completed",
            label: `Scaffolded ${report.capabilitySetup.scaffoldedTools.length} missing tool(s)`,
            details: report.capabilitySetup.scaffoldedTools
          });
        }
        if ((report.capabilitySetup?.scaffoldedMcpServers?.length || 0) > 0) {
          this.addExecutionStep(report, {
            status: "completed",
            label: `Registered ${report.capabilitySetup.scaffoldedMcpServers.length} MCP server mapping(s)`,
            details: report.capabilitySetup.scaffoldedMcpServers
          });
        }
        if ((report.capabilitySetup?.skippedScaffolds?.length || 0) > 0) {
          this.addExecutionStep(report, {
            status: "completed",
            label: `Skipped ${report.capabilitySetup.skippedScaffolds.length} scaffold item(s) due to installed local software`,
            details: report.capabilitySetup.skippedScaffolds
          });
        }
      } catch (capabilityError) {
        report.failures.push(`Capability setup warning: ${capabilityError.message}`);
        this.addExecutionStep(report, {
          status: "failed",
          label: "Capability setup encountered an error",
          error: capabilityError.message
        });
      }

      // Execute based on category
      switch (analysis.category) {
        case ACTION_CATEGORY.SEND_MESSAGE:
          results.push(await this.executeSendMessage(action, analysis, report));
          break;

        case ACTION_CATEGORY.SEARCH:
        case ACTION_CATEGORY.BROWSE:
        case ACTION_CATEGORY.RESEARCH:
          results.push(await this.executeWebAction(action, analysis, report));
          break;

        case ACTION_CATEGORY.PURCHASE:
        case ACTION_CATEGORY.BOOK:
          results.push(await this.executeComplexWebAction(action, analysis, report, pending.id));
          break;

        default:
          // For other categories, use AI to determine and chain tools
          results.push(await this.executeGenericAction(action, analysis, report));
      }

      report.status = "completed";
      report.finishedAt = new Date().toISOString();
      const responseText = this.buildExecutionResponse(report);
      pending.result = { success: true, results, report, responseText };
      this.actionHistory.push(pending);
      this.executingActions.delete(pending.id);
      this.pendingActions.delete(pending.id);
      this.emit("action-completed", pending);

      return pending.result;

    } catch (error) {
      report.status = "failed";
      report.finishedAt = new Date().toISOString();
      report.failures.push(error.message);
      this.addExecutionStep(report, {
        status: "failed",
        label: "Execution halted",
        error: error.message
      });
      const responseText = this.buildExecutionResponse(report);
      pending.result = { success: false, error: error.message, report, responseText };
      this.executingActions.delete(pending.id);
      this.emit("action-failed", { pending, error });
      return pending.result;
    }
  }

  /**
   * Execute a send message action (WhatsApp, etc.)
   */
  async executeSendMessage(action, analysis, report) {
    this.addExecutionStep(report, {
      status: "running",
      label: "Preparing outbound WhatsApp message"
    });

    const user = getCurrentFirebaseUser();
    if (!user?.id) {
      throw new Error("Not logged in. Please sign in to send messages.");
    }

    const details = analysis.extractedDetails || {};
    const message = details.messageContent || action.originalMessage;

    // Default to WhatsApp for now
    if (!isPhoneVerified(user.id)) {
      throw new Error("Phone not verified. Complete WhatsApp verification in /setup first.");
    }

    const result = await sendWhatsAppMessage(user.id, message);
    if (!result?.success) {
      throw new Error(result?.error || "WhatsApp send failed");
    }

    this.addExecutionStep(report, {
      status: "completed",
      label: "WhatsApp message sent",
      details: { messageId: result.messageId || null }
    });

    return {
      type: "message_sent",
      platform: "whatsapp",
      success: result.success,
      messageId: result.messageId
    };
  }

  /**
   * Execute a web search/browse action
   */
  async executeWebAction(action, analysis, report) {
    const toolExecutor = getToolExecutor();
    const results = [];

    // First, do a web search if needed
    if (analysis.suggestedTools?.includes("WebSearch")) {
      const searchQuery = analysis.extractedDetails?.searchQuery || analysis.summary;
      const searchResult = await this.executeToolStep(toolExecutor, report, "Run web search", {
        action: TOOL_TYPES.WEB_SEARCH,
        target: searchQuery
      });
      results.push({ type: "search", result: searchResult });
    }

    // Navigate to relevant pages if needed
    if (analysis.suggestedTools?.includes("BrowserNavigate")) {
      const url = analysis.extractedDetails?.url;
      if (url) {
        const navResult = await this.executeToolStep(toolExecutor, report, `Navigate browser to ${url}`, {
          action: TOOL_TYPES.BROWSER_NAVIGATE,
          target: url
        });
        results.push({ type: "navigate", result: navResult });

        // Get page content
        const contentResult = await this.executeToolStep(toolExecutor, report, "Capture page content", {
          action: TOOL_TYPES.BROWSER_GET_CONTENT,
          target: "body"
        });
        results.push({ type: "content", result: contentResult });
      }
    }

    return { type: "web_action", results };
  }

  /**
   * Execute a complex web action (purchase, booking)
   * This requires multi-step browser automation
   */
  async executeComplexWebAction(action, analysis, report, actionId) {
    const toolExecutor = getToolExecutor();
    const results = [];
    this.addExecutionStep(report, {
      status: "running",
      label: "Starting browser automation plan"
    });

    // Generate a detailed execution plan using AI
    const planPrompt = `Create a detailed browser automation plan for this task:

Task: ${analysis.summary}
Details: ${JSON.stringify(analysis.extractedDetails, null, 2)}

The user wants to: ${action.originalMessage}

Generate specific browser automation steps as JSON:
{
  "steps": [
    {
      "action": "navigate|click|type|scroll|screenshot|wait",
      "target": "url or selector or text",
      "value": "text to type if applicable",
      "description": "what this step does"
    }
  ],
  "confirmationPoints": [
    {
      "beforeStep": 5,
      "message": "Confirmation message to show user"
    }
  ]
}

Include confirmation points before any irreversible actions (submitting payments, etc).`;

    let executionPlan;
    try {
      const aiConfig = getMultiAIConfig();
      if (aiConfig.ready) {
        const planResponse = await sendMessage(planPrompt, {
          taskType: TASK_TYPES.ANALYSIS,
          maxTokens: 2000
        });

        executionPlan = this.safeJsonParse(planResponse);
      }
    } catch (error) {
      console.error("[ChatActions] Failed to generate execution plan:", error.message);
    }

    if (!executionPlan?.steps) {
      throw new Error("Could not generate automation plan. Please try with more specific details.");
    }

    // Execute the plan step by step
    for (let i = 0; i < executionPlan.steps.length; i++) {
      const step = executionPlan.steps[i];
      const progress = Math.round((i / executionPlan.steps.length) * 100);

      // Check if we need confirmation before this step
      const confirmationPoint = executionPlan.confirmationPoints?.find(cp => cp.beforeStep === i);
      if (confirmationPoint) {
        this.emit("action-confirmation-needed", {
          actionId,
          message: confirmationPoint.message,
          stepIndex: i
        });

        // Wait for confirmation (this should be handled by the UI)
        // For now, we'll pause and let the system handle it
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.emit("action-progress", {
        actionId,
        message: step.description,
        progress,
        currentStep: i + 1,
        totalSteps: executionPlan.steps.length
      });

      try {
        let stepResult;
        switch (step.action) {
          case "navigate":
            stepResult = await this.executeToolStep(toolExecutor, report, step.description || `Navigate to ${step.target}`, {
              action: TOOL_TYPES.BROWSER_NAVIGATE,
              target: step.target
            });
            break;
          case "click":
            stepResult = await this.executeToolStep(toolExecutor, report, step.description || `Click ${step.target}`, {
              action: TOOL_TYPES.BROWSER_CLICK,
              target: step.target
            });
            break;
          case "type":
            stepResult = await this.executeToolStep(toolExecutor, report, step.description || `Type into ${step.target}`, {
              action: TOOL_TYPES.BROWSER_TYPE,
              target: step.value,
              params: { selector: step.target }
            });
            break;
          case "scroll":
            stepResult = await this.executeToolStep(toolExecutor, report, step.description || `Scroll ${step.target}`, {
              action: TOOL_TYPES.BROWSER_SCROLL,
              target: step.target
            });
            break;
          case "screenshot":
            stepResult = await this.executeToolStep(toolExecutor, report, step.description || "Capture screenshot", {
              action: TOOL_TYPES.BROWSER_SCREENSHOT,
              target: step.target || `step-${i}`
            });
            break;
          case "wait":
            this.addExecutionStep(report, {
              status: "running",
              label: step.description || "Waiting for page state"
            });
            await new Promise(resolve => setTimeout(resolve, parseInt(step.value) || 1000));
            stepResult = { success: true, action: "wait" };
            this.addExecutionStep(report, {
              status: "completed",
              label: step.description || "Wait complete"
            });
            break;
          default:
            stepResult = { skipped: true, reason: `Unknown action: ${step.action}` };
        }

        results.push({
          step: i + 1,
          action: step.action,
          description: step.description,
          result: stepResult
        });

      } catch (stepError) {
        results.push({
          step: i + 1,
          action: step.action,
          error: stepError.message
        });

        // Take screenshot on error
        try {
          await toolExecutor.execute({
            action: TOOL_TYPES.BROWSER_SCREENSHOT,
            target: `error-step-${i}`
          });
        } catch (e) {}

        throw new Error(`Step ${i + 1} failed: ${stepError.message}`);
      }
    }

    return {
      type: "complex_web_action",
      results,
      summary: `Completed ${results.length} steps`
    };
  }

  /**
   * Execute a generic action using AI to chain tools
   */
  async executeGenericAction(action, analysis, report) {
    const toolExecutor = getToolExecutor();
    const results = [];

    // Use AI to determine tool chain
    const chainPrompt = `Execute this task by selecting the appropriate tools:

Task: ${analysis.summary}
Available tools: WebSearch, Read, Write, Bash, SendWhatsApp, BrowserNavigate, BrowserClick, BrowserType

What's the first tool to use? Respond with JSON:
{
  "tool": "tool_name",
  "target": "the target",
  "params": {},
  "reasoning": "why"
}`;

    try {
      const aiConfig = getMultiAIConfig();
      if (aiConfig.ready) {
        const response = await sendMessage(chainPrompt, {
          taskType: TASK_TYPES.ANALYSIS,
          maxTokens: 500
        });

        const toolCall = this.safeJsonParse(response);
        if (toolCall) {

          // Map tool name to TOOL_TYPE
          const toolTypeMap = {
            "WebSearch": TOOL_TYPES.WEB_SEARCH,
            "Read": TOOL_TYPES.READ,
            "Write": TOOL_TYPES.WRITE,
            "Bash": TOOL_TYPES.BASH,
            "SendWhatsApp": TOOL_TYPES.SEND_WHATSAPP,
            "BrowserNavigate": TOOL_TYPES.BROWSER_NAVIGATE,
            "BrowserClick": TOOL_TYPES.BROWSER_CLICK,
            "BrowserType": TOOL_TYPES.BROWSER_TYPE
          };

          const toolType = toolTypeMap[toolCall.tool];
          if (toolType) {
            const result = await this.executeToolStep(toolExecutor, report, toolCall.reasoning || `Run ${toolCall.tool}`, {
              action: toolType,
              target: toolCall.target,
              params: toolCall.params || {}
            });
            results.push({ tool: toolCall.tool, result });
          }
        }
      } else {
        const fallbackQuery = analysis.summary || action.originalMessage || "user request";
        const searchResult = await this.executeToolStep(toolExecutor, report, "Fallback web search for request context", {
          action: TOOL_TYPES.WEB_SEARCH,
          target: fallbackQuery
        });
        results.push({ tool: "WebSearch", result: searchResult });
      }
    } catch (error) {
      console.error("[ChatActions] Generic action failed:", error.message);
      throw error;
    }

    return { type: "generic_action", results };
  }

  /**
   * Get prompt for asking about priority
   */
  buildPriorityQuestion(analysis) {
    return `I understand you want to: **${analysis.summary}**

How urgent is this?
1. **Urgent** - Need this done right now
2. **High** - Important, please prioritize
3. **Medium** - Regular priority, queue it up
4. **Low** - When you have time

Reply with 1, 2, 3, or 4 (or just say urgent/high/medium/low)`;
  }

  /**
   * Parse priority from user response
   */
  parsePriorityResponse(response) {
    const lower = response.toLowerCase().trim();

    if (lower === "1" || lower.includes("urgent")) return GOAL_PRIORITY.URGENT;
    if (lower === "2" || lower.includes("high")) return GOAL_PRIORITY.HIGH;
    if (lower === "3" || lower.includes("medium")) return GOAL_PRIORITY.MEDIUM;
    if (lower === "4" || lower.includes("low")) return GOAL_PRIORITY.LOW;

    return null; // Couldn't parse
  }

  /**
   * Process a user message - main entry point
   * Returns: { needsConfirmation, needsPriority, analysis, pendingAction, goal, response }
   */
  async processUserMessage(message) {
    // Analyze the message
    const analysis = await this.analyzeMessage(message);

    if (!analysis || !analysis.isActionable) {
      return {
        isActionable: false,
        analysis: null,
        response: null
      };
    }

    // Create a goal from the request
    const goal = await this.createGoalFromRequest(message, analysis);

    // Check if we need to ask about priority
    if (analysis.shouldAskPriority) {
      return {
        isActionable: true,
        needsPriority: true,
        analysis,
        goal,
        response: this.buildPriorityQuestion(analysis)
      };
    }

    // Check if confirmation is needed
    if (analysis.requiresConfirmation || analysis.riskLevel === RISK_LEVEL.HIGH || analysis.riskLevel === RISK_LEVEL.CRITICAL) {
      const pending = await this.requestConfirmation({ message }, analysis, goal);
      return {
        isActionable: true,
        needsConfirmation: true,
        analysis,
        pendingAction: pending,
        goal,
        response: this.buildConfirmationMessage(pending)
      };
    }

    // Low/medium risk - execute immediately
    const pending = new PendingAction({
      originalMessage: message,
      analysis,
      goal
    });
    pending.status = CONFIRMATION_STATUS.CONFIRMED;

    const result = await this.executeAction(pending);

    return {
      isActionable: true,
      executed: true,
      analysis,
      goal,
      result,
      response: result.responseText || (result.success
        ? `Done! ${analysis.summary}`
        : `Failed: ${result.error}`)
    };
  }

  /**
   * Get current pending actions awaiting confirmation
   */
  getPendingActions() {
    return Array.from(this.pendingActions.values());
  }

  /**
   * Get oldest pending action (for confirmation flow)
   */
  getOldestPendingAction() {
    const pending = this.getPendingActions();
    if (pending.length === 0) return null;
    return pending.sort((a, b) => a.createdAt - b.createdAt)[0];
  }

  /**
   * Check if user response is a confirmation for pending action
   */
  isConfirmationResponse(message) {
    const lower = message.toLowerCase().trim();
    return (
      lower === "yes" ||
      lower === "y" ||
      lower === "confirm" ||
      lower === "no" ||
      lower === "n" ||
      lower === "cancel" ||
      lower === "modify" ||
      lower === "change"
    );
  }

  /**
   * Process a confirmation response
   */
  async processConfirmationResponse(message) {
    const pending = this.getOldestPendingAction();
    if (!pending) {
      return { handled: false };
    }

    const lower = message.toLowerCase().trim();

    if (lower === "yes" || lower === "y" || lower === "confirm") {
      const result = await this.confirmAction(pending.id);
      return {
        handled: true,
        confirmed: true,
        result,
        response: result.responseText || (result.success
          ? `Action completed: ${pending.action.analysis.summary}`
          : `Action failed: ${result.error}`)
      };
    }

    if (lower === "no" || lower === "n" || lower === "cancel") {
      this.rejectAction(pending.id);
      return {
        handled: true,
        confirmed: false,
        response: "Action cancelled."
      };
    }

    if (lower === "modify" || lower === "change") {
      return {
        handled: true,
        needsModification: true,
        response: "What would you like to change? Please describe the modifications."
      };
    }

    return { handled: false };
  }
}

// Singleton instance
let chatActionsManager = null;

export const getChatActionsManager = () => {
  if (!chatActionsManager) {
    chatActionsManager = new ChatActionsManager();
  }
  return chatActionsManager;
};

export default {
  getChatActionsManager,
  RISK_LEVEL,
  ACTION_CATEGORY,
  CONFIRMATION_STATUS
};
