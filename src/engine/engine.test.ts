import { describe, expect, it } from 'vitest';
import { legalMoveResult } from './rules';
import { scoreGame } from './scoring';
import type { Board } from './types';

const emptyBoard = (size = 3): Board => Array.from({ length: size }, () => Array(size).fill('empty'));

const setStones = (board: Board, stones: Array<[number, number, 'black' | 'white']>) => {
  const result = board.map((row) => [...row]);
  for (const [x, y, player] of stones) result[y][x] = player;
  return result;
};

describe('go rules', () => {
  it('captures a single stone horizontally', () => {
    const board = setStones(emptyBoard(), [[0, 0, 'white'], [0, 1, 'black']]);
    const result = legalMoveResult(board, 'black', { x: 1, y: 0 });
    expect(result?.captured).toEqual([{ x: 0, y: 0 }]);
    expect(result?.board[0][0]).toBe('empty');
  });

  it('rejects suicide and occupied points', () => {
    const board = setStones(emptyBoard(), [
      [1, 0, 'white'], [0, 1, 'white'], [2, 1, 'white'], [1, 2, 'white'],
    ]);
    expect(legalMoveResult(board, 'black', { x: 1, y: 1 })).toBeNull();
    const occupied = setStones(emptyBoard(), [[1, 1, 'black']]);
    expect(legalMoveResult(occupied, 'white', { x: 1, y: 1 })).toBeNull();
  });

  it('prevents immediate simple ko recapture', () => {
    let board = setStones(emptyBoard(5), [
      [1, 1, 'white'], [3, 1, 'white'],
      [2, 2, 'white'],
      [1, 2, 'black'], [3, 2, 'black'], [2, 3, 'black'],
    ]);
    const capture = legalMoveResult(board, 'black', { x: 2, y: 1 });
    expect(capture?.captured).toEqual([{ x: 2, y: 2 }]);
    board = capture!.board;
    const recapture = legalMoveResult(board, 'white', { x: 2, y: 2 });
    expect(recapture).toBeNull();
  });
});

describe('Chinese scoring', () => {
  it('counts stones territory and komi', () => {
    const board = setStones(emptyBoard(5), Array.from({ length: 5 }, (_, row): [number, number, 'black'] => [2, row, 'black']));
    const score = scoreGame(board);
    expect(score.blackScore).toBe(25);
    expect(score.whiteScore).toBe(7.5);
    expect(score.winner).toBe('black');
  });

  it('removes marked dead groups and transfers prisoners', () => {
    const board = setStones(emptyBoard(5), [
      ...Array.from({ length: 5 }, (_, y): [number, number, 'black'] => [2, y, 'black']),
      ...Array.from({ length: 3 }, (_, y): [number, number, 'white'] => [3, y, 'white']),
    ]);
    const dead: Record<string, 'white'> = { '3,0': 'white', '3,1': 'white', '3,2': 'white' };
    const score = scoreGame(board, dead);
    expect(score.blackTerritory).toBeGreaterThanOrEqual(10);
    expect(score.winner).toBe('black');
  });
});
