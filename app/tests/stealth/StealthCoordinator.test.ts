import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { StealthCoordinator } from "../../src/main/stealth/StealthCoordinator";

function fakeWindow(destroyed = false): BrowserWindow {
  return {
    isDestroyed: () => destroyed,
    setContentProtection: vi.fn(),
  } as unknown as BrowserWindow;
}

describe("StealthCoordinator", () => {
  it("applies content protection on protect", () => {
    const window = fakeWindow();
    const stealth = new StealthCoordinator();

    stealth.protect(window);

    expect(window.setContentProtection).toHaveBeenCalledWith(true);
  });

  it("removes content protection on unprotect", () => {
    const window = fakeWindow();
    const stealth = new StealthCoordinator();

    stealth.protect(window);
    stealth.unprotect(window);

    expect(window.setContentProtection).toHaveBeenLastCalledWith(false);
  });

  it("does not touch destroyed windows", () => {
    const window = fakeWindow(true);
    const stealth = new StealthCoordinator();

    stealth.protect(window);
    stealth.protectAll();

    expect(window.setContentProtection).not.toHaveBeenCalled();
  });
});
