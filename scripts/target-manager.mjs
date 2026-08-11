/**
 * Pure target selection manager for Delta Green Enhanced Combat HUD.
 */

export class TargetManager {
  constructor() {
    this.active = false;
    this.targetCount = 1;
    this.selectedTargets = new Set();
    this.pendingAction = null;
  }

  /**
   * Activate target mode for a specific action.
   * @param {object} action - The action object needing targets.
   * @param {number} [targetLimit=1] - Maximum allowed targets.
   */
  startTargeting(action, targetLimit = 1) {
    this.active = true;
    this.pendingAction = action;
    this.targetCount = targetLimit;
    this.selectedTargets.clear();
    return this.getState();
  }

  /**
   * Cancel targeting mode.
   */
  cancelTargeting() {
    this.active = false;
    this.pendingAction = null;
    this.selectedTargets.clear();
    return this.getState();
  }

  /**
   * Adjust target count threshold.
   * @param {number} delta - Amount to add (+1 or -1).
   */
  adjustTargetCount(delta) {
    this.targetCount = Math.max(1, this.targetCount + delta);
    return this.getState();
  }

  /**
   * Toggle token selection.
   * @param {string} tokenId - Token document ID.
   */
  toggleTarget(tokenId) {
    if (!this.active) return this.getState();

    if (this.selectedTargets.has(tokenId)) {
      this.selectedTargets.delete(tokenId);
    } else {
      if (this.selectedTargets.size >= this.targetCount) {
        // Drop oldest target if limit reached
        const first = this.selectedTargets.values().next().value;
        if (first) this.selectedTargets.delete(first);
      }
      this.selectedTargets.add(tokenId);
    }

    return this.getState();
  }

  /**
   * Get current targeting state.
   * @returns {object} Targeting state snapshot.
   */
  getState() {
    return {
      active: this.active,
      targetCount: this.targetCount,
      selectedCount: this.selectedTargets.size,
      targets: Array.from(this.selectedTargets),
      pendingAction: this.pendingAction
    };
  }
}
