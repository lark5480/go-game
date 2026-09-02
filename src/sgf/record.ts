import { cloneBoard, createBoard } from '@/engine/board';
import { legalMoveResult } from '@/engine/rules';
import {
  compressPoints,
  expandPointValues,
  isPassValue,
  parseBoardSize,
  pointToSgf,
  sgfToPoint,
} from './coords';
import { parseSgf } from './parse';
import { escapeTextValue, serializeSgf } from './serialize';
import { getFirstValue, getValues } from './types';
import type { SgfGameTree, SgfNode } from './types';
import type { Board, GameMove, Player, Point, StoneMap } from '@/engine/types';

/** Board sizes the app can actually play; anything else is rejected on import. */
export const SUPPORTED_BOARD_SIZES = [9, 13, 19] as const;
export type SupportedBoardSize = (typeof SUPPORTED_BOARD_SIZES)[number];

const isSupported = (size: number): size is SupportedBoardSize =>
  (SUPPORTED_BOARD_SIZES as readonly number[]).includes(size);

export interface SgfMove {
  player: Player;
  /** `undefined` marks a pass. */
  point?: Point;
}

export interface GameRecord {
  width: number;
  height: number;
  komi?: number;
  handicap?: number;
  blackStones: Point[];
  whiteStones: Point[];
  moves: SgfMove[];
}

export type LoadResult =
  | {
      ok: true;
      boardSize: SupportedBoardSize;
      initialBoard: Board;
      moves: GameMove[];
      warnings: string[];
    }
  | { ok: false; error: string };

/** Collects the stones already on a board, keyed `"x,y"` (used for `AB`/`AW`). */
export const stonesFromBoard = (board: Board): StoneMap => {
  const stones: StoneMap = {};
  board.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== 'empty') stones[`${x},${y}`] = cell;
  }));
  return stones;
};

const readMove = (
  value: string,
  player: Player,
  span: number,
  warn: (message: string) => void,
): SgfMove | null => {
  if (isPassValue(value, span)) return { player };
  const point = sgfToPoint(value);
  if (!point || point.x >= span || point.y >= span) {
    warn(`已跳过无法识别的着法 ${player === 'black' ? 'B' : 'W'}[${value}]`);
    return null;
  }
  return { player, point };
};

/** Flattens the main branch of a game tree into a plain record. */
export const readGameRecord = (
  tree: SgfGameTree,
): { record: GameRecord; warnings: string[] } => {
  const warnings: string[] = [];
  const warn = (message: string): void => {
    warnings.push(message);
  };
  const root = tree.sequence[0];

  const sizeValue = getFirstValue(root, 'SZ');
  const { width, height } = sizeValue === undefined
    ? { width: 19, height: 19 }
    : parseBoardSize(sizeValue, warn);
  const span = Math.max(width, height);

  const komiValue = getFirstValue(root, 'KM');
  const komi = komiValue === undefined || komiValue === '' ? undefined : Number(komiValue);
  const handicapValue = getFirstValue(root, 'HA');
  const handicap = handicapValue === undefined ? undefined : Number(handicapValue);

  const blackStones = expandPointValues(getValues(root, 'AB'), span, warn);
  const whiteStones = expandPointValues(getValues(root, 'AW'), span, warn);

  const moves: SgfMove[] = [];
  for (let index = 1; index < tree.sequence.length; index += 1) {
    const node = tree.sequence[index];
    // Mid-game board edits cannot be expressed as a move, so the app cannot
    // reproduce them; say so instead of silently mangling the position.
    const edits = (['AB', 'AW', 'AE'] as const).filter((id) => getValues(node, id).length > 0);
    if (edits.length > 0) {
      warn(`第 ${index} 个节点含中途摆子（${edits.join('/')}），本应用无法表示，已跳过`);
      continue;
    }
    const black = getFirstValue(node, 'B');
    const white = getFirstValue(node, 'W');
    if (black !== undefined) {
      const move = readMove(black, 'black', span, warn);
      if (move) moves.push(move);
    } else if (white !== undefined) {
      const move = readMove(white, 'white', span, warn);
      if (move) moves.push(move);
    }
  }

  return {
    record: {
      width,
      height,
      komi: komi !== undefined && Number.isFinite(komi) ? komi : undefined,
      handicap: handicap !== undefined && Number.isFinite(handicap) ? handicap : undefined,
      blackStones,
      whiteStones,
      moves,
    },
    warnings,
  };
};

/** Replays a record through the rules engine to rebuild the move list. */
export const replayRecord = (
  record: GameRecord,
): { initialBoard: Board; moves: GameMove[]; warnings: string[] } => {
  const warnings: string[] = [];
  const board = createBoard(record.width);
  for (const point of record.blackStones) board[point.y][point.x] = 'black';
  for (const point of record.whiteStones) board[point.y][point.x] = 'white';
  const initialBoard = cloneBoard(board);

  const moves: GameMove[] = [];
  let current = cloneBoard(board);
  for (const move of record.moves) {
    if (move.point === undefined) {
      moves.push({
        kind: 'pass',
        player: move.player,
        captures: [],
        boardAfter: cloneBoard(current),
      });
      continue;
    }
    const result = legalMoveResult(current, move.player, move.point);
    if (!result) {
      warnings.push(`第 ${moves.length + 1} 手 ${pointToSgf(move.point)} 非法（落点被占或为自杀），已跳过`);
      continue;
    }
    current = result.board;
    moves.push({
      kind: 'stone',
      player: move.player,
      point: move.point,
      captures: result.captured,
      boardAfter: result.board,
    });
  }
  return { initialBoard, moves, warnings };
};

/** Parses SGF text into something the store can load, or a reason why it cannot. */
export const loadGameRecord = (text: string): LoadResult => {
  let parsed;
  try {
    parsed = parseSgf(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `棋谱解析失败：${detail}` };
  }
  const tree = parsed.collection[0];
  if (!tree) return { ok: false, error: '文件中没有找到任何棋谱' };

  const warnings = [...parsed.warnings];
  const { record, warnings: readWarnings } = readGameRecord(tree);
  warnings.push(...readWarnings);

  if (record.width !== record.height) {
    return {
      ok: false,
      error: `暂不支持矩形棋盘（${record.width}x${record.height}），仅支持 9 / 13 / 19 路`,
    };
  }
  if (!isSupported(record.width)) {
    return { ok: false, error: `仅支持 9 / 13 / 19 路棋盘，该棋谱为 ${record.width} 路` };
  }
  if (parsed.collection.length > 1) warnings.push('文件包含多局棋谱，仅导入第一局');
  if (tree.children.length > 0) warnings.push('棋谱包含变化图，仅导入主分支');

  const replayed = replayRecord(record);
  warnings.push(...replayed.warnings);
  return {
    ok: true,
    boardSize: record.width,
    initialBoard: replayed.initialBoard,
    moves: replayed.moves,
    warnings,
  };
};

export interface SgfExportOptions {
  boardSize: number;
  moves: GameMove[];
  /** Stones already on the board before the first move, keyed as `"x,y"`. */
  setup?: StoneMap;
  handicap?: number;
  blackName?: string;
  whiteName?: string;
  komi?: number;
  result?: string;
}

/** Builds an SGF file for the current game. */
export const buildSgf = (options: SgfExportOptions): string => {
  const { boardSize, moves, setup, handicap, blackName, whiteName, komi, result } = options;
  const root: SgfNode = { properties: [] };
  const add = (id: string, value: string): void => {
    root.properties.push({ id, values: [value] });
  };

  add('FF', '4');
  add('GM', '1');
  add('SZ', String(boardSize));
  add('CA', 'UTF-8');
  add('AP', 'go-game:0.1');
  add('KM', String(komi ?? 7.5));
  add('PB', escapeTextValue(blackName ?? '黑方'));
  add('PW', escapeTextValue(whiteName ?? '白方'));
  if (result !== undefined && result !== '') add('RE', escapeTextValue(result));

  const black: Point[] = [];
  const white: Point[] = [];
  for (const [key, player] of Object.entries(setup ?? {})) {
    const [x, y] = key.split(',').map(Number);
    (player === 'black' ? black : white).push({ x, y });
  }
  // Setup stones belong in the root node: SGF forbids mixing setup and move
  // properties in one node, and HA is required to sit alongside AB.
  for (const value of compressPoints(black)) root.properties.push({ id: 'AB', values: [value] });
  for (const value of compressPoints(white)) root.properties.push({ id: 'AW', values: [value] });
  if (handicap !== undefined && handicap >= 2) add('HA', String(handicap));

  const sequence: SgfNode[] = [root];
  for (const move of moves) {
    if (move.kind === 'resign') continue;
    const id = move.player === 'black' ? 'B' : 'W';
    const value = move.kind === 'pass' || move.point === undefined ? '' : pointToSgf(move.point);
    sequence.push({ properties: [{ id, values: [value] }] });
  }

  return serializeSgf([{ sequence, children: [] }]);
};
