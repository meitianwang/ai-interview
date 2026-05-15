import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import "highlight.js/styles/github-dark.css";

function App() {
  const [sidecarStatus, setSidecarStatus] = useState("等待 sidecar 事件...");
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [generating, setGenerating] = useState(false);
  const [shareActive, setShareActive] = useState(false);
  const [ocr, setOCR] = useState("");

  useEffect(() => window.api?.onSidecarEvent?.((event) => setSidecarStatus(formatEventStatus(event))), []);
  useEffect(() => window.api?.onAudioLevel?.(setLevel), []);
  useEffect(() => window.api?.onTranscript?.(setTranscript), []);
  useEffect(() => window.api?.onShareState?.(setShareActive), []);
  useEffect(() => window.api?.onOCR?.(setOCR), []);
  useEffect(() => window.api?.onAnswerStart?.(() => {
    setAnswer("");
    setGenerating(true);
  }), []);
  useEffect(() => window.api?.onAnswerToken?.((token) => setAnswer((current) => current + token)), []);
  useEffect(() => window.api?.onAnswerDone?.(() => setGenerating(false)), []);

  return (
    <div>
      <div style={dragHeaderStyle}>
        <span>面试助手 · 浮窗</span>
        <span style={{ color: "#4b5563", letterSpacing: 1 }}>·····</span>
      </div>
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
      <div style={{ color: "#d1d5db", fontSize: 13, marginBottom: 8, whiteSpace: "pre-wrap" }}>
        {transcript || <span style={{ color: "#6b7280" }}>聆听中...</span>}
      </div>
      {ocr ? (
        <div style={{ color: "#d1d5db", fontSize: 12, marginBottom: 8, whiteSpace: "pre-wrap" }}>
          题面：{truncate(ocr, 80)}
        </div>
      ) : null}
      <div style={{ color: "#6dbf6d", fontSize: 11, marginBottom: 6 }}>
        建议答案{generating ? " · 生成中" : ""}
      </div>
      <div style={answerMarkdownStyle}>
        {answer ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={markdownComponents}>
            {answer}
          </ReactMarkdown>
        ) : (
          <span style={{ color: "#6b7280" }}>按 Ctrl/Cmd+Shift+Space 触发，Ctrl/Cmd+Shift+X 中断</span>
        )}
      </div>
      <div style={{ color: shareActive ? "#fbbf24" : "#6b7280", fontSize: 11 }}>
        {shareActive ? "屏幕共享检测中" : sidecarStatus}
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

function formatEventStatus(event: unknown): string {
  if (!isSidecarEvent(event)) {
    return "sidecar 事件已接收";
  }

  return `sidecar ${event.t} #${event.seq}`;
}

function isSidecarEvent(event: unknown): event is { t: string; seq: number } {
  return (
    typeof event === "object" &&
    event !== null &&
    "t" in event &&
    typeof event.t === "string" &&
    "seq" in event &&
    typeof event.seq === "number"
  );
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

const answerMarkdownStyle: React.CSSProperties = {
  color: "#f9fafb",
  fontSize: 13,
  lineHeight: 1.45,
  marginBottom: 8,
  maxHeight: 92,
  overflowY: "auto",
};

const dragHeaderStyle = {
  WebkitAppRegion: "drag",
  alignItems: "center",
  color: "#9ca3af",
  display: "flex",
  fontSize: 12,
  justifyContent: "space-between",
  marginBottom: 8,
  minHeight: 22,
} as React.CSSProperties & { WebkitAppRegion: string };

const markdownComponents = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => <p style={{ margin: "0 0 6px" }} {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => <ul style={{ margin: "0 0 6px", paddingLeft: 18 }} {...props} />,
  ol: (props: React.HTMLAttributes<HTMLOListElement>) => <ol style={{ margin: "0 0 6px", paddingLeft: 18 }} {...props} />,
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => <li style={{ marginBottom: 2 }} {...props} />,
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre
      style={{
        background: "#111827",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        fontSize: 12,
        margin: "4px 0 8px",
        overflowX: "auto",
        padding: "8px 10px",
      }}
      {...props}
    />
  ),
  code: (props: React.HTMLAttributes<HTMLElement>) => (
    <code
      style={{
        borderRadius: 4,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: "0.92em",
      }}
      {...props}
    />
  ),
};
