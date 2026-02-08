"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface SSEEvent {
  type: string;
  data: any;
  timestamp: string;
}

interface UseEventSourceOptions {
  onEvent?: (event: SSEEvent) => void;
  autoReconnect?: boolean;
  reconnectDelay?: number;
}

/**
 * Hook for consuming Server-Sent Events from the BACKBONE backend.
 * Automatically connects, reconnects on failure, and provides live data.
 */
export function useEventSource(options: UseEventSourceOptions = {}) {
  const { onEvent, autoReconnect = true, reconnectDelay = 3000 } = options;
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (esRef.current) {
      esRef.current.close();
    }

    // Determine SSE URL based on origin
    let sseUrl: string;
    const port = parseInt(window.location.port, 10);
    if (port === 3000 || window.location.pathname.startsWith("/app")) {
      sseUrl = `${window.location.origin}/api/stream`;
    } else {
      sseUrl = "http://localhost:3000/api/stream";
    }

    const es = new EventSource(sseUrl);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const parsed: SSEEvent = JSON.parse(event.data);
        setLastEvent(parsed);
        onEventRef.current?.(parsed);
      } catch {
        // Ignore parse errors (heartbeats, etc.)
      }
    };

    es.onerror = () => {
      setConnected(false);
      es.close();
      esRef.current = null;

      if (autoReconnect) {
        reconnectTimer.current = setTimeout(connect, reconnectDelay);
      }
    };
  }, [autoReconnect, reconnectDelay]);

  useEffect(() => {
    connect();
    return () => {
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current);
      }
    };
  }, [connect]);

  return { connected, lastEvent };
}
