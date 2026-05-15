import type { QuestionType } from "../prompt/PromptBuilder";

const TECH_KEYWORDS = [
  "实现",
  "算法",
  "代码",
  "复杂度",
  "链表",
  "数组",
  "二叉树",
  "动态规划",
  "设计一个",
  "为什么用",
  "底层",
  "原理",
  "区别",
  "tcp",
  "http",
  "数据库",
  "索引",
  "事务",
  "并发",
  "锁",
  "进程",
  "线程",
];

const BEHAVIORAL_KEYWORDS = [
  "介绍一下",
  "讲一个",
  "冲突",
  "失败",
  "成就",
  "压力",
  "团队",
  "为什么想加入",
  "职业规划",
  "优缺点",
  "学到",
  "如果你",
];

const CODE_PATTERN = /\b(function|class|def|return|var|let|const|public|private)\b|=>|[{};]/i;

export class QuestionClassifier {
  classify(input: { transcript: string; ocr: string }): QuestionType {
    const haystack = `${input.transcript} ${input.ocr}`.toLowerCase();
    if (CODE_PATTERN.test(input.ocr)) {
      return "technical";
    }
    if (TECH_KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return "technical";
    }
    if (BEHAVIORAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) {
      return "behavioral";
    }
    return "general";
  }
}
