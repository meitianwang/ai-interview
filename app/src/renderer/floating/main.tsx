import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    api?: {
      onSidecarEvent: (callback: (event: unknown) => void) => () => void;
      onAudioLevel: (callback: (level: number) => void) => () => void;
    };
  }
}

function App() {
  const [lastEvent, setLastEvent] = useState<unknown>(null);
  const [level, setLevel] = useState(0);

  useEffect(() => window.api?.onSidecarEvent(setLastEvent), []);
  useEffect(() => window.api?.onAudioLevel(setLevel), []);

  return (
    <div>
      <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>面试助手 · 浮窗</div>
      <div
        style={{
          background: "#333",
          borderRadius: 3,
          height: 6,
          marginBottom: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#6dbf6d",
            height: "100%",
            transition: "width 50ms",
            width: `${Math.round(level * 100)}%`,
          }}
        />
      </div>
      {lastEvent ? (
        <pre style={{ color: "#6dbf6d", fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(formatEvent(lastEvent), null, 2)}
        </pre>
      ) : (
        <div style={{ color: "#9ca3af" }}>等待 sidecar 事件...</div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

function formatEvent(event: unknown) {
  if (
    typeof event === "object" &&
    event !== null &&
    "t" in event &&
    event.t === "audio.chunk" &&
    "p" in event &&
    typeof event.p === "object" &&
    event.p !== null &&
    "pcm_b64" in event.p &&
    typeof event.p.pcm_b64 === "string"
  ) {
    return {
      ...event,
      p: {
        ...event.p,
        pcm_b64: `<${event.p.pcm_b64.length} chars>`,
      },
    };
  }

  return event;
}
