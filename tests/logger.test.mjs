import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../scripts/logger.mjs';

describe('Logger Debug Utility', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not log debug messages when debugMode is false', () => {
    globalThis.game = {
      settings: {
        get: () => false
      }
    };

    Logger.debug('Test message');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('logs debug messages when debugMode is true', () => {
    globalThis.game = {
      settings: {
        get: () => true
      }
    };

    Logger.debug('Test message', { data: 123 });
    expect(consoleSpy).toHaveBeenCalledWith(
      '%c[Delta Green Combat HUD]%c Test message',
      'color: #00ff66; font-weight: bold;',
      'color: inherit;',
      { data: 123 }
    );
  });

  it('always logs info, warn, and error messages', () => {
    Logger.info('Info message');
    expect(consoleSpy).toHaveBeenCalledWith(
      '%c[Delta Green Combat HUD]%c Info message',
      'color: #00ff66; font-weight: bold;',
      'color: inherit;'
    );

    Logger.warn('Warn message');
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('[Delta Green Combat HUD] Warn message')
    );

    Logger.error('Error message');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('[Delta Green Combat HUD] Error message')
    );
  });
});
