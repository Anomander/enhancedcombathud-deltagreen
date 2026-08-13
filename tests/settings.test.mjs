/**
 * Setting readers.
 *
 * Every setting has a reader (UX-2), and every reader answers safely before
 * Foundry exists — the module is loaded headless in these tests, and a reader
 * that assumed `game.settings` would make the core untestable (TEST-6).
 */

import { describe, it, expect, afterEach } from 'vitest';
import { MODULE_ID, getShowUntrainedSkills } from '../scripts/settings.mjs';

/** Stand in for game.settings with a given store. */
function withSettings(values) {
  globalThis.game = {
    settings: {
      get: (module, key) => {
        expect(module).toBe(MODULE_ID);
        return values[key];
      }
    }
  };
}

afterEach(() => {
  delete globalThis.game;
});

describe('getShowUntrainedSkills', () => {
  it('is off unless switched on, so the list opens on what the Agent can do', () => {
    withSettings({ showUntrainedSkills: false });
    expect(getShowUntrainedSkills()).toBe(false);
  });

  it('reports the setting when it is on', () => {
    withSettings({ showUntrainedSkills: true });
    expect(getShowUntrainedSkills()).toBe(true);
  });

  it('answers with the default when there is no Foundry to ask', () => {
    delete globalThis.game;
    expect(getShowUntrainedSkills()).toBe(false);
  });

  it('never returns a non-boolean, whatever the store holds', () => {
    withSettings({ showUntrainedSkills: undefined });
    expect(getShowUntrainedSkills()).toBe(false);
  });
});
