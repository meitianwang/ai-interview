import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [resume, setResume] = useState("");
  const [jd, setJd] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [huoshanAppId, setHuoshanAppId] = useState("");
  const [huoshanToken, setHuoshanToken] = useState("");
  const [status, setStatus] = useState("未保存");

  useEffect(() => {
    window.api?.loadSettings
      ?.()
      .then((settings) => {
        setResume(settings.resume ?? "");
        setJd(settings.jd ?? "");
        setAnthropicKey(settings.anthropicKey ?? "");
        setOpenaiKey(settings.openaiKey ?? "");
        setHuoshanAppId(settings.huoshanAppId ?? "");
        setHuoshanToken(settings.huoshanToken ?? "");
        setStatus("已加载");
      })
      .catch((error) => {
        console.error("[settings]", error);
        setStatus("加载失败");
      });
  }, []);

  async function save() {
    try {
      await window.api?.saveSettings?.({ resume, jd, anthropicKey, openaiKey, huoshanAppId, huoshanToken });
      setStatus("已保存");
    } catch (error) {
      console.error("[settings]", error);
      setStatus("保存失败");
    }
  }

  return (
    <main style={pageStyle}>
      <header>
        <div style={eyebrowStyle}>AI Interview</div>
        <h1 style={titleStyle}>设置</h1>
      </header>

      <section style={sectionStyle}>
        <Field label="简历 / 项目经历">
          <textarea rows={8} value={resume} onChange={(event) => setResume(event.target.value)} style={textareaStyle} />
        </Field>
        <Field label="目标 JD">
          <textarea rows={5} value={jd} onChange={(event) => setJd(event.target.value)} style={textareaStyle} />
        </Field>
      </section>

      <section style={sectionStyle}>
        <Field label="Anthropic API Key">
          <input type="password" value={anthropicKey} onChange={(event) => setAnthropicKey(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="OpenAI API Key">
          <input type="password" value={openaiKey} onChange={(event) => setOpenaiKey(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="火山引擎 App ID">
          <input value={huoshanAppId} onChange={(event) => setHuoshanAppId(event.target.value)} style={inputStyle} />
        </Field>
        <Field label="火山引擎 Token">
          <input type="password" value={huoshanToken} onChange={(event) => setHuoshanToken(event.target.value)} style={inputStyle} />
        </Field>
      </section>

      <section style={shortcutStyle}>
        <div>触发答案：Cmd/Ctrl + Shift + Space</div>
        <div>中断生成：Cmd/Ctrl + Shift + X</div>
        <div>截屏 OCR：Cmd + Shift + S</div>
      </section>

      <footer style={footerStyle}>
        <button onClick={save} style={buttonStyle}>保存</button>
        <span style={statusStyle}>{status}</span>
      </footer>
    </main>
  );
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={labelStyle}>{props.label}</span>
      {props.children}
    </label>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

const pageStyle: React.CSSProperties = {
  display: "grid",
  gap: 18,
  maxWidth: 760,
};

const eyebrowStyle: React.CSSProperties = {
  color: "#8b9a8b",
  fontSize: 12,
  letterSpacing: 0,
  marginBottom: 6,
};

const titleStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 650,
  margin: 0,
};

const sectionStyle: React.CSSProperties = {
  display: "grid",
  gap: 14,
};

const fieldStyle: React.CSSProperties = {
  color: "#d1d5db",
  display: "grid",
  fontSize: 13,
  gap: 6,
};

const labelStyle: React.CSSProperties = {
  color: "#9ca3af",
};

const inputStyle: React.CSSProperties = {
  background: "#202020",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#f9fafb",
  font: "inherit",
  minHeight: 38,
  outline: "none",
  padding: "8px 10px",
  width: "100%",
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  lineHeight: 1.45,
  resize: "vertical",
};

const shortcutStyle: React.CSSProperties = {
  color: "#9ca3af",
  display: "grid",
  fontSize: 12,
  gap: 6,
};

const footerStyle: React.CSSProperties = {
  alignItems: "center",
  display: "flex",
  gap: 12,
};

const buttonStyle: React.CSSProperties = {
  background: "#6dbf6d",
  border: 0,
  borderRadius: 6,
  color: "#071107",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 650,
  padding: "8px 16px",
};

const statusStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
};
