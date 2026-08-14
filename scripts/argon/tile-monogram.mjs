/**
 * The glyph a tile carries when it has no art.
 *
 * Skills and statistics both render as Argon ActionButtons, which paint `icon`
 * as a background image — and neither has one in the Delta Green system. Shared
 * so a stat tile and a skill tile read as the same kind of thing.
 */

import { monogram } from '../skill-display.mjs';

/**
 * @param {HTMLElement} element The button's root.
 * @param {string} label The name the glyph is derived from.
 */
export function addMonogram(element, label) {
  // Argon paints `icon` unconditionally, so an empty one leaves `url("")` behind
  // — a request for the page itself. A tile with no art asks for nothing.
  element.style.backgroundImage = 'none';

  const mark = document.createElement('span');
  mark.classList.add('dg-skill-monogram');
  mark.setAttribute('aria-hidden', 'true'); // the label beneath it already says this
  mark.textContent = monogram(label);
  element.prepend(mark);
}
