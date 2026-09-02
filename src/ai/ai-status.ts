export type AiDegradationReason =
  | 'worker-unsupported'
  | 'worker-construction-failed'
  | 'worker-timeout'
  | 'worker-error';

export interface AiStatusEvent {
  reason: AiDegradationReason;
  at: number;
}

type AiStatusListener = (event: AiStatusEvent | null) => void;

let lastEvent: AiStatusEvent | null = null;
const listeners = new Set<AiStatusListener>();

/**
 * Records a degradation and notifies every current subscriber. Degradation
 * means the medium MCTS engine could not be used and the weaker synchronous
 * heuristic answered instead — the user must be able to tell the difference.
 */
export const reportAiDegradation = (reason: AiDegradationReason): void => {
  const event: AiStatusEvent = { reason, at: Date.now() };
  lastEvent = event;
  // Iterate over a snapshot: a listener may unsubscribe during notification.
  for (const listener of [...listeners]) listener(event);
};

/**
 * Subscribes to degradation events. The past is deliberately not replayed, so
 * a component that mounts later does not re-announce an already handled event.
 */
export const subscribeAiStatus = (listener: AiStatusListener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getLastAiStatus = (): AiStatusEvent | null => lastEvent;

/** Test-only: wipes both the recorded event and every subscriber. */
export const resetAiStatus = (): void => {
  lastEvent = null;
  listeners.clear();
};
