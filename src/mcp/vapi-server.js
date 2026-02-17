/**
 * BACKBONE Vapi Voice AI MCP Server
 *
 * Provides tools for triggering phone calls via Vapi.
 * Allows Claude Code to programmatically call the user.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Tool definitions
const TOOLS = [
  {
    name: "call_user",
    description: "Call the user or a provided phone number via Vapi AI voice (Cole persona).",
    inputSchema: {
      type: "object",
      properties: {
        systemPrompt: {
          type: "string",
          description: "Optional custom system prompt for the voice assistant. If not provided, uses default BACKBONE Cole persona.",
        },
        targetNumber: {
          type: "string",
          description: "Optional E.164 phone number override (for example, a restaurant). If omitted, calls the user's configured phone number.",
        },
      },
      required: [],
    },
  },
  {
    name: "end_call",
    description: "End the active Vapi phone call",
    inputSchema: {
      type: "object",
      properties: {
        callId: {
          type: "string",
          description: "Optional call ID. If not provided, ends the current active call.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_call_status",
    description: "Get the status of the current Vapi call including transcript and background tasks",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Create server
const server = new Server(
  {
    name: "backbone-vapi",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  // Dynamic import to avoid circular deps
  const { getVapiService } = await import("../services/messaging/vapi-service.js");
  const vapi = getVapiService();

  let result;

  switch (name) {
    case "call_user": {
      try {
        await vapi.initialize();
        const call = await vapi.callUser(args?.systemPrompt, { targetNumber: args?.targetNumber });
        result = {
          success: true,
          callId: call.id,
          targetNumber: args?.targetNumber || null,
          message: args?.targetNumber
            ? "Phone call initiated to provided target number."
            : "Phone call initiated to the user's configured number."
        };
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    case "end_call": {
      try {
        await vapi.endCall(args?.callId);
        result = { success: true, message: "Call ended." };
      } catch (err) {
        result = { success: false, error: err.message };
      }
      break;
    }

    case "get_call_status": {
      result = vapi.getCallStatus();
      break;
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Vapi MCP Server running");
}

main().catch(console.error);
