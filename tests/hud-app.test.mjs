import { describe, it, expect, beforeEach } from 'vitest';
import { DeltaGreenCombatHudApp } from '../scripts/hud-app.mjs';

function createMockElement(tagName = 'div') {
  const classes = new Set();
  const children = [];
  let _className = '';
  return {
    tagName,
    get className() { return _className; },
    set className(val) {
      _className = val;
      classes.clear();
      String(val).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
    },
    classList: {
      add: (...names) => names.forEach((n) => classes.add(n)),
      remove: (...names) => names.forEach((n) => classes.delete(n)),
      toggle: (name, force) => {
        if (force === undefined) {
          if (classes.has(name)) classes.delete(name);
          else classes.add(name);
        } else if (force) {
          classes.add(name);
        } else {
          classes.delete(name);
        }
      },
      contains: (name) => classes.has(name)
    },
    appendChild: (child) => children.push(child),
    querySelectorAll: () => [],
    querySelector: () => null
  };
}

describe('DeltaGreenCombatHudApp Display & Combat Controls', () => {
  let hudApp;
  let mockContainer;

  beforeEach(() => {
    mockContainer = createMockElement('div');
    hudApp = new DeltaGreenCombatHudApp();
    
    // Mock document.createElement for mount
    globalThis.document = {
      createElement: (tag) => createMockElement(tag)
    };
    
    hudApp.mount(mockContainer);
  });

  it('initializes hidden in DOM', () => {
    expect(hudApp.visible).toBe(false);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(true);
  });

  it('slides up on show() and slides down on hide()', () => {
    hudApp.show();
    expect(hudApp.visible).toBe(true);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(false);

    hudApp.hide();
    expect(hudApp.visible).toBe(false);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(true);
  });

  it('toggles visibility on toggle()', () => {
    hudApp.toggle();
    expect(hudApp.visible).toBe(true);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(false);

    hudApp.toggle();
    expect(hudApp.visible).toBe(false);
    expect(hudApp.element.classList.contains('dg-hud-hidden')).toBe(true);
  });
});
