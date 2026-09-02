import { describe, expect, it } from 'vitest';
import {
  FLAT_BLACK,
  FLAT_EMPTY,
  FLAT_WHITE,
  flatFromBoard,
  getFastContext,
  groupLibertiesAt,
  isQuickLegal,
  measureMove,
  tryApplyMove,
} from './fast-rules';
import { groupInfo } from './board';
import { legalMoveResult } from './rules';
import type { Board, Player, Point } from './types';

/** Deterministic RNG so failures are reproducible. */
const mulberry32 = (seed: number): (() => number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const emptyBoard = (size: number): Board =>
  Array.from({ length: size }, () => Array(size).fill('empty'));

/** Plays `count` uniformly random legal moves from the reference engine. */
const randomSelfPlay = (size: number, count: number, random: () => number): Board => {
  let board = emptyBoard(size);
  let player: Player = 'black';
  for (let move = 0; move < count; move += 1) {
    const options: Point[] = [];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1)
        if (legalMoveResult(board, player, { x, y })) options.push({ x, y });
    if (options.length === 0) break;
    const choice = options[Math.floor(random() * options.length)];
    board = legalMoveResult(board, player, choice)!.board;
    player = player === 'black' ? 'white' : 'black';
  }
  return board;
};

/** Unnatural but flood-fill-stressing positions: random stone soup. */
const randomSoup = (size: number, fillRatio: number, random: () => number): Board => {
  const board = emptyBoard(size);
  for (let y = 0; y < size; y += 1)
    for (let x = 0; x < size; x += 1)
      if (random() < fillRatio) board[y][x] = random() < 0.5 ? 'black' : 'white';
  return board;
};

const codeOf = (player: Player): number => (player === 'black' ? FLAT_BLACK : FLAT_WHITE);

describe.each([9, 13, 19])('fast rules parity on %ix%i', (size) => {
  const ctx = getFastContext(size);

  const expectParity = (board: Board) => {
    const flat = flatFromBoard(board);
    for (const player of ['black', 'white'] as Player[]) {
      const code = codeOf(player);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (board[y][x] !== 'empty') continue;
          const reference = legalMoveResult(board, player, { x, y });
          const quick = isQuickLegal(ctx, flat, code, y * size + x);
          expect(quick).toBe(reference !== null);
          // check mode must not disturb the board
          expect(flat[y * size + x]).toBe(FLAT_EMPTY);
        }
      }
    }
  };

  it('matches legalMoveResult on empty and near-empty boards', () => {
    expectParity(emptyBoard(size));
    const sparse = randomSelfPlay(size, 3, mulberry32(size * 100 + 1));
    expectParity(sparse);
  });

  it('matches legalMoveResult across random games', () => {
    for (let game = 0; game < 4; game += 1) {
      const board = randomSelfPlay(size, size * size / 3, mulberry32(game + 2));
      expectParity(board);
    }
  });

  it('matches legalMoveResult on dense scrambled boards', () => {
    for (let soup = 0; soup < 6; soup += 1) {
      expectParity(randomSoup(size, 0.35 + soup * 0.1, mulberry32(soup + 50)));
    }
  });

  it('reports captures and post-move liberties like the reference engine', () => {
    for (let game = 0; game < 4; game += 1) {
      const board = randomSelfPlay(size, size, mulberry32(game + 200));
      const flat = flatFromBoard(board);
      for (const player of ['black', 'white'] as Player[]) {
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (board[y][x] !== 'empty') continue;
            const reference = legalMoveResult(board, player, { x, y });
            const index = y * size + x;
            const measured = measureMove(ctx, flat, codeOf(player), index);
            expect(measured).toBe(reference !== null);
            if (!reference || !measured) continue;
            expect(ctx.capturedCount).toBe(reference.captured.length);
            const expectedLiberties =
              groupInfo(reference.board, { x, y }).liberties.size;
            expect(ctx.measureLiberties).toBe(expectedLiberties);
            // measure must not disturb the board either
            expect(flat[index]).toBe(FLAT_EMPTY);
          }
        }
      }
    }
  });

  it('applies committed moves exactly like the reference engine', () => {
    for (let game = 0; game < 4; game += 1) {
      const board = randomSelfPlay(size, Math.floor(size * 1.5), mulberry32(game + 300));
      const flat = flatFromBoard(board);
      for (const player of ['black', 'white'] as Player[]) {
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            if (board[y][x] !== 'empty') continue;
            const reference = legalMoveResult(board, player, { x, y });
            const index = y * size + x;
            const applied = tryApplyMove(ctx, flat, codeOf(player), index);
            if (!reference) {
              expect(applied).toBe(false);
              expect(flat[index]).toBe(FLAT_EMPTY);
              continue;
            }
            expect(applied).toBe(true);
            // One whole-board comparison instead of a per-cell assertion loop:
            // the same coverage without a million expect() calls on 19x19.
            expect(flat).toEqual(flatFromBoard(reference.board));
            // reset for the next probe
            flat.set(flatFromBoard(board));
          }
        }
      }
    }
  });

  it('floods existing groups with correct liberty counts', () => {
    for (let game = 0; game < 4; game += 1) {
      const board = randomSelfPlay(size, size * 2, mulberry32(game + 400));
      const flat = flatFromBoard(board);
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
          if (board[y][x] === 'empty') continue;
          groupLibertiesAt(ctx, flat, y * size + x);
          expect(ctx.libertyCount).toBe(groupInfo(board, { x, y }).liberties.size);
          // every reported member must be a stone of the same colour
          for (let i = 0; i < ctx.groupSize; i += 1) {
            const member = ctx.groupBuf[i];
            expect(flat[member]).toBe(flat[y * size + x]);
          }
        }
      }
    }
  });
});

describe('fast rules targeted cases', () => {
  it('rejects suicide without capture', () => {
    const ctx = getFastContext(5);
    const board = emptyBoard(5);
    for (const [x, y] of [[1, 0], [0, 1], [2, 1], [1, 2]] as Array<[number, number]>)
      board[y][x] = 'white';
    const flat = flatFromBoard(board);
    expect(isQuickLegal(ctx, flat, FLAT_BLACK, 1 * 5 + 1)).toBe(false);
    // probing must leave the scratch board untouched
    expect(flat[1 * 5 + 1]).toBe(FLAT_EMPTY);
  });

  it('handles multi-group capture in one move', () => {
    const ctx = getFastContext(5);
    const board = emptyBoard(5);
    // two separate white stones share their single last liberty at (2,1)
    const stones: Array<[number, number, 'black' | 'white']> = [
      [1, 1, 'white'], // liberties: only (2,1)
      [2, 0, 'white'], // liberties: only (2,1)
      [0, 1, 'black'],
      [1, 0, 'black'],
      [1, 2, 'black'],
      [3, 0, 'black'],
    ];
    for (const [x, y, player] of stones) board[y][x] = player;
    const flat = flatFromBoard(board);
    const target = 1 * 5 + 2; // (x=2, y=1)
    expect(isQuickLegal(ctx, flat, FLAT_BLACK, target)).toBe(true);
    expect(tryApplyMove(ctx, flat, FLAT_BLACK, target)).toBe(true);
    expect(ctx.capturedCount).toBe(2); // both white stones captured
    expect(flat[1 * 5 + 1]).toBe(FLAT_EMPTY);
    expect(flat[0 * 5 + 2]).toBe(FLAT_EMPTY);
    expect(flat[target]).toBe(FLAT_BLACK);
  });
});
