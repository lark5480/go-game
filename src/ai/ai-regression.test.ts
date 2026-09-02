import { describe, expect, it } from 'vitest';
import { chooseEasyMove } from './easy-ai';
import { MCTS } from './mcts';
import { hashBoard, legalMoveResult } from '@/engine/rules';
import type { Board, Player, Point } from '@/engine/types';

const mulberry32 = (seed: number): (() => number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const setStones = (size: number, stones: Array<[number, number, Player]>): Board => {
  const board: Board = Array.from({ length: size }, () => Array(size).fill('empty'));
  for (const [x, y, player] of stones) board[y][x] = player;
  return board;
};

describe('easy AI heuristics', () => {
  it('is deterministic under a seeded RNG', () => {
    const board = setStones(9, [[4, 4, 'white'], [3, 3, 'black']]);
    const first = chooseEasyMove(board, 'black', { random: mulberry32(42) });
    const second = chooseEasyMove(board, 'black', { random: mulberry32(42) });
    expect(first).toEqual(second);
  });

  it('prefers capturing a stone in atari', () => {
    // White (1,1) has its last liberty at (1,2).
    const board = setStones(5, [
      [1, 1, 'white'],
      [0, 1, 'black'], [2, 1, 'black'], [1, 0, 'black'],
    ]);
    const move = chooseEasyMove(board, 'black', { random: mulberry32(1) });
    expect(move).toEqual({ x: 1, y: 2 });
  });

  it('never picks an occupied or suicidal point', () => {
    // (1,1) is surrounded by white: illegal suicide for black.
    const board = setStones(5, [
      [1, 0, 'white'], [0, 1, 'white'], [2, 1, 'white'], [1, 2, 'white'],
    ]);
    const move = chooseEasyMove(board, 'black', { random: mulberry32(9) })!;
    expect(move).not.toEqual({ x: 1, y: 1 });
    expect(legalMoveResult(board, 'black', move as Point)).not.toBeNull();
  });

  it('returns null when the side has no legal move', () => {
    // A fully-loaded alternating checkerboard leaves no legal moves at all.
    const size = 5;
    const board: Board = Array.from({ length: size }, (_, y) =>
      Array.from({ length: size }, (_, x) => ((x + y) % 2 === 0 ? 'black' : 'white')),
    );
    expect(chooseEasyMove(board, 'black')).toBeNull();
  });

  it('skips moves that would recreate a known position (superko)', () => {
    const board = setStones(9, [[4, 4, 'white'], [3, 3, 'black']]);
    const preferred = chooseEasyMove(board, 'black', { random: mulberry32(42) })!;
    const outcome = legalMoveResult(board, 'black', preferred)!;
    const forbidden = new Set([hashBoard(outcome.board)]);

    const filtered = chooseEasyMove(board, 'black', { random: mulberry32(42), positionHashes: forbidden });
    expect(filtered).not.toBeNull();
    expect(filtered).not.toEqual(preferred);
    // The alternative must itself respect the history.
    const alternative = legalMoveResult(board, 'black', filtered!)!;
    expect(forbidden.has(hashBoard(alternative.board))).toBe(false);

    // If every move is forbidden the AI reports "nothing to play".
    const all = new Set<string>([hashBoard(outcome.board)]);
    for (let y = 0; y < 9; y += 1)
      for (let x = 0; x < 9; x += 1) {
        if (board[y][x] !== 'empty') continue;
        const candidate = legalMoveResult(board, 'black', { x, y });
        if (candidate) all.add(hashBoard(candidate.board));
      }
    expect(chooseEasyMove(board, 'black', { positionHashes: all })).toBeNull();
  });
});

describe('MCTS search', () => {
  it('returns a legal move after a short budget', () => {
    const board = setStones(9, [
      [4, 4, 'black'], [3, 3, 'white'], [5, 5, 'white'], [2, 2, 'black'],
    ]);
    const search = new MCTS(board, 'black', { random: mulberry32(7) });
    search.run(60, 300);
    const move = search.best();
    expect(move).not.toBeNull();
    expect(legalMoveResult(board, 'black', move!)).not.toBeNull();
  });

  it('returns null when no move has been explored', () => {
    const board = setStones(9, []);
    const search = new MCTS(board, 'black', { random: mulberry32(3) });
    search.run(0, 10);
    expect(search.best()).toBeNull();
  });

  it('builds a deeper tree within a realistic budget', () => {
    // Black surrounds most of white (4,4); the capture at (4,3) is the standout move.
    const board = setStones(9, [
      [4, 4, 'white'],
      [3, 4, 'black'], [5, 4, 'black'], [4, 5, 'black'],
      [2, 2, 'white'], [6, 6, 'white'],
    ]);
    const search = new MCTS(board, 'black', { random: mulberry32(11) });
    search.run(400, 5000);
    const move = search.best();
    expect(move).not.toBeNull();
    expect(legalMoveResult(board, 'black', move!)).not.toBeNull();
  });
});
