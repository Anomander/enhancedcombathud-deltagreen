/**
 * What the HUD may say about who you are pointing at.
 *
 * These are disclosure rules, so they are tested from the direction that
 * matters: a leak is the failure. Every case where the answer is uncertain must
 * come back hidden.
 */

import { describe, it, expect } from 'vitest';
import { canSeeTokenName, describeTargets, TOKEN_DISPLAY_MODES as MODES } from '../scripts/targeting.mjs';

/** A targeted token, shaped as Foundry hands it over. */
function token({ name = 'Cultist', displayName = MODES.NONE, isOwner = false } = {}) {
  return { name, document: { displayName, name }, actor: { isOwner } };
}

describe('Whose name a player may see', () => {
  it('shows a name set to display always', () => {
    expect(canSeeTokenName(token({ displayName: MODES.ALWAYS }))).toBe(true);
  });

  it('shows a name set to display on hover, which is public', () => {
    expect(canSeeTokenName(token({ displayName: MODES.HOVER }))).toBe(true);
  });

  it.each([
    ['NONE', MODES.NONE],
    ['CONTROL', MODES.CONTROL],
    ['OWNER_HOVER', MODES.OWNER_HOVER],
    ['OWNER', MODES.OWNER]
  ])('hides a %s name from someone who does not own the token', (_label, displayName) => {
    expect(canSeeTokenName(token({ displayName, isOwner: false }))).toBe(false);
  });

  it.each([
    ['CONTROL', MODES.CONTROL],
    ['OWNER_HOVER', MODES.OWNER_HOVER],
    ['OWNER', MODES.OWNER]
  ])('shows a %s name to someone who owns the token', (_label, displayName) => {
    expect(canSeeTokenName(token({ displayName, isOwner: true }))).toBe(true);
  });

  it('never reveals a NONE name, even to the owner', () => {
    expect(canSeeTokenName(token({ displayName: MODES.NONE, isOwner: true }))).toBe(false);
  });

  it('shows everything to the Handler', () => {
    expect(canSeeTokenName(token({ displayName: MODES.NONE }), { isGM: true })).toBe(true);
  });

  // Erring towards silence is the only safe direction: a name shown that should
  // have been secret cannot be taken back.
  it.each([undefined, null, 'not a mode', NaN])('hides the name when the display mode reads as %p', (displayName) => {
    expect(canSeeTokenName(token({ displayName }))).toBe(false);
  });

  it('handles no token', () => {
    expect(canSeeTokenName(null)).toBe(false);
  });
});

describe('Describing the targeting state', () => {
  it('reports nothing targeted', () => {
    expect(describeTargets([])).toEqual({ kind: 'none', count: 0, name: null });
  });

  it('reports a single named target', () => {
    const state = describeTargets([token({ name: 'Cultist', displayName: MODES.ALWAYS })]);
    expect(state).toEqual({ kind: 'one', count: 1, name: 'Cultist' });
  });

  it('reports a single target whose name is withheld, without inventing one', () => {
    const state = describeTargets([token({ name: 'Cultist', displayName: MODES.NONE })]);

    expect(state.kind).toBe('one');
    expect(state.name).toBeNull();
  });

  // Ambiguous, not broken — and the player is owed the explanation, since this
  // is exactly when damage automation stands down.
  it('reports several targets as its own state', () => {
    const state = describeTargets([token(), token({ name: 'Other' })]);
    expect(state).toEqual({ kind: 'many', count: 2, name: null });
  });

  it('ignores holes in the target list', () => {
    expect(describeTargets([null, undefined]).kind).toBe('none');
  });

  it('tolerates a missing target list', () => {
    expect(describeTargets(undefined).kind).toBe('none');
  });
});
