import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { createProject, listProjects, createProjectAction } from "../services/projects/projects.js";
import { getProjectManager } from "../services/projects/project-manager.js";

const TOOLS = [
  {
    name: "create_project",
    description: "Create a new project workspace",
    inputSchema: {
      type: "object",
      properties: {
    name: { type: "string", description: "Project name" },
    source: { type: "string", description: "Source label (manual, goals, ai)" },
    message: { type: "string", description: "Initial work log message" }
  },
  required: ["name"]
    }
  },

  {
    name: "list_projects",
    description: "List existing projects",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "create_project_action",
    description: "Create a project action folder",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project folder id or name" },
        name: { type: "string", description: "Action name" }
      },
      required: ["project", "name"]
    }
  },
  {
    name: "archive_project",
    description: "Archive a completed/old project. Moves it to .archive/ permanently. Use for projects that are done or no longer active.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name to archive" }
      },
      required: ["name"]
    }
  },
  {
    name: "restore_project",
    description: "Restore an archived project back to active",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Archived project name to restore" }
      },
      required: ["name"]
    }
  },
  {
    name: "list_archived_projects",
    description: "List all archived projects",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_project_status_summary",
    description: "Get count of active, paused, completed, and archived projects",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

const server = new Server(
  {
    name: "backbone-projects",
    version: "1.0.0"
  },
  {
    capabilities: {
      tools: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;

  switch (name) {
    case "create_project": {
      result = createProject(args.name, {
        source: args.source || "ai",
        initialMessage: args.message || ""
      });
      break;
    }
    case "list_projects": {
      result = listProjects();
      break;
    }
    case "create_project_action": {
      result = createProjectAction(args.project, args.name);
      break;
    }
    case "archive_project": {
      const pm = getProjectManager();
      result = pm.archiveProject(args.name);
      break;
    }
    case "restore_project": {
      const pm = getProjectManager();
      result = pm.restoreFromArchive(args.name);
      break;
    }
    case "list_archived_projects": {
      const pm = getProjectManager();
      result = pm.listArchived();
      break;
    }
    case "get_project_status_summary": {
      const pm = getProjectManager();
      result = pm.getStatusSummary();
      break;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2)
      }
    ]
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("BACKBONE Projects MCP Server running");
}

main().catch(console.error);
