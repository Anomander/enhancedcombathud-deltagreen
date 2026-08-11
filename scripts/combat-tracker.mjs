/**
 * Combat state tracker integration for Delta Green Enhanced Combat HUD.
 */

export class CombatTracker {
  constructor() {
    this.currentCombatantId = null;
    this.round = 0;
    this.turn = 0;
    this.actionUsed = false;
    this.movementUsed = false;
    this.reactionUsed = false;
  }

  /**
   * Update tracker state from combat document.
   * @param {object} combat - Foundry combat instance or mock object.
   * @param {string} [controlledTokenId] - Currently controlled token ID.
   * @returns {object} Combat status snapshot.
   */
  update(combat, controlledTokenId) {
    if (!combat || !combat.started) {
      return this.reset();
    }

    this.round = combat.round || 0;
    this.turn = combat.turn || 0;

    const currentCombatant = combat.combatant || (combat.turns ? combat.turns[combat.turn] : null);
    this.currentCombatantId = currentCombatant?.tokenId || currentCombatant?.token?.id || null;

    const isMyTurn = Boolean(controlledTokenId && this.currentCombatantId === controlledTokenId);

    return {
      active: true,
      round: this.round,
      turn: this.turn,
      currentCombatantId: this.currentCombatantId,
      currentCombatantName: currentCombatant?.name || 'Unknown',
      isMyTurn,
      actionUsed: this.actionUsed,
      movementUsed: this.movementUsed,
      reactionUsed: this.reactionUsed
    };
  }

  /**
   * Reset combat status.
   */
  reset() {
    this.currentCombatantId = null;
    this.round = 0;
    this.turn = 0;
    this.actionUsed = false;
    this.movementUsed = false;
    this.reactionUsed = false;

    return {
      active: false,
      round: 0,
      turn: 0,
      currentCombatantId: null,
      currentCombatantName: '',
      isMyTurn: false,
      actionUsed: false,
      movementUsed: false,
      reactionUsed: false
    };
  }

  /**
   * Mark an action type as used in current round.
   * @param {'action'|'move'|'reaction'} type
   */
  useAction(type) {
    if (type === 'action') this.actionUsed = true;
    if (type === 'move') this.movementUsed = true;
    if (type === 'reaction') this.reactionUsed = true;
  }

  /**
   * Reset round turn actions.
   */
  startNewTurn() {
    this.actionUsed = false;
    this.movementUsed = false;
    this.reactionUsed = false;
  }
}
