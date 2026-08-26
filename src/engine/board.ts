import { opponent, pointKey } from './types';
import type { Board, Cell, Player, Point } from './types';

export const createBoard = (size: number): Board => Array.from({ length: size }, () => Array<Cell>(size).fill('empty'));

export const cloneBoard = (board: Board): Board => board.map((row) => [...row]);

export const inBounds = (size: number, { x, y }: Point): boolean =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < size && y < size;

const neighbors = (size: number, point: Point): Point[] => {
  const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  return deltas
    .map(([dx, dy]) => ({ x: point.x + dx, y: point.y + dy }))
    .filter((candidate) => inBounds(size, candidate));
};

export const groupInfo = (
  board: Board,
  start: Point,
): { stones: Point[]; liberties: Set<string>; player: Player } => {
  const size = board.length;
  const player = board[start.y]?.[start.x];
  if (player !== 'black' && player !== 'white') throw new Error('Cannot inspect an empty point');
  const seen = new Set<string>([pointKey(start)]);
  const stack = [start];
  const stones: Point[] = [];
  const liberties = new Set<string>();
  while (stack.length > 0) {
    const point = stack.pop()!;
    stones.push(point);
    for (const neighbor of neighbors(size, point)) {
      const value = board[neighbor.y][neighbor.x];
      const key = pointKey(neighbor);
      if (value === 'empty') {
        liberties.add(key);
      } else if (value === player && !seen.has(key)) {
        seen.add(key);
        stack.push(neighbor);
      }
    }
  }
  return { stones, liberties, player };
};

export const removeGroup = (board: Board, stones: Point[]): void => {
  for (const stone of stones) board[stone.y][stone.x] = 'empty';
};

export const captureOpponentsIfNeeded = (board: Board, placedBy: Player, point: Point): Point[] => {
  const size = board.length;
  const captured: Point[] = [];
  for (const neighbor of neighbors(size, point)) {
    if (board[neighbor.y][neighbor.x] !== opponent(placedBy)) continue;
    const group = groupInfo(board, neighbor);
    if (group.liberties.size === 0) {
      removeGroup(board, group.stones);
      captured.push(...group.stones);
    }
  }
  return captured;
};
