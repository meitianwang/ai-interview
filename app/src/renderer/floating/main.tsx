import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

declare global {
  interface Window {
    api: {
      onSidecarEvent: (callback: (event: unknown) => void) => () => void;
    };
  }
}

function App() {
  const [lastEvent, setLastEvent] = useState<unknown>(null);

  useEffect(() => window.api.onSidecarEvent(setLastEvent), []);

  return (
    <div>
      <div style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>面试助手 · 浮窗</div>
      {lastEvent ? (
        <pre style={{ color: "#6dbf6d", fontSize: 11, margin: 0, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(lastEvent, null, 2)}
        </pre>
      ) : (
        <div style={{ color: "#9ca3af" }}>等待 sidecar 事件...</div>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
