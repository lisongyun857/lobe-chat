import { MainBroadcastEventKey, MainBroadcastParams } from '@lobechat/electron-client-ipc';
import { BrowserWindow, BrowserWindowConstructorOptions, app } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { join } from 'node:path';

import { resourcesDir } from '@/const/dir';
import { isMac } from '@/const/env';
import { createLogger } from '@/utils/logger';

import type { App } from '../App';
import {
  WindowConfigBuilder,
  WindowErrorHandler,
  WindowPositionManager,
  WindowThemeManager,
} from '../window';

// Create logger
const logger = createLogger('core:Browser');

export interface BrowserWindowOpts extends BrowserWindowConstructorOptions {
  devTools?: boolean;
  height?: number;
  identifier: string;
  keepAlive?: boolean;
  parentIdentifier?: string;
  path: string;
  showOnInit?: boolean;
  title?: string;
  width?: number;
}

export class Browser {
  private app: App;

  /**
   * Internal electron window
   */
  private _browserWindow?: BrowserWindow;

  private stopInterceptHandler?: () => void;

  // Helper managers
  private errorHandler?: WindowErrorHandler;
  private themeManager?: WindowThemeManager;
  private positionManager?: WindowPositionManager;

  /**
   * Identifier
   */
  readonly identifier: string;

  /**
   * Options at creation
   */
  readonly options: BrowserWindowOpts;

  /**
   * Window state keeper instance for managing window position and size
   */
  private windowStateKeeper?: windowStateKeeper.State;

  /**
   * Track if event listeners have been set up to avoid duplicates
   */
  private eventListenersSetup = false;

  /**
   * Method to expose window externally
   */
  get browserWindow() {
    return this.retrieveOrInitialize();
  }

  get webContents() {
    if (this._browserWindow?.isDestroyed()) return null;

    return this._browserWindow.webContents;
  }

  /**
   * Method to construct BrowserWindows object
   * @param options
   * @param application
   */
  constructor(options: BrowserWindowOpts, application: App) {
    logger.debug(`Creating Browser instance: ${options.identifier}`);
    logger.debug(`Browser options: ${JSON.stringify(options)}`);
    this.app = application;
    this.identifier = options.identifier;
    this.options = options;

    // Initialization
    this.retrieveOrInitialize();
  }

  loadUrl = async (path: string) => {
    const initUrl = this.app.nextServerUrl + path;

    try {
      logger.debug(`[${this.identifier}] Attempting to load URL: ${initUrl}`);
      await this._browserWindow.loadURL(initUrl);
      logger.debug(`[${this.identifier}] Successfully loaded URL: ${initUrl}`);
    } catch (error) {
      logger.error(`[${this.identifier}] Failed to load URL (${initUrl}):`, error);
      await this.handleLoadError(initUrl);
    }
  };

  private async handleLoadError(initUrl: string) {
    await this.errorHandler?.handleLoadError(initUrl);
  }

  loadPlaceholder = async () => {
    logger.debug(`[${this.identifier}] Loading splash screen placeholder`);
    // First load a local HTML loading page
    await this._browserWindow.loadFile(join(resourcesDir, 'splash.html'));
    logger.debug(`[${this.identifier}] Splash screen placeholder loaded.`);
  };

  show() {
    logger.debug(`Showing window: ${this.identifier}`);
    if (!this._browserWindow?.isDestroyed()) {
      this.positionManager?.determinePosition(this.options.parentIdentifier);
      // Handle macOS dock behavior
      if (isMac && app.dock) {
        app.dock.show();
      }
    }

    this.browserWindow.show();
  }

  hide() {
    logger.debug(`Hiding window: ${this.identifier}`);
    this.browserWindow.hide();
  }

  close() {
    logger.debug(`Attempting to close window: ${this.identifier}`);
    this.browserWindow.close();
  }

  /**
   * Destroy instance
   */
  destroy() {
    logger.debug(`Destroying window instance: ${this.identifier}`);
    this.cleanupResources();
    this._browserWindow = undefined;
  }

  private cleanupResources() {
    // Clean up intercept handler
    this.stopInterceptHandler?.();

    // Clean up error handler
    this.errorHandler?.cleanupRetryHandler();

    // Clean up theme manager
    this.themeManager?.cleanup();

    // Reset event listeners flag
    this.eventListenersSetup = false;
  }

  /**
   * Initialize
   */
  retrieveOrInitialize() {
    // When there is this window and it has not been destroyed
    if (this._browserWindow && !this._browserWindow.isDestroyed()) {
      logger.debug(`[${this.identifier}] Returning existing BrowserWindow instance.`);
      return this._browserWindow;
    }

    logger.info(`Creating new BrowserWindow instance: ${this.identifier}`);
    logger.debug(`[${this.identifier}] Options for new window: ${JSON.stringify(this.options)}`);

    // Build window configuration using WindowConfigBuilder
    const configBuilder = new WindowConfigBuilder(this.options);
    const config = configBuilder.build();
    this.windowStateKeeper = config.windowStateKeeper;

    logger.debug(
      `[${this.identifier}] Window state restored: ${JSON.stringify({
        height: this.windowStateKeeper.height,
        isFullScreen: this.windowStateKeeper.isFullScreen,
        isMaximized: this.windowStateKeeper.isMaximized,
        width: this.windowStateKeeper.width,
        x: this.windowStateKeeper.x,
        y: this.windowStateKeeper.y,
      })}`,
    );

    const browserWindow = new BrowserWindow(config);

    this._browserWindow = browserWindow;
    logger.debug(`[${this.identifier}] BrowserWindow instance created.`);

    // Initialize helper managers
    this.initializeHelperManagers(browserWindow);

    // Let window state keeper manage the window
    this.windowStateKeeper.manage(browserWindow);

    // Restore maximized state if needed
    if (this.windowStateKeeper.isMaximized) {
      // Delay maximize to ensure proper display
      browserWindow.once('ready-to-show', () => {
        if (!browserWindow.isDestroyed()) {
          browserWindow.maximize();
        }
      });
    }

    logger.debug(`[${this.identifier}] Setting up nextInterceptor.`);
    this.stopInterceptHandler = this.app.nextInterceptor({
      session: browserWindow.webContents.session,
    });

    logger.debug(`[${this.identifier}] Initiating placeholder and URL loading sequence.`);
    this.loadPlaceholder().then(() => {
      this.loadUrl(this.options.path).catch((e) => {
        logger.error(
          `[${this.identifier}] Initial loadUrl error for path '${this.options.path}':`,
          e,
        );
      });
    });

    // Show devtools if enabled
    if (this.options.devTools) {
      logger.debug(`[${this.identifier}] Opening DevTools because devTools option is true.`);
      browserWindow.webContents.openDevTools();
    }

    this.setupEventListeners(browserWindow, this.options.showOnInit);

    logger.debug(`[${this.identifier}] retrieveOrInitialize completed.`);

    return browserWindow;
  }

  private initializeHelperManagers(browserWindow: BrowserWindow): void {
    this.errorHandler = new WindowErrorHandler(browserWindow, this.identifier);
    this.themeManager = new WindowThemeManager(browserWindow, this.identifier);
    this.positionManager = new WindowPositionManager(browserWindow, this.identifier, this.app);
  }

  private setupEventListeners(browserWindow: BrowserWindow, showOnInit?: boolean) {
    if (this.eventListenersSetup) return;
    this.eventListenersSetup = true;

    logger.debug(`[${this.identifier}] Setting up event listeners.`);

    browserWindow.once('ready-to-show', () => {
      logger.debug(`[${this.identifier}] Window 'ready-to-show' event fired.`);
      if (showOnInit) {
        logger.debug(`Showing window ${this.identifier} because showOnInit is true.`);
        this.show();
      } else {
        logger.debug(
          `Window ${this.identifier} not shown on 'ready-to-show' because showOnInit is false.`,
        );
      }
    });

    browserWindow.on('close', (e) => {
      logger.debug(`Window 'close' event triggered for: ${this.identifier}`);
      logger.debug(
        `[${this.identifier}] State during close event: isQuiting=${this.app.isQuiting}, keepAlive=${this.options.keepAlive}`,
      );

      // If in application quitting process, allow window to be closed
      if (this.app.isQuiting) {
        logger.debug(`[${this.identifier}] App is quitting, allowing window to close naturally.`);
        // Window state keeper will automatically save state
        this.cleanupResources();
        return;
      }

      // Prevent window from being destroyed, just hide it (if marked as keepAlive)
      if (this.options.keepAlive) {
        logger.debug(
          `[${this.identifier}] keepAlive is true, preventing default close and hiding window.`,
        );
        e.preventDefault();
        browserWindow.hide();

        // Handle macOS dock behavior - hide dock when all windows are hidden
        if (isMac && this.shouldHideDock()) {
          app.dock?.hide();
        }
      } else {
        // Window is actually closing (not keepAlive)
        logger.debug(`[${this.identifier}] keepAlive is false, allowing window to close.`);
        // Window state keeper will automatically save state
        this.cleanupResources();
      }
    });

    // Theme changes are now handled by WindowThemeManager
  }

  private shouldHideDock(): boolean {
    // Check if any window in the app is still visible
    if (!this.app.browserManager) return false;

    // This is a simplified check - in a real implementation you'd check all windows
    return true; // For now, always allow hiding dock
  }

  moveToCenter() {
    this.positionManager?.centerWindow();
  }

  setWindowSize(boundSize: { height?: number; width?: number }) {
    this.positionManager?.setSize(boundSize);
  }

  broadcast = <T extends MainBroadcastEventKey>(channel: T, data?: MainBroadcastParams<T>) => {
    if (this._browserWindow?.isDestroyed()) return;

    logger.debug(`Broadcasting to window ${this.identifier}, channel: ${channel}`);
    this._browserWindow.webContents.send(channel, data);
  };

  applyVisualEffects() {
    this.themeManager?.applyVisualEffects();
  }

  /**
   * Manually reapply visual effects (useful for fixing lost effects after window state changes)
   */
  reapplyVisualEffects() {
    this.themeManager?.reapplyVisualEffects();
  }

  toggleVisible() {
    logger.debug(`Toggling visibility for window: ${this.identifier}`);
    if (this._browserWindow?.isVisible() && this._browserWindow.isFocused()) {
      this._browserWindow.hide();
    } else {
      this._browserWindow?.show();
      this._browserWindow?.focus();
    }
  }
}
