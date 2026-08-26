import { captureOpponentsIfNeeded, cloneBoard, createBoard, groupInfo, inBounds } from './board';
import { opponent } from './types';
import type { Board, MoveResult, Player, Point } from './types';

const zobristTableCache = new Map<number, Uint32Array>();

const getZobristTable = (size: number): Uint32Array => {
  let table = zobristTableCache.get(size);
  if (!table) {
    table = new Uint32Array(size * size * 2);
    crypto.getRandomValues(table);
    zobristTableCache.set(size, table);
  }
  return table;
};

export const hashBoard = (() => {
  return (board: Board): string => {
    const size = board.length;
    const table = getZobristTable(size);
    let low = 2166136261;
    let high = 3864312223;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const value = board[y][x];
        if (value === 'empty') continue;
        const random = table[(y * size + x) * 2 + (value === 'white' ? 1 : 0)];
        low ^= random;
        high ^= random * 2654435761;
      }
    }
    return `${high.toString(36)}:${low.toString(36)}`;
  };
})();

export const legalMoveResult = (input: Board, player: Player, point: Point): MoveResult | null => {
  const size = input.length;
  if (!inBounds(size, point) || input[point.y][point.x] !== 'empty') return null;
  const board = cloneBoard(input);
  board[point.y][point.x] = player;
  const captured = captureOpponentsIfNeeded(board, player, point);
  const ownGroup = groupInfo(board, point);
  if (ownGroup.liberties.size === 0 && captured.length === 0) return null;
  return { board, captured, nextPlayer: opponent(player) };
};

export class RuleState {
  readonly size: number;
  board: Board;
  currentPlayer: Player;
  positionHashes: Set<string>;

  constructor(
    size: number,
    board = createBoard(size),
    currentPlayer: Player = 'black',
    positionHashes?: Set<string>,
  ) {
    this.size = size;
    this.board = board;
    this.currentPlayer = currentPlayer;
    this.positionHashes = positionHashes ?? new Set([hashBoard(board)]);
  }

  play(point: Point): MoveResult | null {
    const result = legalMoveResult(this.board, this.currentPlayer, point);
    if (!result) return null;
    const hash = hashBoard(result.board);
    if (this.positionHashes.has(hash)) return null;
    this.board = result.board;
    this.currentPlayer = result.nextPlayer;
    this.positionHashes.add(hash);
    return result;
  }
}
