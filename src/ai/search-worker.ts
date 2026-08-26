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

self.addEventListener('message', (event: MessageEvent<SearchRequest>) => {
  const { board, player, durationMs = 600, maxIterations = 900, requestId, positionHashes } = event.data;
  const search = new MCTS(board, player, {
    maxIterations,
    positionHashes: positionHashes ? new Set(positionHashes) : undefined,
  });
  search.run(durationMs, maxIterations);
  const response: SearchResponse = { requestId, move: search.best() };
  self.postMessage(response);
});
