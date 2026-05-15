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
});
