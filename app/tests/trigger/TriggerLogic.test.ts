import { describe, expect, it, vi } from "vitest";
import { TriggerLogic } from "../../src/main/trigger/TriggerLogic";

describe("TriggerLogic", () => {
  it("fires when silence passes threshold after voiced question tail", () => {
    const fire = vi.fn();
    const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });

    triggerLogic.onVAD("voiced", 0);
    triggerLogic.updateTranscriptTail("你介绍一下自己吧？");
    triggerLogic.onVAD("silent", 100);
    triggerLogic.tick(1700);

    expect(fire).toHaveBeenCalledTimes(1);
  });

  it("does not fire on short transcript", () => {
    const fire = vi.fn();
    const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });

    triggerLogic.onVAD("voiced", 0);
    triggerLogic.updateTranscriptTail("嗯");
    triggerLogic.onVAD("silent", 100);
    triggerLogic.tick(1700);

    expect(fire).not.toHaveBeenCalled();
  });

  it("does not fire if tail does not look like a question", () => {
    const fire = vi.fn();
    const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });

    triggerLogic.onVAD("voiced", 0);
    triggerLogic.updateTranscriptTail("是的我了解了这个背景");
    triggerLogic.onVAD("silent", 100);
    triggerLogic.tick(1700);

    expect(fire).not.toHaveBeenCalled();
  });

  it("does not fire before silence threshold", () => {
    const fire = vi.fn();
    const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });

    triggerLogic.onVAD("voiced", 0);
    triggerLogic.updateTranscriptTail("为什么想加入我们团队？");
    triggerLogic.onVAD("silent", 100);
    triggerLogic.tick(1200);

    expect(fire).not.toHaveBeenCalled();
  });

  it("requires voiced before silent", () => {
    const fire = vi.fn();
    const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });

    triggerLogic.updateTranscriptTail("为什么想加入我们团队？");
    triggerLogic.onVAD("silent", 100);
    triggerLogic.tick(1700);

    expect(fire).not.toHaveBeenCalled();
  });

  it("fires once until next voiced frame", () => {
    const fire = vi.fn();
    const triggerLogic = new TriggerLogic({ silenceMs: 1500, onTrigger: fire });

    triggerLogic.onVAD("voiced", 0);
    triggerLogic.updateTranscriptTail("请介绍一下你的项目经历");
    triggerLogic.onVAD("silent", 100);
    triggerLogic.tick(1700);
    triggerLogic.tick(3200);
    triggerLogic.onVAD("voiced", 3300);
    triggerLogic.onVAD("silent", 3400);
    triggerLogic.tick(5000);

    expect(fire).toHaveBeenCalledTimes(2);
  });
});
