/**
 * Central logger for Delta Green Enhanced Combat HUD.
 * Supports togglable debug logging via module settings.
 */

import { MODULE_ID } from './settings.mjs';

export class Logger {
  /**
   * Check if debug mode is enabled in module settings.
   * @returns {boolean}
   */
  static isDebugEnabled() {
    try {
      // Logging can happen during init, before the setting is registered.
      return Boolean(globalThis.game?.settings?.get(MODULE_ID, 'debugMode'));
    } catch {
      return false;
    }
  }

  /**
   * Log info message if debug mode is enabled.
   * @param {string} message
   * @param  {...any} args
   */
  static debug(message, ...args) {
    if (this.isDebugEnabled()) {
      console.log(`%c[Delta Green Combat HUD]%c ${message}`, 'color: #00ff66; font-weight: bold;', 'color: inherit;', ...args);
    }
  }

  /**
   * Always log informational message.
   * @param {string} message
   * @param  {...any} args
   */
  static info(message, ...args) {
    console.log(`%c[Delta Green Combat HUD]%c ${message}`, 'color: #00ff66; font-weight: bold;', 'color: inherit;', ...args);
  }

  /**
   * Log warning message.
   * @param {string} message
   * @param  {...any} args
   */
  static warn(message, ...args) {
    console.warn(`[Delta Green Combat HUD] ${message}`, ...args);
  }

  /**
   * Log error message.
   * @param {string} message
   * @param  {...any} args
   */
  static error(message, ...args) {
    console.error(`[Delta Green Combat HUD] ${message}`, ...args);
  }
}
