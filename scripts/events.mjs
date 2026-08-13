/**
 * A minimal in-module event bus.
 *
 * Roll outcomes have to be observable so that effects and automation can attach
 * to them without editing click handlers (FR-25). The Delta Green system fires
 * no hook anywhere in its roll pipeline, so there is nothing to subscribe to —
 * this is ours to publish.
 *
 * Deliberately not Foundry's `Hooks`: the core must be testable with no Foundry
 * globals present (TEST-6). The composition root bridges these to a Foundry hook
 * for the benefit of other modules.
 */

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/** Events this module publishes. */
export const EVENTS = Object.freeze({
  /** A roll completed and was actually evaluated. Payload: RollOutcome. */
  ROLL_OUTCOME: 'rollOutcome'
});

/**
 * Subscribe.
 * @param {string} event
 * @param {Function} handler
 * @returns {() => void} Unsubscribe.
 */
export function on(event, handler) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(handler);
  return () => off(event, handler);
}

/**
 * Unsubscribe.
 * @param {string} event
 * @param {Function} handler
 */
export function off(event, handler) {
  listeners.get(event)?.delete(handler);
}

/**
 * Publish. A throwing subscriber must not break the roll that triggered it, so
 * failures are contained and reported rather than propagated.
 * @param {string} event
 * @param {unknown} payload
 * @returns {Array<unknown>} Whatever the handlers returned, in order.
 */
export function emit(event, payload) {
  const handlers = listeners.get(event);
  if (!handlers?.size) return [];

  const results = [];
  for (const handler of [...handlers]) {
    try {
      results.push(handler(payload));
    } catch (error) {
      results.push(undefined);
      globalThis.console?.error?.('Delta Green Combat HUD | event handler failed', event, error);
    }
  }
  return results;
}

/** Drop every subscription. Test seam (TEST-3). */
export function clearListeners() {
  listeners.clear();
}
