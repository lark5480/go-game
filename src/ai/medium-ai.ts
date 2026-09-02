import { chooseEasyMove } from './easy-ai';
import { reportAiDegradation } from './ai-status';
import type { Board, Player, Point } from '@/engine/types';

let worker: Worker | undefined;
let nextRequestId = 1;

const supportsWorker = (): boolean => typeof Worker !== 'undefined';

/** Terminates the Web Worker to free resources. Called when the game ends. */
export const terminateWorker = (): void => {
  if (worker) {
    worker.terminate();
    worker = undefined;
  }
};

const searchInWorker = (
  board: Board,
  player: Player,
  positionHashes: ReadonlySet<string>,
): Promise<Point | null> =>
  new Promise<Point | null>((resolve) => {
    try {
      worker ??= new Worker(new URL('./search-worker.ts', import.meta.url), { type: 'module' });
    } catch {
      // Construction throws under a CSP without worker-src, on file:// pages,
      // or without module-worker support: fall back to the easy move.
      reportAiDegradation('worker-construction-failed');
      resolve(null);
      return;
    }
    const instance = worker;
    const requestId = nextRequestId++;
    let timeout = 0;
    let settled = false;
    const finish = (move: Point | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      instance.removeEventListener('message', handleMessage);
      resolve(move);
    };
    const handleMessage = (event: MessageEvent<{ requestId: number; move: Point | null }>) => {
      if (event.data.requestId !== requestId) return;
      finish(event.data.move);
    };
    // Generous headroom over the 600ms search budget so a busy worker on a slow
    // machine still resolves its real search instead of dropping to the weaker
    // synchronous fallback mid-game. Afterwards stop the (possibly wedged)
    // search outright; the next request spawns a fresh worker.
    timeout = window.setTimeout(() => {
      reportAiDegradation('worker-timeout');
      finish(null);
      if (worker === instance) terminateWorker();
    }, 1500);
    // A worker that dies before answering (script load failure, crash, CSP
    // violation) resolves immediately instead of burning the full timeout.
    instance.addEventListener('error', () => {
      reportAiDegradation('worker-error');
      finish(null);
      if (worker === instance) terminateWorker();
    });
    instance.addEventListener('message', handleMessage);
    instance.postMessage({
      requestId,
      board,
      player,
      durationMs: 600,
      positionHashes: [...positionHashes],
    });
  });

export const chooseMediumMove = async (
  board: Board,
  player: Player,
  positionHashes: ReadonlySet<string> = new Set(),
): Promise<Point | null> => {
  if (!supportsWorker()) {
    reportAiDegradation('worker-unsupported');
    return chooseEasyMove(board, player, { positionHashes });
  }
  return await searchInWorker(board, player, positionHashes)
    ?? chooseEasyMove(board, player, { positionHashes });
};
