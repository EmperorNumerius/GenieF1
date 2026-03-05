/**
 * AIInsightsFeed component
 *
 * Displays live AI race-engineer insights streamed over a WebSocket.
 * Requires a valid, paid session token.
 *
 * Props:
 *   token      – session token string
 *   onUnlockRequired – callback fired when the token is invalid / not paid
 */

import { useEffect, useRef, useState } from "react";

const WS_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
  .replace(/^http/, "ws");

const MAX_MESSAGES = 50;

export default function AIInsightsFeed({ token, onUnlockRequired }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("connecting"); // connecting | live | closed | error
  const wsRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!token) {
      onUnlockRequired?.();
      return;
    }

    const ws = new WebSocket(`${WS_URL}/ws/insights/${token}`);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => setStatus("live");

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const msg = {
          id: Date.now() + Math.random(),
          driver: data.driver,
          insight: data.insight,
          telemetry: data.telemetry,
          timestamp: new Date().toLocaleTimeString(),
        };
        setMessages((prev) =>
          [msg, ...prev].slice(0, MAX_MESSAGES)
        );
      } catch (_) {}
    };

    ws.onerror = () => setStatus("error");

    ws.onclose = (ev) => {
      // Code 4003 means the session is not unlocked
      if (ev.code === 4003) {
        setStatus("locked");
        onUnlockRequired?.();
      } else {
        setStatus("closed");
      }
    };

    return () => ws.close();
  }, [token]);

  // Auto-scroll to newest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const statusBadge = {
    connecting: (
      <span className="text-yellow-400 animate-pulse text-xs font-semibold">
        ⚡ Connecting…
      </span>
    ),
    live: (
      <span className="flex items-center gap-1 text-green-400 text-xs font-semibold">
        <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        LIVE
      </span>
    ),
    closed: (
      <span className="text-gray-400 text-xs">Connection closed</span>
    ),
    error: (
      <span className="text-red-400 text-xs">Connection error</span>
    ),
    locked: (
      <span className="text-orange-400 text-xs">Session locked</span>
    ),
  }[status];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black uppercase tracking-widest text-white">
          🤖 AI Engineer Feed
        </h3>
        {statusBadge}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.length === 0 && status === "live" && (
          <p className="text-gray-500 text-sm text-center pt-6">
            Waiting for next lap data…
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className="bg-f1gray rounded-xl p-3 border border-gray-700"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-black text-f1red uppercase tracking-wider">
                Car #{msg.driver}
              </span>
              <span className="text-xs text-gray-500">{msg.timestamp}</span>
            </div>
            <p className="text-sm text-gray-200 leading-snug">{msg.insight}</p>
            {msg.telemetry && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-gray-500">
                <span>P{msg.telemetry.position}</span>
                <span>
                  {msg.telemetry.tire_compound} – {msg.telemetry.tire_age}L
                </span>
                {msg.telemetry.last_lap && (
                  <span>{Number(msg.telemetry.last_lap).toFixed(3)}s</span>
                )}
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
