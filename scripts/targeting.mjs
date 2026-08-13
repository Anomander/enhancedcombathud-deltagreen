/**
 * What the HUD may say about who you are pointing at.
 *
 * Pure, so the disclosure rules can be tested headless (TEST-6). The component
 * asks; this answers. Nothing here touches Foundry globals or the DOM.
 *
 * The rules matter more than they look. A Handler who has set a token's name to
 * be hidden has made a deliberate choice about what the table knows, and a
 * convenience surface that leaks it around the back is a real harm to a game —
 * the same reasoning as UX-5 for Sanity. Where this cannot tell, it stays quiet.
 */

/**
 * Foundry's `CONST.TOKEN_DISPLAY_MODES`, restated so this module needs no
 * globals. Verified against Foundry v14 `CONST.TOKEN_DISPLAY_MODES`.
 */
export const TOKEN_DISPLAY_MODES = Object.freeze({
  NONE: 0,
  CONTROL: 10,
  OWNER_HOVER: 20,
  HOVER: 30,
  OWNER: 40,
  ALWAYS: 50
});

/** Modes that show the name to anyone at the table. */
const PUBLIC_MODES = new Set([TOKEN_DISPLAY_MODES.HOVER, TOKEN_DISPLAY_MODES.ALWAYS]);

/** Modes that show the name only to someone who owns the token. */
const OWNER_MODES = new Set([
  TOKEN_DISPLAY_MODES.CONTROL,
  TOKEN_DISPLAY_MODES.OWNER_HOVER,
  TOKEN_DISPLAY_MODES.OWNER
]);

/**
 * May this user be shown this token's name?
 *
 * An unreadable display mode is treated as hidden. Erring towards silence is the
 * only safe direction: showing a name that should have been secret cannot be
 * undone, while withholding one is a visible, correctable annoyance.
 *
 * @param {object|null} token - A Token placeable or TokenDocument.
 * @param {{isGM?: boolean}} [viewer]
 * @returns {boolean}
 */
export function canSeeTokenName(token, { isGM = false } = {}) {
  if (!token) return false;
  if (isGM) return true;

  const mode = Number(token.document?.displayName ?? token.displayName);
  if (!Number.isFinite(mode)) return false;

  if (PUBLIC_MODES.has(mode)) return true;

  const owned = Boolean(token.actor?.isOwner);
  return owned && OWNER_MODES.has(mode);
}

/**
 * @typedef {object} TargetState
 * @property {'none'|'one'|'many'} kind
 * @property {number} count
 * @property {string|null} name - The target's name, or null when it must not be shown.
 */

/**
 * Describe the current targeting state.
 *
 * `many` is its own state rather than an error: resolution against several
 * targets is genuinely ambiguous, and the player is owed an explanation of why
 * automation stood down rather than silence (UX-6).
 *
 * @param {Array<object>} tokens - The user's targeted tokens.
 * @param {{isGM?: boolean}} [viewer]
 * @returns {TargetState}
 */
export function describeTargets(tokens, { isGM = false } = {}) {
  const targets = Array.isArray(tokens) ? tokens.filter(Boolean) : [];

  if (targets.length === 0) return { kind: 'none', count: 0, name: null };
  if (targets.length > 1) return { kind: 'many', count: targets.length, name: null };

  const [token] = targets;
  const visible = canSeeTokenName(token, { isGM });

  return {
    kind: 'one',
    count: 1,
    name: visible ? token.name ?? token.document?.name ?? null : null
  };
}
