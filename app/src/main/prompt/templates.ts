import { formatProblemStatement } from "../ocr/ProblemStatementParser";

export const SYSTEM_TECHNICAL =
  "你是候选人的实时面试助手。请在 3 个 bullet 内给出技术题的回答大纲，每个 bullet 不超过 25 字。需要写代码时另起代码块。先大纲、必要时再展开。语言：中文。";

export const SYSTEM_BEHAVIORAL =
  "你是候选人的实时面试助手。这是行为面试题。请用流畅的第一人称段落给出回答，约 80-150 字，结合候选人简历中的具体经历，结尾点出对应到目标岗位的价值。语言：中文。";

export const SYSTEM_GENERAL =
  "你是候选人的实时面试助手。请简洁、口语化地回答候选人面前的面试问题，控制在 80 字以内。语言：中文。";

export function buildUserPrompt(context: {
  resume: string;
  jd: string;
  ocr: string;
  transcript: string;
  history: Array<{ q: string; a: string }>;
}): string {
  const history =
    context.history.length > 0
      ? `本场前面问过：\n${context.history
          .slice(-3)
          .map((item) => `Q: ${item.q}\nA: ${item.a}`)
          .join("\n\n")}\n\n`
      : "";
  const screenProblem = context.ocr ? formatProblemStatement(context.ocr) : "";
  const ocr = screenProblem ? `${screenProblem}\n\n` : "";

  return `候选人简历：
${context.resume || "（暂无）"}

目标岗位 JD：
${context.jd || "（暂无）"}

${ocr}面试官最近说：
${context.transcript || "（暂无）"}

${history}请给出回答。`;
}
