/**
 * Skill tile text: the monogram a tile carries in place of art, and the match
 * test behind the skill filter.
 *
 * Both are pure, so they are tested here rather than through Argon (TEST-6).
 */

import { describe, it, expect } from 'vitest';
import { monogram, matchesSkill, normalizeText } from '../scripts/skill-display.mjs';

describe('monogram', () => {
  it('takes the first two letters of a single-word skill', () => {
    expect(monogram('Firearms')).toBe('FI');
    expect(monogram('Search')).toBe('SE');
  });

  it('takes the first letter of the first and last word of a compound skill', () => {
    expect(monogram('Heavy Weapons')).toBe('HW');
    expect(monogram('Unarmed Combat')).toBe('UC');
  });

  it('distinguishes typed skills by their parenthetical', () => {
    // Art (Painting) and Art (Sculpture) must not collide on the same tile.
    expect(monogram('Art (Painting)')).toBe('AP');
    expect(monogram('Art (Sculpture)')).toBe('AS');
    expect(monogram('Foreign Language (Spanish)')).toBe('FS');
  });

  it('is derived from the label alone, so it works for any skill the system defines', () => {
    expect(monogram('Ritual')).toBe('RI');
    expect(monogram('Sigils & Symbols')).toBe('SS');
  });

  it('renders absent data as absent, never as a placeholder', () => {
    expect(monogram('')).toBe('');
    expect(monogram(null)).toBe('');
    expect(monogram(undefined)).toBe('');
    expect(monogram('   ')).toBe('');
  });

  it('survives a single-letter label', () => {
    expect(monogram('X')).toBe('X');
  });
});

describe('normalizeText', () => {
  it('folds case and accents', () => {
    expect(normalizeText('Réseau')).toBe('reseau');
    expect(normalizeText('CRIMINOLOGY')).toBe('criminology');
  });

  it('treats missing text as empty', () => {
    expect(normalizeText(null)).toBe('');
  });
});

describe('matchesSkill', () => {
  it('matches anywhere in the label', () => {
    expect(matchesSkill('fire', 'Firearms')).toBe(true);
    expect(matchesSkill('arm', 'Firearms')).toBe(true);
    expect(matchesSkill('weap', 'Heavy Weapons')).toBe(true);
  });

  it('ignores case and accents in both directions', () => {
    expect(matchesSkill('RESEAU', 'Réseau')).toBe(true);
    expect(matchesSkill('réseau', 'Reseau')).toBe(true);
  });

  it('matches the initials people type under pressure', () => {
    expect(matchesSkill('hw', 'Heavy Weapons')).toBe(true);
    expect(matchesSkill('uc', 'Unarmed Combat')).toBe(true);
    expect(matchesSkill('ap', 'Art (Painting)')).toBe(true);
  });

  it('does not match unrelated skills', () => {
    expect(matchesSkill('hw', 'Firearms')).toBe(false);
    expect(matchesSkill('occult', 'Accounting')).toBe(false);
  });

  it('matches everything while the query is empty', () => {
    expect(matchesSkill('', 'Firearms')).toBe(true);
    expect(matchesSkill('   ', 'Firearms')).toBe(true);
    expect(matchesSkill(null, 'Firearms')).toBe(true);
  });

  it('matches nothing against a label it cannot read', () => {
    expect(matchesSkill('fire', null)).toBe(false);
  });
});
