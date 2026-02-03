/**
 * Realtime Messaging & Unified Message Log Tests
 * Validates Firebase polling, message processing, channel detection, and unified message list
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "src");
const SERVICES_DIR = path.join(SRC_DIR, "services");

// === REALTIME MESSAGING SERVICE ===

describe("Realtime Messaging Service - Structure", () => {
  const filePath = path.join(SERVICES_DIR, "realtime-messaging.js");

  it("service file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports RealtimeMessaging class", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export class RealtimeMessaging");
    expect(content).toContain("extends EventEmitter");
  });

  it("exports singleton getter", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const getRealtimeMessaging");
  });

  it("exports setupRealtimeMessaging helper", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const setupRealtimeMessaging");
  });

  it("exports MESSAGE_TYPE constants", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const MESSAGE_TYPE");
    expect(content).toContain('USER: "user"');
    expect(content).toContain('AI: "ai"');
    expect(content).toContain('SYSTEM: "system"');
    expect(content).toContain('ACTION: "action"');
    expect(content).toContain('QUESTION: "question"');
  });

  it("exports MESSAGE_STATUS constants", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const MESSAGE_STATUS");
    expect(content).toContain('PENDING: "pending"');
    expect(content).toContain('PROCESSING: "processing"');
    expect(content).toContain('COMPLETED: "completed"');
    expect(content).toContain('FAILED: "failed"');
  });

  it("exports PRESENCE_STATUS constants", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const PRESENCE_STATUS");
    expect(content).toContain('ONLINE: "online"');
    expect(content).toContain('BUSY: "busy"');
    expect(content).toContain('OFFLINE: "offline"');
  });
});

describe("Realtime Messaging - Firebase Polling", () => {
  const filePath = path.join(SERVICES_DIR, "realtime-messaging.js");

  it("uses Firestore REST API", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("firestore.googleapis.com");
    expect(content).toContain("FIRESTORE_BASE_URL");
  });

  it("has smart polling configuration (idle: 3min, active: 10sec)", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("IDLE_INTERVAL: 3 * 60 * 1000");
    expect(content).toContain("ACTIVE_INTERVAL: 10 * 1000");
    expect(content).toContain("ACTIVE_TIMEOUT: 10 * 60 * 1000");
  });

  it("has startListening method that begins polling", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("async startListening(");
    expect(content).toContain("this.schedulePoll()");
    expect(content).toContain("await this.checkForNewMessages()");
  });

  it("schedulePoll switches between idle and active modes", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("schedulePoll()");
    expect(content).toContain('this.pollingMode === "active"');
    expect(content).toContain('this.pollingMode = "idle"');
  });

  it("checkForNewMessages polls Firestore for user messages", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("async checkForNewMessages()");
    expect(content).toContain("users/${this.userId}/messages");
    expect(content).toContain("parseFirestoreFields(doc.fields)");
  });

  it("filters for unprocessed user messages", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("message.type !== MESSAGE_TYPE.USER");
    expect(content).toContain("isCompleted");
    expect(content).toContain("isProcessing");
  });

  it("activates fast polling when message received", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("activatePolling()");
    expect(content).toContain('this.pollingMode = "active"');
  });
});

describe("Realtime Messaging - Message Processing", () => {
  const filePath = path.join(SERVICES_DIR, "realtime-messaging.js");

  it("processMessage marks status as PROCESSING then COMPLETED", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("await this.updateMessageStatus(messageId, MESSAGE_STATUS.PROCESSING)");
    expect(content).toContain("await this.updateMessageStatus(messageId, MESSAGE_STATUS.COMPLETED");
  });

  it("updates presence to BUSY during processing", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("await this.updatePresence(PRESENCE_STATUS.BUSY)");
    expect(content).toContain("await this.updatePresence(PRESENCE_STATUS.ONLINE)");
  });

  it("calls message handler and sends response back to Firestore", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("this.messageHandler");
    expect(content).toContain("await this.sendMessage(response.content");
  });

  it("handles errors and marks message as FAILED", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("await this.updateMessageStatus(messageId, MESSAGE_STATUS.FAILED");
  });

  it("tracks processed message IDs to avoid reprocessing", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("this.processedMessageIds.add(messageId)");
    expect(content).toContain("processedMessageIds = new Set()");
  });
});

describe("Realtime Messaging - Sending Responses", () => {
  const filePath = path.join(SERVICES_DIR, "realtime-messaging.js");

  it("sendMessage writes to Firestore via PATCH", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("async sendMessage(content");
    expect(content).toContain('method: "PATCH"');
    expect(content).toContain("toFirestoreFields(message)");
  });

  it("generates unique message IDs", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("msg_${Date.now()}_${Math.random()");
  });

  it("marks AI responses with fromAI: true", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("fromAI: true");
  });
});

// === UNIFIED MESSAGE LOG ===

describe("Unified Message Log - Structure", () => {
  const filePath = path.join(SERVICES_DIR, "unified-message-log.js");

  it("service file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("exports UnifiedMessageLog class", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("class UnifiedMessageLog extends EventEmitter");
  });

  it("exports singleton getter", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("export const getUnifiedMessageLog");
  });
});

describe("Unified Message Log - Channel Support", () => {
  const filePath = path.join(SERVICES_DIR, "unified-message-log.js");

  it("defines all message channels including APP", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('CHAT: "chat"');
    expect(content).toContain('WHATSAPP: "whatsapp"');
    expect(content).toContain('APP: "app"');
    expect(content).toContain('SYSTEM: "system"');
    expect(content).toContain('PROACTIVE: "proactive"');
  });

  it("has addUserMessage with channel parameter", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("addUserMessage(content, channel = MESSAGE_CHANNEL.CHAT");
  });

  it("has addAssistantMessage with channel parameter", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("addAssistantMessage(content, channel = MESSAGE_CHANNEL.CHAT");
  });

  it("has getAppMessages method", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getAppMessages(limit = 10)");
    expect(content).toContain("m.channel === MESSAGE_CHANNEL.APP");
  });

  it("has getUnifiedMessages method for combined view", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getUnifiedMessages(limit = 50)");
  });

  it("getStats includes app message count", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("appMessages: appMessages.length");
  });
});

describe("Unified Message Log - AI Context", () => {
  const filePath = path.join(SERVICES_DIR, "unified-message-log.js");

  it("getMessagesForAI adds channel prefix for WhatsApp", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("[via WhatsApp]");
  });

  it("getMessagesForAI adds channel prefix for App", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("[via App]");
  });

  it("getMessagesForAI adds channel prefix for Proactive", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("[proactive notification]");
  });
});

describe("Unified Message Log - Compaction", () => {
  const filePath = path.join(SERVICES_DIR, "unified-message-log.js");

  it("has configurable max messages and compact threshold", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("MAX_MESSAGES: 50");
    expect(content).toContain("COMPACT_THRESHOLD: 25");
  });

  it("compacts old messages with summary", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("compactOldMessages()");
    expect(content).toContain("createSummary(messagesToCompact)");
  });

  it("persists state to data/unified-message-log.json", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("unified-message-log.json");
    expect(content).toContain("this.saveState()");
  });
});

// === APP.JS MESSAGE HANDLER INTEGRATION ===

describe("App.js Message Handler - Channel Detection", () => {
  const filePath = path.join(SRC_DIR, "app.js");

  it("detects channel from message (app vs whatsapp)", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('message.channel === "whatsapp" || message.source === "whatsapp"');
    expect(content).toContain("MESSAGE_CHANNEL.WHATSAPP");
    expect(content).toContain("MESSAGE_CHANNEL.APP");
  });

  it("uses detected channel for unified message log", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("unifiedMessageLog.addUserMessage(message.content, msgChannel");
  });

  it("uses detected channel for AI response logging", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("unifiedMessageLog.addAssistantMessage(responseContent, msgChannel)");
  });

  it("uses detected channel in conversation messages", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("channel: msgChannel");
  });

  it("logs channel type in classification output", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("`[App] ${msgChannel} message classified:");
  });
});

// === MESSAGING GATEWAY ===

describe("Messaging Gateway - Multi-Channel", () => {
  const filePath = path.join(SERVICES_DIR, "messaging-gateway.js");

  it("gateway file exists", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("supports Firebase, WhatsApp, SMS, and Push channels", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain('FIREBASE: "firebase"');
    expect(content).toContain('WHATSAPP: "whatsapp"');
    expect(content).toContain('SMS: "sms"');
    expect(content).toContain('PUSH: "push"');
  });

  it("initializes all channels", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("await this.realtimeMessaging.initialize(userId)");
    expect(content).toContain("await this.realtimeMessaging.startListening()");
  });

  it("routes messages to best available channel", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("getBestChannel()");
    expect(content).toContain("isChannelAvailable(channel)");
  });

  it("has sendAlert for all channels", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("async sendAlert(alert");
    expect(content).toContain("for (const channel of this.config.enabledChannels)");
  });
});

// === FIRESTORE DATA FORMAT ===

describe("Firestore Data Conversion", () => {
  const filePath = path.join(SERVICES_DIR, "realtime-messaging.js");

  it("parseFirestoreFields handles string, integer, boolean, double, timestamp", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("value.stringValue");
    expect(content).toContain("value.integerValue");
    expect(content).toContain("value.booleanValue");
    expect(content).toContain("value.doubleValue");
    expect(content).toContain("value.timestampValue");
    expect(content).toContain("value.mapValue");
    expect(content).toContain("value.arrayValue");
  });

  it("toFirestoreFields converts JS types to Firestore format", () => {
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("toFirestoreFields");
    expect(content).toContain("stringValue");
    expect(content).toContain("integerValue");
    expect(content).toContain("booleanValue");
    expect(content).toContain("nullValue");
  });
});
