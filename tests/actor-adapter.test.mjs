import { describe, it, expect } from 'vitest';
import { extractVitals, extractSkills, extractWeapons, extractTacticalActions } from '../scripts/actor-adapter.mjs';

describe('Actor Adapter Verification', () => {
  it('returns default safe vitals when actor is null', () => {
    const vitals = extractVitals(null);
    expect(vitals.name).toBe('No Agent Selected');
    expect(vitals.hp.value).toBe(0);
    expect(vitals.wp.value).toBe(0);
    expect(vitals.san.value).toBe(0);
  });

  it('correctly extracts Delta Green Agent vitals', () => {
    const mockActor = {
      name: 'Agent Alphonse',
      img: 'tokens/alphonse.webp',
      system: {
        hp: { value: 11, max: 12 },
        wp: { value: 8, max: 10 },
        san: { value: 45, max: 80 },
        breakingPoint: { value: 38 },
        armor: { value: 3 }
      }
    };

    const vitals = extractVitals(mockActor);
    expect(vitals.name).toBe('Agent Alphonse');
    expect(vitals.hp.value).toBe(11);
    expect(vitals.hp.max).toBe(12);
    expect(vitals.hp.percentage).toBe(92);
    expect(vitals.wp.value).toBe(8);
    expect(vitals.san.value).toBe(45);
    expect(vitals.breakingPoint).toBe(38);
    expect(vitals.armor).toBe(3);
  });

  it('extracts skills including default Delta Green combat skills', () => {
    const mockActor = {
      system: {
        skills: {
          firearms: { value: 60 },
          unarmed_combat: { value: 50 }
        }
      }
    };

    const skills = extractSkills(mockActor);
    expect(skills.length).toBeGreaterThan(10);
    const firearms = skills.find((s) => s.key === 'firearms');
    expect(firearms.value).toBe(60);
    const athletics = skills.find((s) => s.key === 'athletics');
    expect(athletics.value).toBe(30); // Default value fallback
  });

  it('extracts weapon slots with fallback for unarmed strike', () => {
    const mockActorNoWeapons = { items: [] };
    const weapons = extractWeapons(mockActorNoWeapons);
    expect(weapons.length).toBe(1);
    expect(weapons[0].name).toBe('Unarmed Strike');

    const mockActorWithGun = {
      items: [
        {
          id: 'w1',
          name: 'SIG Sauer P226',
          type: 'weapon',
          system: {
            skill: 'Firearms',
            damage: '1d10',
            lethality: 0,
            ammo: { value: 15, max: 15 }
          }
        }
      ]
    };

    const extractedGuns = extractWeapons(mockActorWithGun);
    expect(extractedGuns.length).toBe(1);
    expect(extractedGuns[0].name).toBe('SIG Sauer P226');
    expect(extractedGuns[0].damage).toBe('1d10');
  });

  it('returns tactical actions list', () => {
    const tactics = extractTacticalActions();
    expect(tactics.length).toBeGreaterThanOrEqual(5);
    expect(tactics.some((t) => t.id === 'dodge')).toBe(true);
    expect(tactics.some((t) => t.id === 'aim')).toBe(true);
  });
});
