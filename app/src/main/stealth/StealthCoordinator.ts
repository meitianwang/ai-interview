import type { BrowserWindow } from "electron";

export class StealthCoordinator {
  private readonly windows = new Set<BrowserWindow>();

  protect(window: BrowserWindow): void {
    if (window.isDestroyed()) {
      return;
    }

    window.setContentProtection(true);
    this.windows.add(window);
  }

  unprotect(window: BrowserWindow): void {
    this.windows.delete(window);
    if (!window.isDestroyed()) {
      window.setContentProtection(false);
    }
  }

  protectAll(): void {
    for (const window of this.windows) {
      if (window.isDestroyed()) {
        this.windows.delete(window);
        continue;
      }

      window.setContentProtection(true);
    }
  }
}
