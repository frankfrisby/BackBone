import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { loadIndex, runTool, getCategories, refreshToolIndex } from "../../tools/tool-loader.js";

/**
 * BACKBONE Tools MCP Server
 * Dynamically exposes ALL registered tools (engine + user + forged) as MCP tools.
 * Any tool added to tools/index.json is immediately available via MCP.
 */

function buildMcpTools() {
  const index = loadIndex();
  const tools = index.tools || [];

  return [
    {
      name: "list_tools",
      description: "List all available BACKBONE tools with their descriptions and inputs",
      inputSchema: {
        type: "object",
        properties: {
          category: { type: "string", description: "Filter by category (optional)" },
        },
        required: [],
      },
    },
    {
      name: "run_tool",
      description: "Run any registered BACKBONE tool by ID with the given inputs",
      inputSchema: {
        type: "object",
        properties: {
          toolId: { type: "string", description: "Tool ID (e.g., 'add-conviction', 'health-check')" },
          inputs: { type: "object", description: "Tool inputs as key-value pairs" },
        },
        required: ["toolId"],
      },
    },
    {
      name: "list_categories",
      description: "List available tool categories",
      inputSchema: { type: "object", properties: {}, required: [] },
    },
    // Dynamically generate one MCP tool per registered tool
    ...tools.map(t => ({
      name: `tool_${t.id.replace(/-/g, "_")}`,
      description: `[Tool] ${t.description}`,
      inputSchema: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(t.inputs || {}).map(([key, schema]) => [
            key,
            {
              type: schema.type || "string",
              description: schema.description || key,
              ...(schema.default !== undefined ? { default: schema.default } : {}),
            },
          ])
        ),
        required: Object.entries(t.inputs || {})
          .filter(([, s]) => s.required)
          .map(([k]) => k),
      },
    })),
  ];
}

const server = new Server(
  { name: "backbone-tools", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  // Refresh index each time so newly forged tools appear immediately
  refreshToolIndex();
  return { tools: buildMcpTools() };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  if (name === "list_tools") {
    refreshToolIndex();
    const index = loadIndex();
    let tools = index.tools || [];
    if (args.category) tools = tools.filter(t => t.category === args.category);
    result = tools.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      inputs: t.inputs,
    }));
  } else if (name === "run_tool") {
    result = await runTool(args.toolId, args.inputs || {});
  } else if (name === "list_categories") {
    result = getCategories();
  } else if (name.startsWith("tool_")) {
    // Dynamic tool call: tool_add_conviction → add-conviction
    const toolId = name.replace(/^tool_/, "").replace(/_/g, "-");
    result = await runTool(toolId, args || {});
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Tools MCP Server running");
}

main().catch(console.error);
