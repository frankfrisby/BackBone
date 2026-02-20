/**
 * Gateway Module Index
 *
 * Usage:
 *   import { getGateway, getAgentRuntime, getSessionLogger } from "./gateway/index.js";
 *
 *   // Start gateway
 *   const gw = getGateway({ port: 18790 });
 *   await gw.start();
 *
 *   // Attach agent runtime
 *   const runtime = getAgentRuntime(gw);
 *
 *   // Log a session
 *   const logger = getSessionLogger("session_123");
 *   logger.logMessage("user", "Hello");
 *
 *   // Daemon control
 *   import { startDaemon, stopDaemon, getDaemonStatus } from "./gateway/daemon.js";
 */

export { GatewayServer, GatewayClient2, getGateway, getGatewayClient, MSG } from "./gateway-server.js";
export { AgentRuntime, getAgentRuntime } from "./agent-runtime.js";
export { SessionLogger, getSessionLogger, listSessions, deleteSession, pruneSessions } from "./session-logger.js";
export { runDaemon, startDaemon, stopDaemon, getDaemonStatus, installDaemon, uninstallDaemon } from "./daemon.js";
