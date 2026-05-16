import { describe, expect, it } from "vitest";
import { QuestionClassifier } from "../../src/main/classifier/QuestionClassifier";

describe("QuestionClassifier", () => {
  const classifier = new QuestionClassifier();

  it("classifies algorithm question by keyword", () => {
    expect(classifier.classify({ transcript: "实现一个反转链表", ocr: "" })).toBe("technical");
  });

  it("classifies behavioral question by keyword", () => {
    expect(classifier.classify({ transcript: "讲一个你跟同事冲突的例子", ocr: "" })).toBe("behavioral");
  });

  it("classifies as technical when OCR has code-like patterns", () => {
    expect(classifier.classify({ transcript: "看一下这道题", ocr: "function f(arr) { return arr; }" })).toBe(
      "technical",
    );
  });

  it("prefers technical when text contains both behavioral and technical signals", () => {
    expect(classifier.classify({ transcript: "介绍一下 TCP 和 HTTP 的区别", ocr: "" })).toBe("technical");
  });

  it("defaults to general when ambiguous", () => {
    expect(classifier.classify({ transcript: "嗯对", ocr: "" })).toBe("general");
  });

  it("exposes low confidence for ambiguous general questions", () => {
    expect(classifier.classifyWithSignal({ transcript: "看下这个", ocr: "" })).toEqual({
      confidence: 0.4,
      type: "general",
    });
  });
});
