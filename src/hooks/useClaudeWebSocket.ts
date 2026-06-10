import { useEffect, useRef, useCallback, useState } from "react";
import { API_BASE } from "../services/config";
import type { ClaudeWsServerMessage } from "../types/claude";

interface OutputLine {
  data: string;
  stream: "stdout" | "stderr";
  timestamp: string;
}

interface UseClaudeWebSocketReturn {
  output: OutputLine[];
  connected: boolean;
  done: boolean;
  exitCode: number | null;
  duration: number | null;
  sendInput: (data: string) => void;
}

export function useClaudeWebSocket(sessionId: string | null): UseClaudeWebSocketReturn {
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [connected, setConnected] = useState(false);
  const [done, setDone] = useState(false);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const wsUrl = API_BASE.replace(/^http/, "ws").replace(/\/api$/, "") + "/ws/claude";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", sessionId }));
    };

    ws.onmessage = (event) => {
      const msg: ClaudeWsServerMessage = JSON.parse(event.data as string);

      if (msg.type === "output") {
        setOutput((prev) => [
          ...prev,
          {
            data: msg.data,
            stream: msg.stream,
            timestamp: msg.timestamp,
          },
        ]);
      }

      if (msg.type === "done") {
        setDone(true);
        setExitCode(msg.exitCode);
        setDuration(msg.duration);
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setConnected(false);
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    setOutput([]);
    setDone(false);
    setExitCode(null);
    setDuration(null);
  }, [sessionId]);

  const sendInput = useCallback(
    (data: string) => {
      if (wsRef.current?.readyState === WebSocket.OPEN && sessionId) {
        wsRef.current.send(JSON.stringify({ type: "input", sessionId, data }));
      }
    },
    [sessionId],
  );

  return { output, connected, done, exitCode, duration, sendInput };
}
