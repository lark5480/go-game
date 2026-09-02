import type { Board, Cell } from './types';

/**
 * Flat, allocation-light rule primitives for hot paths (MCTS playouts, AI heuristics).
 *
 * Cells: 0 = empty, 1 = black, 2 = white. All functions share a per-size FastContext
 * holding reusable typed-array buffers, so legality probing allocates nothing per call
 * and check/measure modes always restore the input board exactly.
 *
 * Capture/suicide semantics are exactly those of `legalMoveResult` in ./rules.ts;
 * positional superko is intentionally NOT handled here (the store owns that).
 */

export const FLAT_EMPTY = 0;
export const FLAT_BLACK = 1;
export const FLAT_WHITE = 2;

export interface FastContext {
  readonly size: number;
  readonly total: number;
  /** Four neighbor indices per point, -1 for off-board directions. */
  readonly neighbors: Int32Array;
  /** Indices of stones captured by the most recent resolve* call. */
  readonly capturedBuf: Int32Array;
  capturedCount: number;
  /** Own-group liberties after the most recent measured move (see measureMove). */
  measureLiberties: number;
  /** Members of the group found by groupLibertiesAt. */
  readonly groupBuf: Int32Array;
  groupSize: number;
  libertyCount: number;
  /* internal reusable buffers */
  readonly visited: Int32Array;
  readonly stack: Int32Array;
  generation: number;
}

const contextCache = new Map<number, FastContext>();

const buildNeighborTable = (size: number): Int32Array => {
  const total = size * size;
  const table = new Int32Array(total * 4).fill(-1);
  for (let index = 0; index < total; index += 1) {
    const x = index % size;
    const y = (index - x) / size;
    const base = index * 4;
    if (x >= 1) table[base] = index - 1;
    if (x < size - 1) table[base + 1] = index + 1;
    if (y >= 1) table[base + 2] = index - size;
    if (y < size - 1) table[base + 3] = index + size;
  }
  return table;
};

export const getFastContext = (size: number): FastContext => {
  const cached = contextCache.get(size);
  if (cached) return cached;
  const total = size * size;
  const context: FastContext = {
    size,
    total,
    neighbors: buildNeighborTable(size),
    capturedBuf: new Int32Array(total),
    capturedCount: 0,
    measureLiberties: 0,
    groupBuf: new Int32Array(total),
    groupSize: 0,
    libertyCount: 0,
    visited: new Int32Array(total),
    stack: new Int32Array(total),
    generation: 0,
  };
  contextCache.set(size, context);
  return context;
};

const nextGeneration = (ctx: FastContext): number => {
  const next = ctx.generation + 1;
  // Guard against Int32 stamp wrap-around producing false "already visited" hits.
  if (next >= 0x7ffffff0) {
    ctx.visited.fill(0);
    ctx.generation = 1;
    return 1;
  }
  ctx.generation = next;
  return next;
};

export const flatCellOf = (cell: Cell): number =>
  cell === 'black' ? FLAT_BLACK : cell === 'white' ? FLAT_WHITE : FLAT_EMPTY;

export const flatFromBoard = (board: Board): Uint8Array => {
  const size = board.length;
  const flat = new Uint8Array(size * size);
  for (let y = 0; y < size; y += 1) {
    const row = board[y];
    for (let x = 0; x < size; x += 1) flat[y * size + x] = flatCellOf(row[x]);
  }
  return flat;
};

export const boardFromFlat = (flat: Uint8Array, size: number): Board => {
  const board: Cell[][] = Array.from({ length: size }, () => Array<Cell>(size).fill('empty'));
  for (let index = 0; index < flat.length; index += 1) {
    const value = flat[index];
    if (value === FLAT_EMPTY) continue;
    board[(index - (index % size)) / size][index % size] =
      value === FLAT_BLACK ? 'black' : 'white';
  }
  return board;
};

type ResolveMode = 'check' | 'apply' | 'measure';

/**
 * Core move resolution on `flat`.
 * - check:   restores `flat` exactly; captures reported via ctx.capturedCount.
 * - measure: restores `flat`; additionally reports post-move own liberties via
 *            ctx.measureLiberties (captures included).
 * - apply:   commits stone + captures when legal; leaves `flat` untouched otherwise.
 * Returns whether the move is legal.
 */
const resolveMove = (
  ctx: FastContext,
  flat: Uint8Array,
  player: number,
  index: number,
  mode: ResolveMode,
): boolean => {
  ctx.capturedCount = 0;
  ctx.measureLiberties = 0;
  if (index < 0 || index >= ctx.total || flat[index] !== FLAT_EMPTY) return false;
  const opponent = player === FLAT_BLACK ? FLAT_WHITE : FLAT_BLACK;
  const { neighbors, visited, stack, groupBuf, capturedBuf } = ctx;
  const generation = nextGeneration(ctx);
  flat[index] = player;

  let capturedCount = 0;
  for (let direction = 0; direction < 4; direction += 1) {
    const neighbour = neighbors[index * 4 + direction];
    if (neighbour < 0 || flat[neighbour] !== opponent || visited[neighbour] === generation) continue;
    let top = 0;
    stack[top++] = neighbour;
    visited[neighbour] = generation;
    let groupSize = 0;
    groupBuf[groupSize++] = neighbour;
    let hasLiberty = false;
    while (top > 0) {
      const current = stack[--top];
      for (let d = 0; d < 4; d += 1) {
        const other = neighbors[current * 4 + d];
        if (other < 0) continue;
        const value = flat[other];
        if (value === FLAT_EMPTY) hasLiberty = true;
        else if (value === opponent && visited[other] !== generation) {
          visited[other] = generation;
          stack[top++] = other;
          groupBuf[groupSize++] = other;
        }
      }
    }
    if (!hasLiberty) {
      for (let i = 0; i < groupSize; i += 1) {
        const stone = groupBuf[i];
        flat[stone] = FLAT_EMPTY;
        capturedBuf[capturedCount++] = stone;
      }
    }
  }

  // Own-group liberties are evaluated on the post-capture position, matching
  // legalMoveResult's semantics (it inspects result.board). Only `measure`
  // callers need the exact count; legality alone can stop at the first
  // liberty. The capturedCount === 1 case keeps the exact count because the
  // MCTS playouts use it for their simple-ko heuristic.
  const exactLiberties = mode === 'measure' || capturedCount === 1;
  const measureLiberties = countGroupLiberties(
    ctx,
    flat,
    player,
    index,
    !exactLiberties, // pure legality probing can stop at the first liberty
  );
  const legal = capturedCount > 0 || measureLiberties > 0;

  if (!legal || mode !== 'apply') {
    flat[index] = FLAT_EMPTY;
    for (let i = 0; i < capturedCount; i += 1) flat[capturedBuf[i]] = opponent;
  }
  ctx.capturedCount = capturedCount;
  ctx.measureLiberties = measureLiberties;
  return legal;
};

/** Floods the group containing `index`, counting distinct adjacent empty points.
 *  With `stopAtFirst` it returns 1 as soon as any liberty is found. */
const countGroupLiberties = (
  ctx: FastContext,
  flat: Uint8Array,
  player: number,
  index: number,
  stopAtFirst = false,
): number => {
  const { neighbors, visited, stack } = ctx;
  const generation = nextGeneration(ctx);
  let top = 0;
  stack[top++] = index;
  visited[index] = generation;
  let liberties = 0;
  while (top > 0) {
    const current = stack[--top];
    for (let d = 0; d < 4; d += 1) {
      const other = neighbors[current * 4 + d];
      if (other < 0) continue;
      const value = flat[other];
      if (value === FLAT_EMPTY) {
        if (visited[other] !== generation) {
          visited[other] = generation;
          liberties += 1;
          if (stopAtFirst) return liberties;
        }
      } else if (value === player && visited[other] !== generation) {
        visited[other] = generation;
        stack[top++] = other;
      }
    }
  }
  return liberties;
};

/** Legality probe without lasting side effects. Afterwards ctx.capturedCount holds
 *  the number of stones this move would capture. */
export const isQuickLegal = (
  ctx: FastContext,
  flat: Uint8Array,
  player: number,
  index: number,
): boolean => resolveMove(ctx, flat, player, index, 'check');

/** Like isQuickLegal, additionally reporting the playing side's post-move liberty
 *  count via ctx.measureLiberties (captures included). Restores `flat`. */
export const measureMove = (
  ctx: FastContext,
  flat: Uint8Array,
  player: number,
  index: number,
): boolean => resolveMove(ctx, flat, player, index, 'measure');

/** Applies the move in place when legal; otherwise leaves `flat` untouched.
 *  Captured indices are available in ctx.capturedBuf[0 .. ctx.capturedCount). */
export const tryApplyMove = (
  ctx: FastContext,
  flat: Uint8Array,
  player: number,
  index: number,
): boolean => resolveMove(ctx, flat, player, index, 'apply');

/** Floods the existing group at `index` (must hold a stone); reports members in
 *  ctx.groupBuf[0 .. ctx.groupSize) and their liberty count in ctx.libertyCount.
 *  Does not mutate `flat`. */
export const groupLibertiesAt = (ctx: FastContext, flat: Uint8Array, index: number): void => {
  const player = flat[index];
  if (player !== FLAT_BLACK && player !== FLAT_WHITE) {
    ctx.groupSize = 0;
    ctx.libertyCount = 0;
    return;
  }
  const { neighbors, visited, stack, groupBuf } = ctx;
  const generation = nextGeneration(ctx);
  let top = 0;
  stack[top++] = index;
  visited[index] = generation;
  let groupSize = 0;
  groupBuf[groupSize++] = index;
  let liberties = 0;
  while (top > 0) {
    const current = stack[--top];
    for (let d = 0; d < 4; d += 1) {
      const other = neighbors[current * 4 + d];
      if (other < 0) continue;
      const value = flat[other];
      if (value === FLAT_EMPTY) {
        if (visited[other] !== generation) {
          visited[other] = generation;
          liberties += 1;
        }
      } else if (value === player && visited[other] !== generation) {
        visited[other] = generation;
        stack[top++] = other;
        groupBuf[groupSize++] = other;
      }
    }
  }
  ctx.groupSize = groupSize;
  ctx.libertyCount = liberties;
};
