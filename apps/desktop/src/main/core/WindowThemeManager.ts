import { BrowserWindow, nativeTheme } from 'electron';

import { isWindows } from '@/const/env';
import {
  BACKGROUND_DARK,
  BACKGROUND_LIGHT,
  DEFAULT_WINDOW_CONFIG,
  SYMBOL_COLOR_DARK,
  SYMBOL_COLOR_LIGHT,
  TITLE_BAR_HEIGHT,
} from '@/const/theme';
import { createLogger } from '@/utils/logger';

const logger = createLogger('core:WindowThemeManager');

export class WindowThemeManager {
  private window: BrowserWindow;
  private identifier: string;
  private themeListenerSetup = false;

  constructor(window: BrowserWindow, identifier: string) {
    this.window = window;
    this.identifier = identifier;
    this.setupThemeListener();
  }

  private setupThemeListener(): void {
    if (this.themeListenerSetup) return;

    nativeTheme.on('updated', this.handleThemeChange);
    this.themeListenerSetup = true;
  }

  private handleThemeChange = (): void => {
    logger.debug(`[${this.identifier}] System theme changed, reapplying visual effects.`);
    setTimeout(() => {
      this.applyVisualEffects();
    }, DEFAULT_WINDOW_CONFIG.THEME_CHANGE_DELAY);
  };

  applyVisualEffects(): void {
    if (!this.window || this.window.isDestroyed()) return;

    logger.debug(`[${this.identifier}] Applying visual effects for platform`);
    const isDarkMode = nativeTheme.shouldUseDarkColors;

    try {
      if (isWindows) {
        this.applyWindowsVisualEffects(isDarkMode);
      }

      logger.debug(
        `[${this.identifier}] Visual effects applied successfully (dark mode: ${isDarkMode})`,
      );
    } catch (error) {
      logger.error(`[${this.identifier}] Failed to apply visual effects:`, error);
    }
  }

  private applyWindowsVisualEffects(isDarkMode: boolean): void {
    this.window.setBackgroundColor(isDarkMode ? BACKGROUND_DARK : BACKGROUND_LIGHT);
    this.window.setTitleBarOverlay({
      color: isDarkMode ? BACKGROUND_DARK : BACKGROUND_LIGHT,
      height: TITLE_BAR_HEIGHT,
      symbolColor: isDarkMode ? SYMBOL_COLOR_DARK : SYMBOL_COLOR_LIGHT,
    });
  }

  /**
   * Manually reapply visual effects (useful for fixing lost effects after window state changes)
   */
  reapplyVisualEffects(): void {
    logger.debug(`[${this.identifier}] Manually reapplying visual effects.`);
    this.applyVisualEffects();
  }

  cleanup(): void {
    if (this.themeListenerSetup) {
      // Note: nativeTheme listeners are global, consider using a centralized theme manager
      // for multiple windows to avoid duplicate listeners
      this.themeListenerSetup = false;
    }
  }
}
