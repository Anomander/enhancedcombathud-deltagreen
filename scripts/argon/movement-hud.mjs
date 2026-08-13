/**
 * Movement HUD — deliberately suppressed.
 *
 * Delta Green has no movement economy comparable to the systems Argon's movement
 * tracker was built for, so there is nothing meaningful to display.
 *
 * This class must exist rather than simply not calling `defineMovementHud`:
 * Argon defaults `MOVEMENT` to its own base `MovementHud`, whose `movementMax` is
 * an unimplemented getter. Left alone it renders "NaN" over the token. Registering
 * a permanently hidden subclass is how a system opts out (UX-1: no control that
 * cannot act).
 */

export function createMovementHud(ARGON) {
  return class DGMovementHud extends ARGON.MovementHud {
    get visible() {
      return false;
    }

    /** Never rendered, but keep the arithmetic finite if Argon reaches for it. */
    get movementMax() {
      return 0;
    }

    get movementColor() {
      return 'base-movement';
    }

    /*
     * `movementUsed` is deliberately NOT overridden: the base class declares it as
     * a getter/setter pair, and redeclaring only the getter shadows the setter, so
     * the base `updateMovementUsed()` throws "Cannot set property ... which has
     * only a getter". Suppress the work at its source instead.
     */
    updateMovementUsed() {}

    updateMovement() {}
  };
}
