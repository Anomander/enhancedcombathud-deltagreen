/**
 * Rolls the module did not make.
 *
 * The gap these cover was invisible to the suite and to `fvtt:smoke`: every
 * damage path the HUD *issued* worked, so nothing failed. Clicking the system's
 * own *Roll Lethality* button produced no proposal at all, which is the one way
 * a player is most likely to reach a Lethality roll after declining the prompt.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { observableRoll, outcomeFromMessage, observeChatMessage } from '../scripts/roll-observer.mjs';
import { markHudOrigin } from '../scripts/roll-service.mjs';
import { EVENTS, on, clearListeners } from '../scripts/events.mjs';

/** A roll as it comes back off a chat message: real subclass, flattened options. */
function messageRoll({ rollType = 'lethality', total = 45, target = 20, item = { _id: 'w1', name: 'SMG', system: { armorPiercing: 3 } } } = {}) {
  return {
    _evaluated: true,
    total,
    target,
    effectiveTarget: target,
    isSuccess: total <= target,
    isCritical: false,
    get nonLethalDamage() {
      const digits = String(this.total).split('').map(Number).map((d) => d || 10);
      const [die1, die2] = digits.length === 1 ? [10, this.total] : digits;
      return { die1, die2, total: die1 + die2 };
    },
    options: { rollType, item, actor: { name: 'C' }, token: {} }
  };
}

function message({ roll = messageRoll(), isAuthor = true, speaker = {} } = {}) {
  return { isAuthor, speaker, rolls: roll ? [roll] : [] };
}

beforeEach(() => {
  globalThis.game = { scenes: { get: () => null }, actors: { get: () => null } };
});

afterEach(() => {
  clearListeners();
  delete globalThis.game;
});

describe('Which chat messages carry a roll worth acting on', () => {
  it('takes a Lethality roll made outside the HUD', () => {
    expect(observableRoll(message())).not.toBeNull();
  });

  it('takes a damage roll made outside the HUD', () => {
    expect(observableRoll(message({ roll: messageRoll({ rollType: 'damage' }) }))).not.toBeNull();
  });

  it('ignores a roll this module issued — the roll service already published it', () => {
    const roll = markHudOrigin(messageRoll());
    expect(observableRoll(message({ roll }))).toBeNull();
  });

  it('ignores messages this client did not author', () => {
    // createChatMessage fires everywhere; only the roller's targets count.
    expect(observableRoll(message({ isAuthor: false }))).toBeNull();
  });

  it.each(['weapon', 'skill', 'stat', 'sanity', 'sanity-damage'])('ignores a %s roll', (rollType) => {
    expect(observableRoll(message({ roll: messageRoll({ rollType }) }))).toBeNull();
  });

  it('ignores a message with no roll at all', () => {
    expect(observableRoll(message({ roll: null }))).toBeNull();
  });
});

describe('Describing an observed roll', () => {
  it('reads the failed Lethality fallback the system computed', () => {
    // 45 → 4 + 5. A failed Lethality still deals damage (AH p. 57), which is
    // exactly the case that had no way to be applied.
    const outcome = outcomeFromMessage(message());

    expect(outcome).toMatchObject({ type: 'lethality', lethal: false, nonLethalDamage: 9 });
  });

  it('keeps the serialised item when the live one cannot be found', () => {
    // Armour piercing survives serialisation and is the only field automation
    // needs; discarding it would silently resolve every hit against full armour.
    expect(outcomeFromMessage(message()).item.system.armorPiercing).toBe(3);
  });

  it('prefers the live documents named by the speaker', () => {
    const item = { id: 'w1', name: 'SMG (live)' };
    const actor = { name: 'C', items: { get: (id) => (id === 'w1' ? item : null) } };
    const token = { actor, name: 'C' };
    globalThis.game = {
      scenes: { get: () => ({ tokens: { get: () => token } }) },
      actors: { get: () => actor }
    };

    const outcome = outcomeFromMessage(message({ speaker: { scene: 's', token: 't', actor: 'a' } }));

    expect(outcome.item).toBe(item);
    expect(outcome.actor).toBe(actor);
    expect(outcome.token).toBe(token);
  });
});

describe('Publishing', () => {
  it('puts an observed roll on the same bus the roll service uses', () => {
    const heard = vi.fn();
    on(EVENTS.ROLL_OUTCOME, heard);

    observeChatMessage(message());

    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard.mock.calls[0][0]).toMatchObject({ type: 'lethality' });
  });

  it('publishes nothing for a roll the HUD issued, so no result is offered twice', () => {
    const heard = vi.fn();
    on(EVENTS.ROLL_OUTCOME, heard);

    observeChatMessage(message({ roll: markHudOrigin(messageRoll()) }));

    expect(heard).not.toHaveBeenCalled();
  });
});
