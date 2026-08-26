import {
  FLAT_BLACK,
  FLAT_EMPTY,
  FLAT_WHITE,
  boardFromFlat,
  flatFromBoard,
  getFastContext,
  groupLibertiesAt,
  measureMove,
  tryApplyMove,
} from '@/engine/fast-rules';
import { hashBoard } from '@/engine/rules';
import type { Board, Player, Point, StoneMap } from '@/engine/types';

export interface EasyAiOptions {
  random?: () => number;
  /** Known game positions (superko): candidates recreating one are skipped. */
  positionHashes?: ReadonlySet<string>;
}

/**
 * Heuristic move choice. Scoring formula and tie-breaking behaviour are
 * byte-for-byte equivalent to the previous implementation; only the mechanics
 * changed: one flat scratch board plus zero-allocation legality probes instead
 * of cloning the entire grid for every candidate.
 */
export const chooseEasyMove = (
  board: Board,
  player: Player,
  options: EasyAiOptions = {},
): Point | null => {
  const random = options.random ?? Math.random;
  const positionHashes = options.positionHashes;
  const size = board.length;
  const context = getFastContext(size);
  const flat = flatFromBoard(board);
  // Scratch copy for superko probing; tryApplyMove commits/rolls back cleanly.
  const probeFlat = positionHashes ? flat.slice() : null;
  const playerCode = player === 'black' ? FLAT_BLACK : FLAT_WHITE;
  const enemyCode = playerCode === FLAT_BLACK ? FLAT_WHITE : FLAT_BLACK;
  const center = (size - 1) / 2;

  /** Enemy-group liberties memoised per member index: adjacent candidates share
   *  one flood fill instead of reflooding the same group over and over. */
  const enemyLiberties = new Map<number, number>();
  const libertyOfEnemyAt = (index: number): number => {
    const cached = enemyLiberties.get(index);
    if (cached !== undefined) return cached;
    groupLibertiesAt(context, flat, index);
    const liberties = context.libertyCount;
    for (let i = 0; i < context.groupSize; i += 1) enemyLiberties.set(context.groupBuf[i], liberties);
    return liberties;
  };

  let bestPoint: Point | null = null;
  let bestScore = -Infinity;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = y * size + x;
      if (flat[index] !== FLAT_EMPTY) continue;
      // Legality probe restores `flat`; afterwards capturedCount/measureLiberties
      // describe this hypothetical move (captures included).
      if (!measureMove(context, flat, playerCode, index)) continue;
      const capturedCount = context.capturedCount;
      const ownLiberties = context.measureLiberties;

      // Positional superko: skip moves recreating a known game position.
      if (probeFlat && positionHashes) {
        probeFlat.set(flat);
        tryApplyMove(context, probeFlat, playerCode, index);
        if (positionHashes.has(hashBoard(boardFromFlat(probeFlat, size)))) continue;
      }

      const distance = Math.hypot(x - center, y - center);
      let score = Math.max(0, size - distance) / size + random() * 0.15;
      if (capturedCount > 0) score += 8 + capturedCount * 2;

      const neighbours = [
        x >= 1 ? index - 1 : -1,
        x < size - 1 ? index + 1 : -1,
        y >= 1 ? index - size : -1,
        y < size - 1 ? index + size : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || flat[neighbour] !== enemyCode) continue;
        const liberties = libertyOfEnemyAt(neighbour);
        if (liberties <= 2) score += liberties === 1 ? 6 : 3;
      }

      score += Math.min(2, ownLiberties * 0.4);
      if (x <= 0 || y <= 0 || x >= size - 1 || y >= size - 1) score -= 1;

      if (score > bestScore) {
        bestScore = score;
        bestPoint = { x, y };
      }
    }
  }

  return bestPoint;
};

export type DeadStoneMap = StoneMap;
