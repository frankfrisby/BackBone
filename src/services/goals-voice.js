import fs from "fs";
import path from "path";
import WebSocket from "ws";
import { spawn } from "child_process";

/**
 * Goals Voice Service - OpenAI Realtime API
 *
 * Opens a voice conversation to help users set and refine their goals.
 * Uses OpenAI's Realtime API for real-time speech-to-speech interaction.
 */

const DATA_DIR = path.join(process.cwd(), "data");
const GOALS_PATH = path.join(DATA_DIR, "goals.json");

// OpenAI Realtime API endpoint
const REALTIME_API_URL = "wss://api.openai.com/v1/realtime";
const REALTIME_MODEL = "gpt-4o-realtime-preview-2024-12-17";

/**
 * Check if OpenAI API key is configured
 */
export const getOpenAIConfig = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  return {
    apiKey,
    ready: Boolean(apiKey),
    model: REALTIME_MODEL
  };
};

/**
 * Load current goals from disk
 */
export const loadGoals = () => {
  try {
    if (fs.existsSync(GOALS_PATH)) {
      return JSON.parse(fs.readFileSync(GOALS_PATH, "utf-8"));
    }
  } catch (err) {
    console.error("[Goals Voice] Error loading goals:", err.message);
  }
  return { goals: [], lastUpdated: null };
};

/**
 * Save goals to disk
 */
export const saveGoals = (goals) => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      goals,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(GOALS_PATH, JSON.stringify(data, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

/**
 * Build system prompt for goals conversation
 */
const buildGoalsSystemPrompt = (currentGoals) => {
  const goalsContext = currentGoals.length > 0
    ? `Current goals:\n${currentGoals.map((g, i) => `${i + 1}. ${g.title} (${g.category}) - ${g.status}`).join("\n")}`
    : "No goals currently set.";

  return `You are a friendly life coach helping the user define and refine their personal goals.

${goalsContext}

Your role:
1. Ask about what matters most to them in life
2. Help them articulate specific, measurable goals
3. Categorize goals into: finance, health, family, career, growth, education
4. Set priority levels (1=critical, 2=high, 3=medium, 4=low)
5. Define milestones for tracking progress

Be conversational, warm, and encouraging. Ask one question at a time.
When the user is done, summarize the goals you've captured.

Start by greeting them and asking what areas of life they want to focus on.`;
};

/**
 * Start voice session with OpenAI Realtime API
 * This creates a WebSocket connection for real-time audio streaming
 */
export const startVoiceSession = async (options = {}) => {
  const config = getOpenAIConfig();

  if (!config.ready) {
    return {
      success: false,
      error: "OPENAI_API_KEY not configured",
      action: "Please add your OpenAI API key to .env file or run /models to set it up"
    };
  }

  const currentGoals = loadGoals().goals || [];

  return new Promise((resolve) => {
    try {
      console.log("[Goals Voice] Connecting to OpenAI Realtime API...");

      const ws = new WebSocket(`${REALTIME_API_URL}?model=${REALTIME_MODEL}`, {
        headers: {
          "Authorization": `Bearer ${config.apiKey}`,
          "OpenAI-Beta": "realtime=v1"
        }
      });

      let sessionId = null;
      const transcript = [];

      ws.on("open", () => {
        console.log("[Goals Voice] Connected to OpenAI Realtime API");

        // Configure the session
        ws.send(JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["text", "audio"],
            instructions: buildGoalsSystemPrompt(currentGoals),
            voice: "alloy",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: {
              model: "whisper-1"
            },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500
            }
          }
        }));

        // Start the conversation
        ws.send(JSON.stringify({
          type: "response.create",
          response: {
            modalities: ["text", "audio"],
            instructions: "Greet the user warmly and ask what areas of life they want to set goals for."
          }
        }));
      });

      ws.on("message", (data) => {
        try {
          const event = JSON.parse(data.toString());

          switch (event.type) {
            case "session.created":
              sessionId = event.session?.id;
              console.log("[Goals Voice] Session created:", sessionId);
              break;

            case "response.audio_transcript.delta":
              // Real-time transcript of AI response
              if (event.delta) {
                process.stdout.write(event.delta);
              }
              break;

            case "response.audio_transcript.done":
              // Full AI response transcript
              if (event.transcript) {
                transcript.push({ role: "assistant", content: event.transcript });
                console.log("\n");
              }
              break;

            case "conversation.item.input_audio_transcription.completed":
              // User's speech transcribed
              if (event.transcript) {
                console.log(`[You]: ${event.transcript}`);
                transcript.push({ role: "user", content: event.transcript });
              }
              break;

            case "error":
              console.error("[Goals Voice] Error:", event.error?.message || event);
              break;

            case "session.updated":
              console.log("[Goals Voice] Session configured");
              break;
          }
        } catch (err) {
          // Ignore parse errors for binary audio data
        }
      });

      ws.on("error", (err) => {
        console.error("[Goals Voice] WebSocket error:", err.message);
        resolve({
          success: false,
          error: err.message
        });
      });

      ws.on("close", (code, reason) => {
        console.log("[Goals Voice] Session ended");
        resolve({
          success: true,
          sessionId,
          transcript,
          message: "Voice session completed"
        });
      });

      // Store websocket for external control
      if (options.onSession) {
        options.onSession({
          ws,
          sessionId,
          close: () => ws.close(),
          sendAudio: (audioData) => {
            ws.send(JSON.stringify({
              type: "input_audio_buffer.append",
              audio: audioData.toString("base64")
            }));
          },
          commitAudio: () => {
            ws.send(JSON.stringify({
              type: "input_audio_buffer.commit"
            }));
          }
        });
      }

    } catch (err) {
      resolve({
        success: false,
        error: err.message
      });
    }
  });
};

/**
 * Launch standalone voice app for goals
 * Opens a separate terminal/process for the voice conversation
 */
export const launchGoalsVoiceApp = async () => {
  const config = getOpenAIConfig();

  if (!config.ready) {
    return {
      success: false,
      needsSetup: true,
      error: "OpenAI API key not configured",
      message: "Please run /models to set up your OpenAI API key first"
    };
  }

  // Check if goals exist
  const currentGoals = loadGoals();
  const hasGoals = currentGoals.goals && currentGoals.goals.length > 0;

  console.log("[Goals Voice] Launching voice app...");
  console.log(hasGoals
    ? `[Goals Voice] You have ${currentGoals.goals.length} existing goals`
    : "[Goals Voice] No goals set yet - let's create some!");

  // Start the voice session
  const result = await startVoiceSession({
    onSession: (session) => {
      console.log("[Goals Voice] Voice session active. Speak to set your goals.");
      console.log("[Goals Voice] Press Ctrl+C to end the session.");

      // Handle graceful shutdown
      process.on("SIGINT", () => {
        console.log("\n[Goals Voice] Ending session...");
        session.close();
      });
    }
  });

  return result;
};

/**
 * Quick check if goals are configured
 */
export const hasGoalsConfigured = () => {
  const goals = loadGoals();
  return goals.goals && goals.goals.length > 0;
};

/**
 * Get goals status for display
 */
export const getGoalsStatus = () => {
  const config = getOpenAIConfig();
  const goals = loadGoals();

  return {
    openaiReady: config.ready,
    goalsCount: goals.goals?.length || 0,
    lastUpdated: goals.lastUpdated,
    categories: [...new Set(goals.goals?.map(g => g.category) || [])],
    needsSetup: !config.ready,
    needsGoals: !goals.goals?.length
  };
};

export default {
  getOpenAIConfig,
  loadGoals,
  saveGoals,
  startVoiceSession,
  launchGoalsVoiceApp,
  hasGoalsConfigured,
  getGoalsStatus
};
