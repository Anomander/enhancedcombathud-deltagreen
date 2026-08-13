/**
 * Naming who an attack was aimed at.
 *
 * The disclosure rules are the interesting part: a chat card is permanent and
 * public, so a name that should not have been shown cannot be taken back.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { targetsForMessage, stampTargets, renderTargetLine, TARGETS_FLAG } from '../scripts/attack-targets.mjs';
import { MODULE_ID } from '../scripts/settings.mjs';
import { TOKEN_DISPLAY_MODES } from '../scripts/targeting.mjs';

function attack(rollType = 'weapon') {
  return { rolls: [{ options: { rollType } }], updateSource: vi.fn() };
}

function token(uuid, { displayName = TOKEN_DISPLAY_MODES.ALWAYS, name = 'Cultist', isOwner = false } = {}) {
  return { uuid, name, displayName, actor: { isOwner }, document: { uuid } };
}

describe('Which messages get a target line', () => {
  it('annotates an attack roll', () => {
    expect(targetsForMessage(attack(), [token('Scene.s.Token.a')])).toEqual(['Scene.s.Token.a']);
  });

  it.each(['damage', 'lethality', 'skill', 'sanity'])('leaves a %s roll alone', (rollType) => {
    // The proposal card automation posts already names the target for those.
    expect(targetsForMessage(attack(rollType), [token('Scene.s.Token.a')])).toBeNull();
  });

  it('says nothing rather than saying nothing was targeted', () => {
    expect(targetsForMessage(attack(), [])).toBeNull();
  });

  it('records every target, not just the first', () => {
    const uuids = targetsForMessage(attack(), [token('Scene.s.Token.a'), token('Scene.s.Token.b')]);
    expect(uuids).toEqual(['Scene.s.Token.a', 'Scene.s.Token.b']);
  });
});

describe('Stamping the message', () => {
  afterEach(() => {
    delete globalThis.game;
  });

  it('writes the flag before the message is created, not after', () => {
    globalThis.game = { user: { targets: new Set([token('Scene.s.Token.a')]) } };
    const message = attack();

    stampTargets(message);

    expect(message.updateSource).toHaveBeenCalledWith({
      [`flags.${MODULE_ID}.${TARGETS_FLAG}`]: ['Scene.s.Token.a']
    });
  });

  it('writes nothing when nothing is targeted', () => {
    globalThis.game = { user: { targets: new Set() } };
    const message = attack();

    expect(stampTargets(message)).toBeNull();
    expect(message.updateSource).not.toHaveBeenCalled();
  });
});

describe('Rendering it, per viewer', () => {
  let element;
  let tokens;

  function flagged(uuids) {
    return { flags: { [MODULE_ID]: { [TARGETS_FLAG]: uuids } } };
  }

  beforeEach(() => {
    tokens = new Map();
    element = {
      children: [],
      querySelector: (selector) => element.children.find((child) => child.selector === selector) ?? null,
      prepend: (node) => element.children.push(node)
    };

    globalThis.document = {
      createElement: () => ({ classList: { add() {} }, innerText: '' })
    };
    globalThis.game = {
      user: { isGM: false },
      i18n: {
        localize: (key) => key,
        format: (key, data) => `${key}:${data.targets}`
      }
    };
    globalThis.foundry = { utils: { fromUuidSync: (uuid) => tokens.get(uuid) ?? null } };
  });

  afterEach(() => {
    delete globalThis.document;
    delete globalThis.game;
    delete globalThis.foundry;
  });

  it('names a target whose token shows its name to everyone', () => {
    tokens.set('t1', token('t1', { name: 'Cultist' }));

    const line = renderTargetLine(flagged(['t1']), element);

    expect(line.innerText).toBe('DG_HUD.Target.Against:Cultist');
  });

  it('withholds a name the Handler chose to hide', () => {
    tokens.set('t1', token('t1', { name: 'Something Wrong', displayName: TOKEN_DISPLAY_MODES.NONE }));

    const line = renderTargetLine(flagged(['t1']), element);

    expect(line.innerText).toBe('DG_HUD.Target.Against:DG_HUD.Target.Unnamed');
  });

  it('shows a Handler every name', () => {
    globalThis.game.user.isGM = true;
    tokens.set('t1', token('t1', { name: 'Something Wrong', displayName: TOKEN_DISPLAY_MODES.NONE }));

    expect(renderTargetLine(flagged(['t1']), element).innerText).toBe('DG_HUD.Target.Against:Something Wrong');
  });

  it('still counts a target it cannot resolve', () => {
    tokens.set('t1', token('t1', { name: 'Cultist' }));

    const line = renderTargetLine(flagged(['t1', 'gone']), element);

    expect(line.innerText).toBe('DG_HUD.Target.Against:Cultist, DG_HUD.Target.Unnamed');
  });

  it('draws nothing on a message that was never stamped', () => {
    expect(renderTargetLine({ flags: {} }, element)).toBeNull();
  });

  it('does not stack a second line when the message re-renders', () => {
    tokens.set('t1', token('t1'));
    element.children.push({ selector: '.dg-hud-attack-targets' });

    expect(renderTargetLine(flagged(['t1']), element)).toBeNull();
  });
});
