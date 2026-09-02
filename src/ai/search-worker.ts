import { MCTS } from './mcts';
import type { Board, Player } from '@/engine/types';

export interface SearchRequest {
  requestId: number;
  board: Board;
  player: Player;
  durationMs?: number;
  maxIterations?: number;
  /** Serialized positional-superko history (see MctsOptions.positionHashes). */
  positionHashes?: string[];
}

export interface SearchResponse {
  requestId: number;
  move: Point | null;
}

type Point = { x: number; y: number };

/** Messages come from our own page, but clamp anyway so a malformed one can
 *  only shorten or bound the search, never unbound it. */
const clampNumber = (value: number | undefined, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

self.addEventListener('message', (event: MessageEvent<SearchRequest>) => {
  const { board, player, requestId, positionHashes } = event.data;
  const durationMs = clampNumber(event.data.durationMs, 50, 2000, 600);
  // Purely a runaway guard: the time budget binds first in practice. No field
  // means "time-primary", i.e. only this ceiling applies.
  const maxIterations = clampNumber(event.data.maxIterations, 1, 50_000, 50_000);
  try {
    const search = new MCTS(board, player, {
      maxIterations,
      positionHashes: positionHashes ? new Set(positionHashes) : undefined,
    });
    search.run(durationMs, maxIterations);
    const response: SearchResponse = { requestId, move: search.best() };
    self.postMessage(response);
  } catch {
    // Malformed board etc.: answer instead of leaving the main thread waiting.
    const response: SearchResponse = { requestId, move: null };
    self.postMessage(response);
  }
});
