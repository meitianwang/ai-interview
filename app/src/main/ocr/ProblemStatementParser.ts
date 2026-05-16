export type ProblemSource = "leetcode" | "niuke" | "hackerrank" | "generic";

export interface ParsedProblemStatement {
  body: string;
  confidence: number;
  constraints?: string;
  examples: string[];
  source: ProblemSource;
  title?: string;
}

const MAX_FIELD_LENGTH = 2400;
const SOURCE_LINE = /^(leetcode|力扣|nowcoder|牛客|hackerrank)$/i;
const NAVIGATION_LINE =
  /^(题解|提交记录|评论|通过次数|相关企业|收藏|分享|讨论|最佳题解|运行代码|提交代码|执行代码|解答错误|全部题解|description|submissions|solutions|discuss|editorial)$/i;
const CODE_OR_PROBLEM_HINT = /\b(function|class|def|return|public|private|input|output|constraints|example)\b|输入|输出|示例|复杂度|链表|数组|二叉树|算法|实现/i;

export function parseProblemStatement(rawText: string): ParsedProblemStatement | null {
  const lines = normalizeLines(rawText);
  if (lines.length === 0) {
    return null;
  }

  const source = detectSource(rawText);
  const title = extractTitle(lines, source);
  const examples = extractExamples(lines);
  const constraints = extractConstraints(lines);
  const body = extractBody(lines, title, examples, constraints);
  const confidence = confidenceFor({ body, examples, constraints, source, title });
  if (confidence < 0.7) {
    return null;
  }

  return {
    body: truncate(body),
    confidence,
    constraints: constraints ? truncate(constraints) : undefined,
    examples: examples.map(truncate),
    source,
    title,
  };
}

export function formatProblemStatement(rawText: string): string {
  const parsed = parseProblemStatement(rawText);
  if (!parsed) {
    return "";
  }

  const chunks = [`屏幕上的题面（${parsed.source}，置信度 ${parsed.confidence.toFixed(2)}）：`];
  if (parsed.title) {
    chunks.push(`标题：${parsed.title}`);
  }
  if (parsed.body) {
    chunks.push(`正文：\n${parsed.body}`);
  }
  if (parsed.examples.length > 0) {
    chunks.push(`示例：\n${parsed.examples.join("\n\n")}`);
  }
  if (parsed.constraints) {
    chunks.push(`约束：\n${parsed.constraints}`);
  }

  return chunks.join("\n");
}

function normalizeLines(rawText: string): string[] {
  return rawText
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 && !SOURCE_LINE.test(line) && !NAVIGATION_LINE.test(line));
}

function detectSource(rawText: string): ProblemSource {
  const text = rawText.toLowerCase();
  if (text.includes("leetcode") || text.includes("力扣")) {
    return "leetcode";
  }
  if (text.includes("nowcoder") || text.includes("牛客")) {
    return "niuke";
  }
  if (text.includes("hackerrank")) {
    return "hackerrank";
  }

  return "generic";
}

function extractTitle(lines: string[], source: ProblemSource): string | undefined {
  const patterns =
    source === "niuke"
      ? [/^(?:NC|BM|HJ)\d+\s+(.+)$/i, /^\d+\.\s+(.+)$/]
      : [/^\d+\.\s+(.+)$/, /^([A-Z][A-Za-z0-9 ,.'-]{6,80})$/];

  for (const line of lines.slice(0, 8)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return undefined;
}

function extractExamples(lines: string[]): string[] {
  const examples: string[] = [];
  let current: string[] = [];
  let inExample = false;

  for (const line of lines) {
    if (/^(示例|例子|example)\s*\d*[:：]?/i.test(line)) {
      flushExample();
      inExample = true;
      current.push(line);
      continue;
    }
    if (/^(提示|constraints?)[:：]?/i.test(line)) {
      flushExample();
      inExample = false;
      continue;
    }
    if (inExample && /^(输入|输出|解释|input|output|explanation)[:：]/i.test(line)) {
      current.push(line);
      continue;
    }
    if (inExample && current.length > 0 && current.join(" ").length < 800) {
      current.push(line);
      continue;
    }
    flushExample();
    inExample = false;
  }
  flushExample();

  return examples.slice(0, 3);

  function flushExample() {
    if (current.length > 0) {
      examples.push(current.join("\n"));
      current = [];
    }
  }
}

function extractConstraints(lines: string[]): string | undefined {
  const start = lines.findIndex((line) => /^(提示|constraints?)[:：]?/i.test(line));
  if (start < 0) {
    return undefined;
  }

  const collected: string[] = [];
  for (const line of lines.slice(start, start + 8)) {
    if (/^(相关|进阶|follow up)[:：]?/i.test(line)) {
      break;
    }
    collected.push(line);
  }

  return collected.join("\n");
}

function extractBody(lines: string[], title: string | undefined, examples: string[], constraints: string | undefined): string {
  const exampleText = new Set(examples.flatMap((example) => example.split("\n")));
  const constraintText = new Set(constraints?.split("\n") ?? []);
  const body = lines.filter((line) => line !== title && !exampleText.has(line) && !constraintText.has(line));
  return body.slice(0, 18).join("\n");
}

function confidenceFor(parsed: Omit<ParsedProblemStatement, "confidence">): number {
  if (parsed.source !== "generic" && parsed.title) {
    return 0.92;
  }
  if (parsed.source !== "generic") {
    return 0.78;
  }
  if ((parsed.examples.length > 0 || CODE_OR_PROBLEM_HINT.test(parsed.body)) && parsed.body.length >= 12) {
    return 0.72;
  }

  return 0.4;
}

function truncate(value: string): string {
  if (value.length <= MAX_FIELD_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_FIELD_LENGTH)}...`;
}
