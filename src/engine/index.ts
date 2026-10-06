// Public API of the rules engine.

export * from './actions';
export * from './cards';
export * from './config';
export * from './events';
export * from './field';
export * from './state';
export { createGame, SetupError, type GameSetup } from './setup';
export { applyAction, IllegalActionError } from './reducer';
export { legalActions } from './legal';
export { validateAction } from './validate';
export { viewFor, eventsFor, type PlayerView, type SlotView } from './view';
export { replay } from './replay';
export { affinityFor } from './affinity';
export { adjustAmount, adjustPenalty, spellFizzles } from './affinity';
export { scoreSide, type SideScore } from './score';
