import { chooseEasyMove } from './easy-ai';
import type { Board, Player, Point } from '@/engine/types';

let worker: Worker | undefined;
let nextRequestId = 1;

const supportsWorker = (): boolean => typeof Worker !== 'undefined';

const searchInWorker = (
  board: Board,
  player: Player,
  positionHashes: ReadonlySet<string>,
): Promise<Point | null> =>
  new Promise<Point | null>((resolve) => {
    worker ??= new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' });
    const requestId = nextRequestId++;
    // Generous headroom over the 600ms search budget so a busy worker on a slow
    // machine still resolves its real search instead of dropping to the weaker
    // synchronous fallback mid-game.
    const timeout = window.setTimeout(() => resolve(null), 1500);
    const handleMessage = (event: MessageEvent<{ requestId: number; move: Point | null }>) => {
      if (event.data.requestId !== requestId) return;
      window.clearTimeout(timeout);
      worker?.removeEventListener('message', handleMessage);
      resolve(event.data.move);
    };
    worker.addEventListener('message', handleMessage);
    worker.postMessage({
      requestId,
      board,
      player,
      durationMs: 600,
      maxIterations: 900,
      positionHashes: [...positionHashes],
    });
  });

export const chooseMediumMove = async (
  board: Board,
  player: Player,
  positionHashes: ReadonlySet<string> = new Set(),
): Promise<Point | null> => {
  if (!supportsWorker()) return chooseEasyMove(board, player, { positionHashes });
  return await searchInWorker(board, player, positionHashes)
    ?? chooseEasyMove(board, player, { positionHashes });
};
