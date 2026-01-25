import { useState, useEffect, useCallback, useRef } from "react";
import { getClaudeCodeBackend, TASK_STATUS, STREAM_MESSAGE_TYPE } from "../services/claude-code-backend.js";

/**
 * React Hook for Claude Code integration in Ink components
 *
 * Provides real-time streaming output from Claude Code CLI
 * for display in your engine view.
 *
 * Usage:
 * ```js
 * const {
 *   isRunning,
 *   output,
 *   toolCalls,
 *   sessionId,
 *   start,
 *   stop,
 *   continueSession,
 * } = useClaudeCode();
 *
 * // Start a task
 * await start("Research AI jobs in DC", "/path/to/working/dir");
 *
 * // Continue the conversation
 * await continueSession("Now find remote positions");
 *
 * // Stop if needed
 * stop();
 * ```
 */
export const useClaudeCode = (options = {}) => {
  const backend = getClaudeCodeBackend();

  // State
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState("idle"); // idle, running, completed, failed
  const [output, setOutput] = useState([]);     // Array of output lines/chunks
  const [toolCalls, setToolCalls] = useState([]); // Tool usage history
  const [currentTool, setCurrentTool] = useState(null); // Currently executing tool
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Refs for cleanup
  const outputRef = useRef([]);
  const toolCallsRef = useRef([]);

  // Initialize backend
  useEffect(() => {
    backend.initialize();
  }, []);

  // Subscribe to streaming events
  useEffect(() => {
    const handleText = ({ text }) => {
      if (text) {
        const entry = { type: "text", content: text, timestamp: Date.now() };
        outputRef.current = [...outputRef.current, entry];
        setOutput([...outputRef.current]);
      }
    };

    const handleToolUse = ({ tool, input }) => {
      const entry = {
        type: "tool_use",
        tool,
        input,
        status: "running",
        timestamp: Date.now()
      };
      toolCallsRef.current = [...toolCallsRef.current, entry];
      setToolCalls([...toolCallsRef.current]);
      setCurrentTool({ tool, input });

      // Also add to output for display
      outputRef.current = [...outputRef.current, {
        type: "tool_start",
        tool,
        input: typeof input === "string" ? input : JSON.stringify(input).slice(0, 100),
        timestamp: Date.now()
      }];
      setOutput([...outputRef.current]);
    };

    const handleToolResult = ({ result }) => {
      // Update the last tool call with result
      if (toolCallsRef.current.length > 0) {
        const updated = [...toolCallsRef.current];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          result,
          status: "completed"
        };
        toolCallsRef.current = updated;
        setToolCalls(updated);
      }
      setCurrentTool(null);

      // Add result to output
      const resultPreview = typeof result === "string"
        ? result.slice(0, 200)
        : JSON.stringify(result).slice(0, 200);
      outputRef.current = [...outputRef.current, {
        type: "tool_result",
        content: resultPreview,
        timestamp: Date.now()
      }];
      setOutput([...outputRef.current]);
    };

    const handleComplete = ({ sessionId: sid, result: res }) => {
      setIsRunning(false);
      setStatus("completed");
      setCurrentTool(null);
      if (sid) setSessionId(sid);
      if (res) setResult(res);
    };

    const handleError = ({ error: err }) => {
      setIsRunning(false);
      setStatus("failed");
      setCurrentTool(null);
      setError(err);
    };

    const handleStarted = () => {
      setIsRunning(true);
      setStatus("running");
      setError(null);
    };

    // Subscribe
    backend.on("stream-text", handleText);
    backend.on("stream-tool-use", handleToolUse);
    backend.on("stream-tool-result", handleToolResult);
    backend.on("stream-result", handleComplete);
    backend.on("task-completed", handleComplete);
    backend.on("stream-error", handleError);
    backend.on("task-failed", handleError);
    backend.on("task-started", handleStarted);

    // Cleanup
    return () => {
      backend.off("stream-text", handleText);
      backend.off("stream-tool-use", handleToolUse);
      backend.off("stream-tool-result", handleToolResult);
      backend.off("stream-result", handleComplete);
      backend.off("task-completed", handleComplete);
      backend.off("stream-error", handleError);
      backend.off("task-failed", handleError);
      backend.off("task-started", handleStarted);
    };
  }, []);

  /**
   * Start a new Claude Code session
   */
  const start = useCallback(async (prompt, workDir, taskOptions = {}) => {
    // Clear previous output
    outputRef.current = [];
    toolCallsRef.current = [];
    setOutput([]);
    setToolCalls([]);
    setError(null);
    setResult(null);
    setCurrentTool(null);

    return backend.executeStreamingTask({
      prompt,
      workDir,
      ...options,
      ...taskOptions
    });
  }, [options]);

  /**
   * Continue the most recent conversation
   */
  const continueSession = useCallback(async (prompt, taskOptions = {}) => {
    return backend.continueSession(prompt, { ...options, ...taskOptions });
  }, [options]);

  /**
   * Resume a specific session
   */
  const resumeSession = useCallback(async (sid, prompt, taskOptions = {}) => {
    return backend.resumeSession(sid, prompt, { ...options, ...taskOptions });
  }, [options]);

  /**
   * Stop the current task
   */
  const stop = useCallback(() => {
    backend.stopAll();
    setIsRunning(false);
    setStatus("cancelled");
    setCurrentTool(null);
  }, []);

  /**
   * Clear output and reset state
   */
  const clear = useCallback(() => {
    outputRef.current = [];
    toolCallsRef.current = [];
    setOutput([]);
    setToolCalls([]);
    setError(null);
    setResult(null);
    setCurrentTool(null);
    setStatus("idle");
  }, []);

  /**
   * Get formatted output for display
   * Returns a single string with all output combined
   */
  const getFormattedOutput = useCallback(() => {
    return output.map(entry => {
      switch (entry.type) {
        case "text":
          return entry.content;
        case "tool_start":
          return `\n● ${entry.tool}(${entry.input})`;
        case "tool_result":
          return `  → ${entry.content}`;
        default:
          return entry.content || "";
      }
    }).join("\n");
  }, [output]);

  /**
   * Get the last N output entries
   */
  const getRecentOutput = useCallback((n = 10) => {
    return output.slice(-n);
  }, [output]);

  return {
    // State
    isRunning,
    status,
    output,
    toolCalls,
    currentTool,
    sessionId,
    error,
    result,

    // Actions
    start,
    continueSession,
    resumeSession,
    stop,
    clear,

    // Helpers
    getFormattedOutput,
    getRecentOutput,

    // Backend access
    backend,
    isAvailable: backend.getStatus().available
  };
};

/**
 * Simpler hook that just returns the last few lines of output
 * Good for status displays
 */
export const useClaudeCodeStatus = () => {
  const backend = getClaudeCodeBackend();
  const [lastActivity, setLastActivity] = useState(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const handleActivity = (data) => {
      setLastActivity({
        type: data.tool || "text",
        content: data.text || data.tool || "",
        timestamp: Date.now()
      });
    };

    const handleRunning = () => setIsRunning(true);
    const handleDone = () => setIsRunning(false);

    backend.on("stream-text", handleActivity);
    backend.on("stream-tool-use", handleActivity);
    backend.on("task-started", handleRunning);
    backend.on("task-completed", handleDone);
    backend.on("task-failed", handleDone);

    return () => {
      backend.off("stream-text", handleActivity);
      backend.off("stream-tool-use", handleActivity);
      backend.off("task-started", handleRunning);
      backend.off("task-completed", handleDone);
      backend.off("task-failed", handleDone);
    };
  }, []);

  return { lastActivity, isRunning };
};

export default useClaudeCode;
