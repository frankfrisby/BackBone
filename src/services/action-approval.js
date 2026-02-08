/**
 * Action Approval Service
 *
 * Requires user consent before the system takes significant actions.
 * Sends rich notifications with context explaining:
 * - What was found
 * - Why it matters to the user
 * - Why now (timing context)
 * - How it fits in the bigger picture
 * - Benefits and potential outcomes
 *
 * User can approve or reject via WhatsApp or in-app.
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";

import { getDataDir } from "./paths.js";
const DATA_DIR = getDataDir();
const APPROVALS_PATH = path.join(DATA_DIR, "pending-approvals.json");

// Action types that require approval
export const APPROVAL_REQUIRED_ACTIONS = {
  APPLY_TO_PROGRAM: "apply_to_program",      // Applications (On Deck, YC, etc.)
  SEND_MESSAGE: "send_message",               // Sending emails/messages on behalf
  CREATE_ACCOUNT: "create_account",           // Creating accounts anywhere
  MAKE_PURCHASE: "make_purchase",             // Any financial transaction
  SCHEDULE_EVENT: "schedule_event",           // Adding calendar events
  SHARE_INFO: "share_info",                   // Sharing personal info externally
  TRADE_STOCK: "trade_stock",                 // Buy/sell stocks
  SUBMIT_FORM: "submit_form",                 // Submitting forms with user data
  START_GOAL: "start_goal",                   // Starting work on a new goal
  CONTACT_PERSON: "contact_person"            // Reaching out to someone
};

// Approval status
export const APPROVAL_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXPIRED: "expired"
};

class ActionApprovalService extends EventEmitter {
  constructor() {
    super();
    this.pendingApprovals = this.load();
    this.notificationService = null;
    this.messagingService = null;
  }

  /**
   * Load pending approvals from disk
   */
  load() {
    try {
      if (fs.existsSync(APPROVALS_PATH)) {
        const data = JSON.parse(fs.readFileSync(APPROVALS_PATH, "utf-8"));
        // Filter out expired approvals (older than 24 hours)
        const now = Date.now();
        return (data.pending || []).filter(a =>
          now - new Date(a.createdAt).getTime() < 24 * 60 * 60 * 1000
        );
      }
    } catch (e) {
      console.error("[ActionApproval] Failed to load:", e.message);
    }
    return [];
  }

  /**
   * Save pending approvals to disk
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(APPROVALS_PATH, JSON.stringify({
        pending: this.pendingApprovals,
        lastUpdated: new Date().toISOString()
      }, null, 2));
    } catch (e) {
      console.error("[ActionApproval] Failed to save:", e.message);
    }
  }

  /**
   * Set the notification service for WhatsApp messages
   */
  setNotificationService(service) {
    this.notificationService = service;
  }

  /**
   * Set the messaging service for in-app messages
   */
  setMessagingService(service) {
    this.messagingService = service;
  }

  /**
   * Request approval for an action
   *
   * @param {Object} action - The action to approve
   * @param {string} action.type - Type from APPROVAL_REQUIRED_ACTIONS
   * @param {string} action.title - Short title (e.g., "Apply to On Deck Founder Fellowship")
   * @param {string} action.description - What the action does
   * @param {Object} action.context - Context information
   * @param {string} action.context.whyMatters - Why this is relevant to the user
   * @param {string} action.context.whyNow - Why the timing matters
   * @param {string} action.context.bigPicture - How it fits user's overall goals
   * @param {string} action.context.benefits - Potential benefits
   * @param {string} action.context.risks - Potential risks or downsides
   * @param {string[]} action.urls - Relevant URLs
   * @param {string} action.imageUrl - Image URL if available
   * @param {Object} action.metadata - Additional data for execution
   */
  async requestApproval(action) {
    const approval = {
      id: `approval_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: action.type,
      title: action.title,
      description: action.description,
      context: action.context || {},
      urls: action.urls || [],
      imageUrl: action.imageUrl || null,
      metadata: action.metadata || {},
      status: APPROVAL_STATUS.PENDING,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };

    this.pendingApprovals.push(approval);
    this.save();

    // Send notification
    await this.sendApprovalRequest(approval);

    this.emit("approval-requested", approval);

    return approval;
  }

  /**
   * Send the approval request notification
   */
  async sendApprovalRequest(approval) {
    const message = this.formatApprovalMessage(approval);

    // Try WhatsApp first
    if (this.notificationService) {
      try {
        await this.notificationService.sendMessage(message, {
          mediaUrl: approval.imageUrl
        });
        console.log(`[ActionApproval] Sent WhatsApp notification for: ${approval.title}`);
        return;
      } catch (e) {
        console.error("[ActionApproval] WhatsApp failed:", e.message);
      }
    }

    // Fall back to in-app messaging
    if (this.messagingService) {
      try {
        await this.messagingService.sendMessage(message, {
          type: "approval_request",
          approvalId: approval.id,
          metadata: { imageUrl: approval.imageUrl }
        });
        console.log(`[ActionApproval] Sent in-app notification for: ${approval.title}`);
      } catch (e) {
        console.error("[ActionApproval] In-app messaging failed:", e.message);
      }
    }

    // Emit event for UI to handle
    this.emit("notification", {
      type: "approval_request",
      approval,
      message
    });
  }

  /**
   * Format the approval request message
   */
  formatApprovalMessage(approval) {
    const ctx = approval.context || {};
    let msg = `🔔 *Action Approval Needed*\n\n`;
    msg += `*${approval.title}*\n`;
    msg += `${approval.description}\n\n`;

    if (ctx.whyMatters) {
      msg += `📌 *Why This Matters to You*\n${ctx.whyMatters}\n\n`;
    }

    if (ctx.whyNow) {
      msg += `⏰ *Why Now*\n${ctx.whyNow}\n\n`;
    }

    if (ctx.bigPicture) {
      msg += `🎯 *How It Fits Your Goals*\n${ctx.bigPicture}\n\n`;
    }

    if (ctx.benefits) {
      msg += `✅ *Benefits*\n${ctx.benefits}\n\n`;
    }

    if (ctx.risks) {
      msg += `⚠️ *Considerations*\n${ctx.risks}\n\n`;
    }

    if (approval.urls && approval.urls.length > 0) {
      msg += `🔗 *Links*\n`;
      approval.urls.forEach(url => {
        msg += `${url}\n`;
      });
      msg += `\n`;
    }

    msg += `─────────────────\n`;
    msg += `Reply *YES* to approve or *NO* to reject.\n`;
    msg += `ID: ${approval.id.slice(-8)}`;

    return msg;
  }

  /**
   * Process a user response to an approval request
   */
  async processResponse(response, approvalId = null) {
    const lower = response.toLowerCase().trim();

    // Find the approval to respond to
    let approval;
    if (approvalId) {
      approval = this.pendingApprovals.find(a => a.id === approvalId || a.id.endsWith(approvalId));
    } else {
      // Take the most recent pending approval
      approval = this.pendingApprovals.find(a => a.status === APPROVAL_STATUS.PENDING);
    }

    if (!approval) {
      return { success: false, error: "No pending approval found" };
    }

    // Check for approval
    if (lower === "yes" || lower === "approve" || lower === "go" || lower.includes("let's go") || lower.includes("go for it")) {
      approval.status = APPROVAL_STATUS.APPROVED;
      approval.respondedAt = new Date().toISOString();
      this.save();
      this.emit("approved", approval);
      return { success: true, action: "approved", approval };
    }

    // Check for rejection
    if (lower === "no" || lower === "reject" || lower === "stop" || lower.includes("don't") || lower.includes("cancel")) {
      approval.status = APPROVAL_STATUS.REJECTED;
      approval.respondedAt = new Date().toISOString();
      this.save();
      this.emit("rejected", approval);
      return { success: true, action: "rejected", approval };
    }

    // Unclear response
    return {
      success: false,
      error: "Please reply YES to approve or NO to reject",
      approval
    };
  }

  /**
   * Get pending approvals
   */
  getPending() {
    return this.pendingApprovals.filter(a => a.status === APPROVAL_STATUS.PENDING);
  }

  /**
   * Get approval by ID
   */
  getById(approvalId) {
    return this.pendingApprovals.find(a => a.id === approvalId || a.id.endsWith(approvalId));
  }

  /**
   * Check if an action type requires approval
   */
  requiresApproval(actionType) {
    return Object.values(APPROVAL_REQUIRED_ACTIONS).includes(actionType);
  }

  /**
   * Cancel a pending approval
   */
  cancel(approvalId) {
    const approval = this.getById(approvalId);
    if (approval && approval.status === APPROVAL_STATUS.PENDING) {
      approval.status = APPROVAL_STATUS.EXPIRED;
      approval.cancelledAt = new Date().toISOString();
      this.save();
      this.emit("cancelled", approval);
      return true;
    }
    return false;
  }

  /**
   * Clear all pending approvals
   */
  clearAll() {
    this.pendingApprovals = [];
    this.save();
  }

  /**
   * Build context for an action based on user's goals and situation
   */
  buildActionContext(action, userContext = {}) {
    const { goals, beliefs, currentFocus, timeline } = userContext;

    const context = {
      whyMatters: "",
      whyNow: "",
      bigPicture: "",
      benefits: "",
      risks: ""
    };

    // Build "why matters" based on user's beliefs and goals
    if (beliefs && beliefs.length > 0) {
      const relevantBeliefs = beliefs.filter(b =>
        action.description?.toLowerCase().includes(b.name?.toLowerCase()) ||
        action.title?.toLowerCase().includes(b.name?.toLowerCase())
      );
      if (relevantBeliefs.length > 0) {
        context.whyMatters = `This aligns with your core belief: "${relevantBeliefs[0].name}"`;
      }
    }

    // Build "why now" based on timeline/deadlines
    if (action.metadata?.deadline) {
      context.whyNow = `Deadline: ${action.metadata.deadline}`;
    } else if (action.metadata?.timing) {
      context.whyNow = action.metadata.timing;
    }

    // Build "big picture" based on active goals
    if (goals && goals.length > 0) {
      const relatedGoal = goals.find(g =>
        action.title?.toLowerCase().includes(g.category?.toLowerCase()) ||
        action.description?.toLowerCase().includes(g.title?.toLowerCase().slice(0, 20))
      );
      if (relatedGoal) {
        context.bigPicture = `This supports your goal: "${relatedGoal.title.slice(0, 50)}..."`;
      }
    }

    // Add any explicit context from the action
    if (action.context) {
      Object.assign(context, action.context);
    }

    return context;
  }
}

// Singleton instance
let instance = null;

export const getActionApproval = () => {
  if (!instance) {
    instance = new ActionApprovalService();
  }
  return instance;
};

export const requestApproval = async (action) => {
  return getActionApproval().requestApproval(action);
};

export const processApprovalResponse = async (response, approvalId) => {
  return getActionApproval().processResponse(response, approvalId);
};

export default ActionApprovalService;
