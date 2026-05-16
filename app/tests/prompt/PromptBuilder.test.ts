import { describe, expect, it } from "vitest";
import { PromptBuilder } from "../../src/main/prompt/PromptBuilder";

describe("PromptBuilder", () => {
  const context = {
    resume: "RESUME_X",
    jd: "JD_Y",
    ocr: "",
    transcript: "你介绍一下自己。",
    history: [],
  };
  const promptBuilder = new PromptBuilder();

  it("builds bullet prompt for technical question", () => {
    const prompt = promptBuilder.build({ questionType: "technical", context });

    expect(prompt.system).toContain("3 个 bullet");
    expect(prompt.user).toContain("RESUME_X");
  });

  it("builds prose prompt for behavioral question", () => {
    const prompt = promptBuilder.build({ questionType: "behavioral", context });

    expect(prompt.system).toContain("行为面试");
    expect(prompt.user).toContain("JD_Y");
  });

  it("includes recent history and OCR when present", () => {
    const prompt = promptBuilder.build({
      questionType: "general",
      context: {
        ...context,
        ocr: "function reverseList()",
        history: [{ q: "上一题", a: "上一答" }],
      },
    });

    expect(prompt.user).toContain("屏幕上的题面");
    expect(prompt.user).toContain("上一题");
  });

  it("structures known coding-site OCR before injecting it", () => {
    const prompt = promptBuilder.build({
      questionType: "technical",
      context: {
        ...context,
        ocr: `LeetCode
206. 反转链表
给你单链表的头节点 head ，请你反转链表。
示例 1：
输入：head = [1,2,3]
输出：[3,2,1]`,
      },
    });

    expect(prompt.user).toContain("屏幕上的题面（leetcode");
    expect(prompt.user).toContain("标题：反转链表");
    expect(prompt.user).toContain("示例：");
  });
});
