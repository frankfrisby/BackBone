import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  searchYouTube,
  getTranscript,
  getVideoInfo,
  getChannelVideos,
  researchVideo,
  listResearch,
  getResearch,
  getYouTubeStatus,
} from "../services/integrations/youtube-service.js";

/**
 * BACKBONE YouTube MCP Server
 * Search videos, fetch transcripts, collect knowledge for research
 */

const TOOLS = [
  {
    name: "search_youtube",
    description: "Search YouTube for videos on any topic. Returns titles, channels, view counts, durations, and links. Great for finding educational content, interviews, tutorials, and expert opinions.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (e.g., 'Ray Dalio principles investing', 'AI chip market 2025')" },
        maxResults: { type: "number", description: "Max results to return (default 10, max 20)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_video_transcript",
    description: "Get the full transcript/captions of a YouTube video. Returns timestamped text segments and the complete text. Essential for extracting knowledge from talks, interviews, lectures, and tutorials.",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube video ID or full URL" },
        language: { type: "string", description: "Language code (default 'en')" },
      },
      required: ["videoId"],
    },
  },
  {
    name: "get_video_info",
    description: "Get metadata about a YouTube video: title, channel, description, view count, duration, keywords. Use this before fetching a transcript to understand what the video is about.",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube video ID or full URL" },
      },
      required: ["videoId"],
    },
  },
  {
    name: "get_channel_videos",
    description: "Get recent videos from a YouTube channel. Useful for following thought leaders, researchers, or experts and finding their latest content.",
    inputSchema: {
      type: "object",
      properties: {
        channelId: { type: "string", description: "YouTube channel ID (starts with UC...) or channel URL (e.g., https://youtube.com/@channelname)" },
        maxResults: { type: "number", description: "Max videos to return (default 15)" },
      },
      required: ["channelId"],
    },
  },
  {
    name: "research_video",
    description: "Full research on a video: fetches info + transcript and saves to data/youtube-research/ for persistent knowledge. Use this when you want to deeply study a video's content and save it for future reference.",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube video ID or full URL" },
      },
      required: ["videoId"],
    },
  },
  {
    name: "list_youtube_research",
    description: "List all previously researched YouTube videos saved in the knowledge base. Shows which videos have been studied and their transcript availability.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_youtube_research",
    description: "Retrieve saved research for a specific video from the knowledge base. Returns the full transcript and metadata if previously researched.",
    inputSchema: {
      type: "object",
      properties: {
        videoId: { type: "string", description: "YouTube video ID" },
      },
      required: ["videoId"],
    },
  },
  {
    name: "youtube_status",
    description: "Check YouTube integration status: whether search, video info, and transcript capabilities are available. Shows if cookies are configured for full transcript access.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
];

// Create server
const server = new Server(
  { name: "backbone-youtube", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case "search_youtube": {
        const maxResults = Math.min(args.maxResults || 10, 20);
        result = await searchYouTube(args.query, maxResults);
        break;
      }

      case "get_video_transcript": {
        result = await getTranscript(args.videoId, args.language || "en");
        break;
      }

      case "get_video_info": {
        result = await getVideoInfo(args.videoId);
        break;
      }

      case "get_channel_videos": {
        result = await getChannelVideos(args.channelId, args.maxResults || 15);
        break;
      }

      case "research_video": {
        result = await researchVideo(args.videoId);
        break;
      }

      case "list_youtube_research": {
        result = listResearch();
        break;
      }

      case "get_youtube_research": {
        result = getResearch(args.videoId);
        if (!result) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: `No saved research for video ${args.videoId}. Use research_video to fetch and save it first.` }) }],
          };
        }
        break;
      }

      case "youtube_status": {
        result = getYouTubeStatus();
        break;
      }

      default:
        return {
          content: [{ type: "text", text: JSON.stringify({ error: `Unknown tool: ${name}` }) }],
          isError: true,
        };
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: error.message }) }],
      isError: true,
    };
  }
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[backbone-youtube] YouTube MCP server running");
}

main().catch(console.error);
