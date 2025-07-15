import { BrowserWindowConstructorOptions, nativeTheme } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { join } from 'node:path';

import { preloadDir } from '@/const/dir';
import { isWindows } from '@/const/env';
import {
  BACKGROUND_DARK,
  BACKGROUND_LIGHT,
  DEFAULT_WINDOW_CONFIG,
  SYMBOL_COLOR_DARK,
  SYMBOL_COLOR_LIGHT,
  TITLE_BAR_HEIGHT,
} from '@/const/theme';

import type { BrowserWindowOpts } from './Browser';

export interface WindowConfig extends BrowserWindowConstructorOptions {
  windowStateKeeper: windowStateKeeper.State;
}

export class WindowConfigBuilder {
  private options: BrowserWindowOpts;
  private windowStateKeeper: windowStateKeeper.State;

  constructor(options: BrowserWindowOpts) {
    this.options = options;
    this.initializeWindowStateKeeper();
  }

  private initializeWindowStateKeeper() {
    const { width, height } = this.options;

    this.windowStateKeeper = windowStateKeeper({
      defaultHeight: height || DEFAULT_WINDOW_CONFIG.DEFAULT_HEIGHT,
      defaultWidth: width || DEFAULT_WINDOW_CONFIG.DEFAULT_WIDTH,
      file: `window-state-${this.options.identifier}.json`,
      fullScreen: false,
      maximize: false,
    });
  }

  build(): WindowConfig {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title, devTools, showOnInit, ...rest } = this.options;
    const isDarkMode = nativeTheme.shouldUseDarkColors;

    const baseConfig: BrowserWindowConstructorOptions = {
      ...rest,
      autoHideMenuBar: true,
      darkTheme: isDarkMode,
      frame: false,
      height: this.windowStateKeeper.height,
      minHeight: DEFAULT_WINDOW_CONFIG.MIN_HEIGHT,
      minWidth: DEFAULT_WINDOW_CONFIG.MIN_WIDTH,
      show: false,
      title,
      transparent: false,
      vibrancy: 'sidebar',
      visualEffectState: 'active',
      webPreferences: this.buildWebPreferences(),
      width: this.windowStateKeeper.width,
      x: this.windowStateKeeper.x,
      y: this.windowStateKeeper.y,
    };

    // Apply platform-specific configurations
    if (isWindows) {
      Object.assign(baseConfig, this.getWindowsSpecificConfig(isDarkMode));
    }

    return {
      ...baseConfig,
      windowStateKeeper: this.windowStateKeeper,
    };
  }

  private buildWebPreferences() {
    return {
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
      contextIsolation: true,
      preload: join(preloadDir, 'index.js'),
      sandbox: false,
      webSecurity: false,
      webviewTag: true,
    };
  }

  private getWindowsSpecificConfig(isDarkMode: boolean) {
    return {
      backgroundColor: isDarkMode ? BACKGROUND_DARK : BACKGROUND_LIGHT,
      titleBarOverlay: {
        color: isDarkMode ? BACKGROUND_DARK : BACKGROUND_LIGHT,
        height: TITLE_BAR_HEIGHT,
        symbolColor: isDarkMode ? SYMBOL_COLOR_DARK : SYMBOL_COLOR_LIGHT,
      },
      titleBarStyle: 'hidden' as const,
    };
  }
}
