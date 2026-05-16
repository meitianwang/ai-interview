import { describe, expect, it } from "vitest";
import { formatProblemStatement, parseProblemStatement } from "../../src/main/ocr/ProblemStatementParser";

describe("ProblemStatementParser", () => {
  it("extracts a LeetCode-style problem", () => {
    const parsed = parseProblemStatement(`
      LeetCode
      206. 反转链表
      给你单链表的头节点 head ，请你反转链表，并返回反转后的链表。
      示例 1：
      输入：head = [1,2,3,4,5]
      输出：[5,4,3,2,1]
      提示：
      链表中节点的数目范围是 [0, 5000]
      提交记录
    `);

    expect(parsed).toMatchObject({
      confidence: 0.92,
      source: "leetcode",
      title: "反转链表",
    });
    expect(parsed?.body).toContain("请你反转链表");
    expect(parsed?.examples[0]).toContain("输入：head");
    expect(parsed?.constraints).toContain("节点的数目");
  });

  it("extracts a Nowcoder-style title", () => {
    const parsed = parseProblemStatement(`
      牛客
      NC78 反转链表
      描述
      输入一个链表，反转链表后，输出新链表的表头。
    `);

    expect(parsed?.source).toBe("niuke");
    expect(parsed?.title).toBe("反转链表");
  });

  it("formats only confident OCR snippets", () => {
    expect(formatProblemStatement("设置 个人中心 讨论")).toBe("");
    expect(formatProblemStatement("function reverseList(head) { return head; }")).toContain("屏幕上的题面");
  });
});
