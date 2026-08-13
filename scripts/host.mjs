/**
 * The presentation host seam.
 *
 * The core must not know which HUD is drawing it (ARCH-6). Everything the core
 * needs *from* the presentation layer — which actor is bound, and how to toggle
 * or refresh the surface — is reached through this interface. `scripts/argon/`
 * implements it and registers it at `argonInit`.
 *
 * This is what makes the deletion test real: remove `scripts/argon/` and the
 * module still loads, because the null host takes over and every capability
 * degrades to "nothing is bound" rather than throwing.
 *
 * @typedef {object} PresentationHost
 * @property {object|null} actor - The actor currently shown. A live getter.
 * @property {object|null} token - Its token, if any. A live getter.
 * @property {boolean} isVisible
 * @property {(token?: object|null) => unknown} toggle
 * @property {() => unknown} refresh
 */

/** In use until a presentation layer registers. Never throws. */
const NULL_HOST = Object.freeze({
  actor: null,
  token: null,
  isVisible: false,
  toggle: () => undefined,
  refresh: () => undefined
});

let current = NULL_HOST;

/**
 * Install the presentation layer's host. Called once, from `scripts/argon/`.
 * @param {PresentationHost|null} host
 */
export function registerHost(host) {
  current = host ?? NULL_HOST;
}

/**
 * The host in use. Always an object — never null.
 * @returns {PresentationHost}
 */
export function getHost() {
  return current;
}

/** Restore the null host. Used when a HUD unloads, and as a test seam (TEST-3). */
export function clearHost() {
  current = NULL_HOST;
}
