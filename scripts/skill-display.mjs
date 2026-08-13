/**
 * Text a skill tile is built from.
 *
 * A skill has no art in the Delta Green system, and Argon paints a button's
 * `icon` as a background image — so a skill tile has nothing to recognise it by
 * except its own name. `monogram` gives each tile a glyph derived from that
 * name, and `matchesSkill` is the test behind the filter box over the list.
 *
 * Derived from the label the actor supplies, never from a table of skills the
 * module knows about (SYS-2): both work for typed skills, Special Training and
 * the unnatural skill set alike.
 *
 * Pure, Foundry-free and DOM-free (TEST-6); rendered by scripts/argon/skill-panels.mjs.
 */

/** Words, with punctuation and parentheses treated as separators. */
function words(label) {
  return String(label ?? '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

/** The first `count` characters of a word, upper-cased. Spread, so surrogate pairs survive. */
function head(word, count) {
  return [...word].slice(0, count).join('').toUpperCase();
}

/**
 * Fold case and accents so a query matches regardless of how it was typed.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/**
 * The glyph a skill tile carries: one or two letters standing for the skill.
 *
 * A single word gives its first two letters ("Firearms" → FI). Anything longer
 * gives the first letter of its first and last words, which keeps typed skills
 * apart — "Art (Painting)" → AP, "Art (Sculpture)" → AS — where the leading
 * word alone would collide.
 *
 * @param {string|null|undefined} label
 * @returns {string} Empty when there is no label to derive from (SYS-5/UX-1).
 */
export function monogram(label) {
  const parts = words(label);
  if (!parts.length) return '';
  if (parts.length === 1) return head(parts[0], 2);

  return head(parts[0], 1) + head(parts[parts.length - 1], 1);
}

/**
 * Does a skill belong in the filtered list?
 *
 * Matches a substring of the label, or the tile's monogram — "hw" finds Heavy
 * Weapons, which is how a player abbreviates mid-firefight. An empty query
 * matches everything, so clearing the box restores the whole list.
 *
 * @param {string|null|undefined} query
 * @param {string|null|undefined} label
 * @returns {boolean}
 */
export function matchesSkill(query, label) {
  const needle = normalizeText(query).trim();
  if (!needle) return true;
  if (label === null || label === undefined) return false;

  const haystack = normalizeText(label);
  if (haystack.includes(needle)) return true;

  return normalizeText(monogram(label)).startsWith(needle);
}
