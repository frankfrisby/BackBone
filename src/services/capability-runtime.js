/**
 * Capability Runtime
 *
 * Automatically scaffolds missing user tools and user MCP servers for
 * one-off requests, then registers them in the runtime tool lists.
 */

import fs from "fs";
import path from "path";

import { getUserToolsDir, getUserMcpDir } from "./paths.js";
import { mountMcpServers } from "./mount-user-extensions.js";
import { registerMCPServerDefinition } from "./mcp-tools.js";
import { getMachineProfileManager } from "./machine-profile.js";
import { refreshToolIndex } from "../../tools/tool-loader.js";

const USER_TOOL_INDEX_FILENAME = "index.json";
const USER_MCP_SERVERS_FILENAME = "servers.json";

const CAPABILITY_DEFINITIONS = {
  voice_reservation: {
    id: "voice_reservation",
    keywords: ["reservation", "restaurant", "book table", "dinner", "call restaurant"],
    tools: [
      {
        id: "voice-reservation-call",
        name: "Voice Reservation Call",
        description: "Start an outbound AI voice call to request a restaurant reservation.",
        category: "automation",
        file: "voice-reservation-call.js",
        inputs: {
          restaurant: { type: "string", required: true, description: "Restaurant name" },
          phoneNumber: { type: "string", required: true, description: "Restaurant phone number in E.164 format" },
          partySize: { type: "number", required: true, description: "Party size" },
          dateTime: { type: "string", required: true, description: "Requested reservation datetime" },
          specialRequest: { type: "string", description: "Special request or notes" }
        },
        template: "voice_reservation"
      }
    ],
    mcpServers: [
      {
        id: "backbone-vapi",
        registerOnly: true,
        display: {
          name: "Vapi Voice AI",
          description: "Outbound AI voice calls for reservation and phone workflows",
          tools: [
            { name: "call_user", description: "Place outbound AI voice call" },
            { name: "end_call", description: "End active call" },
            { name: "get_call_status", description: "Get call state and transcript" }
          ]
        }
      }
    ]
  },
  desktop_automation: {
    id: "desktop_automation",
    keywords: ["use my computer", "desktop", "word", "excel", "powerpoint", "open app", "operate browser as me"],
    tools: [
      {
        id: "desktop-task-runner",
        name: "Desktop Task Runner",
        description: "Run desktop-task workflow with explicit action and target details.",
        category: "automation",
        file: "desktop-task-runner.js",
        inputs: {
          task: { type: "string", required: true, description: "Desktop action request" },
          app: { type: "string", description: "Target desktop app (Word, Excel, browser, etc.)" },
          context: { type: "string", description: "Additional context for the task" }
        },
        template: "desktop_runner"
      }
    ],
    mcpServers: [
      {
        id: "user-desktop-automation",
        file: "user-desktop-automation-server.js",
        command: "node",
        display: {
          name: "Desktop Automation",
          description: "User-level desktop automation bridge for local app workflows",
          tools: [
            { name: "run_desktop_task", description: "Execute a requested desktop operation" }
          ]
        }
      }
    ]
  },
  cad_design: {
    id: "cad_design",
    keywords: ["cad", "floor plan", "blueprint", "building design", "architect"],
    tools: [
      {
        id: "cad-floorplan-generator",
        name: "CAD Floorplan Generator",
        description: "Generate baseline floorplan assets and save outputs for future edits.",
        category: "design",
        file: "cad-floorplan-generator.js",
        inputs: {
          projectName: { type: "string", required: true, description: "Project identifier" },
          requirements: { type: "string", required: true, description: "Floorplan requirements" },
          outputDir: { type: "string", description: "Optional output directory path" }
        },
        template: "cad_generator"
      }
    ],
    mcpServers: [
      {
        id: "user-cad-automation",
        file: "user-cad-automation-server.js",
        command: "node",
        display: {
          name: "CAD Automation",
          description: "User-level CAD workflow bridge and floorplan generation",
          tools: [
            { name: "generate_floor_plan", description: "Generate a baseline floorplan artifact" }
          ]
        }
      }
    ]
  }
};

const readJsonSafe = (filePath, fallback) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {}
  return fallback;
};

const writeJsonSafe = (filePath, payload) => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
};

const normalizeText = (value) => String(value || "").toLowerCase().trim();

const detectCapabilityIds = ({ message, analysis }) => {
  const textParts = [
    message,
    analysis?.summary,
    analysis?.category,
    analysis?.riskLevel,
    ...(Array.isArray(analysis?.steps) ? analysis.steps : []),
    ...(Array.isArray(analysis?.suggestedTools) ? analysis.suggestedTools : [])
  ];
  const haystack = normalizeText(textParts.join(" "));
  if (!haystack) return [];

  return Object.values(CAPABILITY_DEFINITIONS)
    .filter(def => def.keywords.some(keyword => haystack.includes(keyword)))
    .map(def => def.id);
};

const renderToolFile = (toolDef) => {
  if (toolDef.template === "voice_reservation") {
    return `import path from "path";
import { pathToFileURL } from "url";

async function loadVapiService() {
  const engineRoot = process.env.BACKBONE_ENGINE_ROOT || process.cwd();
  const target = path.join(engineRoot, "src", "services", "messaging", "vapi-service.js");
  return import(pathToFileURL(target).href);
}

export async function execute(inputs = {}) {
  const restaurant = String(inputs.restaurant || "").trim();
  const phoneNumber = String(inputs.phoneNumber || "").trim();
  const partySize = Number(inputs.partySize || 0);
  const dateTime = String(inputs.dateTime || "").trim();
  const specialRequest = String(inputs.specialRequest || "").trim();

  if (!restaurant || !phoneNumber || !dateTime || !Number.isFinite(partySize) || partySize <= 0) {
    return {
      success: false,
      error: "Missing required fields: restaurant, phoneNumber, partySize, dateTime"
    };
  }

  const promptParts = [
    "You are calling a restaurant to request a reservation.",
    \`Restaurant: \${restaurant}\`,
    \`Reservation request: \${partySize} people at \${dateTime}\`
  ];
  if (specialRequest) {
    promptParts.push(\`Special request: \${specialRequest}\`);
  }
  promptParts.push("Confirm availability, ask for confirmation details, and summarize the outcome.");

  try {
    const { getVapiService } = await loadVapiService();
    const vapi = getVapiService();
    await vapi.initialize();
    const call = await vapi.callUser(promptParts.join("\\n"), { targetNumber: phoneNumber });
    return {
      success: true,
      status: "calling",
      callId: call.id,
      restaurant,
      phoneNumber,
      requestedAt: dateTime
    };
  } catch (error) {
    return {
      success: false,
      error: error.message || "Failed to initiate reservation call"
    };
  }
}
`;
  }

  if (toolDef.template === "cad_generator") {
    return `import fs from "fs";
import path from "path";

export async function execute(inputs = {}) {
  const projectName = String(inputs.projectName || "").trim();
  const requirements = String(inputs.requirements || "").trim();
  const outputDir = String(inputs.outputDir || "").trim();

  if (!projectName || !requirements) {
    return { success: false, error: "projectName and requirements are required" };
  }

  const baseDir = outputDir || path.join(process.cwd(), "data", "cad-projects", projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-"));
  fs.mkdirSync(baseDir, { recursive: true });

  const briefPath = path.join(baseDir, "floorplan-brief.md");
  const svgPath = path.join(baseDir, "floorplan-v1.svg");

  const brief = [
    "# Floorplan Brief",
    "",
    \`Project: \${projectName}\`,
    \`Created: \${new Date().toISOString()}\`,
    "",
    "## Requirements",
    requirements,
    "",
    "## Next Iteration Checklist",
    "- Confirm room dimensions",
    "- Confirm structural constraints",
    "- Export to CAD package when ready"
  ].join("\\n");

  const svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800"><rect x="40" y="40" width="1120" height="720" fill="#f7f7f7" stroke="#111" stroke-width="4"/><text x="80" y="110" font-family="Arial" font-size="38">\${projectName} - Floorplan Draft</text><text x="80" y="170" font-family="Arial" font-size="24">Requirements captured in floorplan-brief.md</text><rect x="80" y="220" width="500" height="250" fill="#ffffff" stroke="#333" stroke-width="3"/><text x="110" y="360" font-family="Arial" font-size="22">Zone A</text><rect x="620" y="220" width="500" height="250" fill="#ffffff" stroke="#333" stroke-width="3"/><text x="650" y="360" font-family="Arial" font-size="22">Zone B</text><rect x="80" y="500" width="1040" height="220" fill="#ffffff" stroke="#333" stroke-width="3"/><text x="110" y="620" font-family="Arial" font-size="22">Common Area</text></svg>\`;

  fs.writeFileSync(briefPath, brief, "utf-8");
  fs.writeFileSync(svgPath, svg, "utf-8");

  return {
    success: true,
    projectName,
    files: {
      briefPath,
      svgPath
    }
  };
}
`;
  }

  return `export async function execute(inputs = {}) {
  return {
    success: false,
    status: "scaffolded",
    message: "This tool was scaffolded automatically. Implement the execution logic for your environment.",
    inputs
  };
}
`;
};

const renderMcpServerFile = ({ id, display }) => {
  const tool = Array.isArray(display?.tools) && display.tools.length > 0
    ? display.tools[0]
    : { name: "run_task", description: "Run server task" };

  return `import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const TOOLS = [
  {
    name: "${tool.name}",
    description: "${tool.description}",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "Task request" }
      },
      required: ["task"]
    }
  }
];

const server = new Server(
  { name: "${id}", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const task = request.params?.arguments?.task || "unspecified";
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: false,
          status: "scaffolded",
          message: "Server scaffold created. Implement platform-specific automation logic.",
          task
        }, null, 2)
      }
    ]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("[${id}] failed:", error.message);
});
`;
};

function ensureUserTool(toolDef) {
  const userToolsDir = getUserToolsDir();
  if (!fs.existsSync(userToolsDir)) {
    fs.mkdirSync(userToolsDir, { recursive: true });
  }

  const indexPath = path.join(userToolsDir, USER_TOOL_INDEX_FILENAME);
  const index = readJsonSafe(indexPath, {
    version: "1.0.0",
    description: "User scaffolded tools",
    tools: [],
    categories: {}
  });

  const existing = (index.tools || []).find(tool => tool.id === toolDef.id);
  if (existing) {
    return { created: false, id: toolDef.id, file: path.join(userToolsDir, existing.file) };
  }

  const toolFilePath = path.join(userToolsDir, toolDef.file);
  fs.writeFileSync(toolFilePath, renderToolFile(toolDef), "utf-8");

  index.tools = index.tools || [];
  index.categories = index.categories || {};
  index.categories[toolDef.category] = index.categories[toolDef.category] || "User-generated capability tools";
  index.tools.push({
    id: toolDef.id,
    name: toolDef.name,
    description: toolDef.description,
    category: toolDef.category,
    file: toolDef.file,
    inputs: toolDef.inputs || {},
    examples: []
  });

  writeJsonSafe(indexPath, index);
  refreshToolIndex();

  return { created: true, id: toolDef.id, file: toolFilePath };
}

function ensureUserMcpServer(serverDef) {
  registerMCPServerDefinition(serverDef.id, serverDef.display || {});

  if (serverDef.registerOnly) {
    return { created: false, id: serverDef.id, registerOnly: true };
  }

  const userMcpDir = getUserMcpDir();
  if (!fs.existsSync(userMcpDir)) {
    fs.mkdirSync(userMcpDir, { recursive: true });
  }

  const serversPath = path.join(userMcpDir, USER_MCP_SERVERS_FILENAME);
  const servers = readJsonSafe(serversPath, {});
  if (servers[serverDef.id]) {
    return { created: false, id: serverDef.id, file: servers[serverDef.id].args?.[0] || null };
  }

  let serverFilePath = null;
  if (serverDef.file) {
    serverFilePath = path.join(userMcpDir, serverDef.file);
    if (!fs.existsSync(serverFilePath)) {
      fs.writeFileSync(serverFilePath, renderMcpServerFile(serverDef), "utf-8");
    }
  }

  servers[serverDef.id] = {
    command: serverDef.command || "node",
    args: serverDef.args || (serverFilePath ? [serverFilePath] : [])
  };

  writeJsonSafe(serversPath, servers);
  return { created: true, id: serverDef.id, file: serverFilePath };
}

function shouldScaffoldTool(capabilityId, machinePlan, toolDef) {
  const decision = machinePlan?.decisions?.[capabilityId];
  if (!decision) return true;

  if (capabilityId === "desktop_automation" && decision.mode === "use_installed" && toolDef.id === "desktop-task-runner") {
    return false;
  }

  // If CAD software already exists, prefer native CAD apps instead of
  // generating fallback CAD files.
  if (
    capabilityId === "cad_design" &&
    (decision.mode === "use_installed" || decision.mode === "install_then_use") &&
    toolDef.id === "cad-floorplan-generator"
  ) {
    return false;
  }

  return true;
}

function shouldScaffoldServer(capabilityId, machinePlan) {
  const decision = machinePlan?.decisions?.[capabilityId];
  if (!decision) return true;

  if (capabilityId === "desktop_automation" && decision.mode === "use_installed") return false;
  if (capabilityId === "cad_design" && (decision.mode === "use_installed" || decision.mode === "install_then_use")) return false;

  return true;
}

class CapabilityRuntime {
  detect({ message, analysis }) {
    return detectCapabilityIds({ message, analysis });
  }

  async ensureForRequest({ message, analysis }) {
    const machineProfileManager = getMachineProfileManager();
    let machineProfile = null;
    try {
      machineProfile = await machineProfileManager.discoverProfile();
    } catch {
      machineProfile = machineProfileManager.loadProfile();
    }

    const capabilityIds = this.detect({ message, analysis });
    const machinePlan = machineProfileManager.planForRequest({
      message,
      analysis,
      capabilityIds,
      machineProfile
    });

    if (capabilityIds.length === 0) {
      return {
        machineProfile,
        machinePlan,
        detectedCapabilities: [],
        scaffoldedTools: [],
        scaffoldedMcpServers: [],
        skippedScaffolds: [],
        mounted: null
      };
    }

    const scaffoldedTools = [];
    const scaffoldedMcpServers = [];
    const skippedScaffolds = [];

    for (const capabilityId of capabilityIds) {
      const def = CAPABILITY_DEFINITIONS[capabilityId];
      if (!def) continue;

      for (const toolDef of def.tools || []) {
        if (!shouldScaffoldTool(capabilityId, machinePlan, toolDef)) {
          skippedScaffolds.push({
            capabilityId,
            toolId: toolDef.id,
            reason: machinePlan?.decisions?.[capabilityId]?.reason || "Machine plan selected installed software route"
          });
          continue;
        }
        const result = ensureUserTool(toolDef);
        if (result.created) {
          scaffoldedTools.push({ capabilityId, ...result });
        }
      }

      for (const serverDef of def.mcpServers || []) {
        if (!shouldScaffoldServer(capabilityId, machinePlan)) {
          skippedScaffolds.push({
            capabilityId,
            serverId: serverDef.id,
            reason: machinePlan?.decisions?.[capabilityId]?.reason || "Machine plan selected installed software route"
          });
          continue;
        }
        const result = ensureUserMcpServer(serverDef);
        if (result.created || result.registerOnly) {
          scaffoldedMcpServers.push({ capabilityId, ...result });
        }
      }
    }

    const mounted = mountMcpServers();

    return {
      machineProfile,
      machinePlan,
      detectedCapabilities: capabilityIds,
      scaffoldedTools,
      scaffoldedMcpServers,
      skippedScaffolds,
      mounted
    };
  }
}

let runtimeInstance = null;

export function getCapabilityRuntime() {
  if (!runtimeInstance) {
    runtimeInstance = new CapabilityRuntime();
  }
  return runtimeInstance;
}

export default {
  getCapabilityRuntime
};
