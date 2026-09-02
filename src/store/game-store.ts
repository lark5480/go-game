import { create } from 'zustand';
import { chooseAiMove } from '@/ai/ai-player';
import { terminateWorker } from '@/ai/medium-ai';
import { createBoard, cloneBoard } from '@/engine/board';
import { legalMoveResult, hashBoard } from '@/engine/rules';
import { scoreGame } from '@/engine/scoring';
import { opponent, pointKey } from '@/engine/types';
import type {
  AiDifficulty, Board, GameMode, GamePhase, GameMove, Player, Point, ScoreDetail, StoneMap,
} from '@/engine/types';

export interface GameConfig {
  mode: GameMode;
  boardSize: 9 | 13 | 19;
  humanPlayer: Player;
  difficulty: AiDifficulty;
}

export interface LoadRecordInput {
  boardSize: 9 | 13 | 19;
  /** Starting position; handicap stones live here because they are not moves. */
  initialBoard: Board;
  moves: GameMove[];
  warnings?: string[];
}

interface GameState extends GameConfig {
  phase: GamePhase;
  board: Board;
  /** Position the game started from; handicap stones live here, not in `moves`. */
  initialBoard: Board;
  /** Side that opens the game; usually black, but white after handicap stones. */
  firstPlayer: Player;
  currentPlayer: Player;
  moves: GameMove[];
  capturedByBlack: number;
  capturedByWhite: number;
  positionHashes: Set<string>;
  consecutivePasses: number;
  lastMove?: Point;
  deadStones: StoneMap;
  score?: ScoreDetail;
  resigner?: Player;
  /** Config of the most recent game; "再来一局" replays it verbatim. */
  lastConfig: GameConfig;
  aiThinking: boolean;
  message: string;
  startGame: (config: Partial<GameConfig>) => void;
  playStone: (point: Point) => boolean;
  passTurn: () => void;
  resign: () => void;
  undo: () => void;
  enterScoring: () => void;
  toggleDeadStone: (point: Point) => void;
  confirmScore: () => void;
  returnToMenu: () => void;
  loadRecord: (input: LoadRecordInput) => void;
}

const emptyMenuBoard = createBoard(9);
const defaultConfig: GameConfig = {
  mode: 'ai',
  boardSize: 9,
  humanPlayer: 'black',
  difficulty: 'easy',
};

const restoreState = (
  moves: GameMove[],
  initialBoard: Board,
  firstPlayer: Player,
): Pick<GameState, 'board' | 'currentPlayer' | 'capturedByBlack' | 'capturedByWhite' | 'positionHashes' | 'consecutivePasses' | 'lastMove'> => {
  const board = moves.length > 0
    ? cloneBoard(moves[moves.length - 1].boardAfter)
    : cloneBoard(initialBoard);
  const captures = { black: 0, white: 0 };
  const hashes = new Set<string>([hashBoard(initialBoard)]);
  for (let index = 0; index < moves.length; index += 1) {
    const move = moves[index];
    if (move.kind === 'stone') {
      captures[move.player] += move.captures.length;
      hashes.add(hashBoard(move.boardAfter));
    }
  }
  const stoneMoves = [...moves].reverse().find((move) => move.kind === 'stone');
  // Derive the turn from the last move rather than counting from black: a
  // handicap record opens with a white move, which the old count got wrong.
  // With no moves left the turn falls back to whoever opened, so undoing a
  // handicap game back to its start hands the move to white again.
  const lastPlayer = moves.length > 0 ? moves[moves.length - 1].player : undefined;
  return {
    board,
    currentPlayer: lastPlayer === undefined ? firstPlayer : opponent(lastPlayer),
    capturedByBlack: captures.black,
    capturedByWhite: captures.white,
    positionHashes: hashes,
  consecutivePasses: countTrailingPasses(moves),
    lastMove: stoneMoves?.point,
  };
};

export const useGameStore = create<GameState>((set, get) => ({
  ...defaultConfig,
  phase: 'menu',
  board: emptyMenuBoard,
  initialBoard: emptyMenuBoard,
  firstPlayer: 'black',
  currentPlayer: 'black',
  moves: [],
  capturedByBlack: 0,
  capturedByWhite: 0,
  positionHashes: new Set([hashBoard(emptyMenuBoard)]),
  consecutivePasses: 0,
  deadStones: {},
  lastConfig: { ...defaultConfig },
  aiThinking: false,
  message: '',
  startGame: (config) => {
    set((state) => {
      const next = { ...state, ...defaultConfig, ...config };
      const board = createBoard(next.boardSize);
      return {
        ...next,
        phase: 'playing',
        board,
        initialBoard: board,
        firstPlayer: 'black',
        currentPlayer: 'black',
        moves: [],
        capturedByBlack: 0,
        capturedByWhite: 0,
        positionHashes: new Set([hashBoard(board)]),
        consecutivePasses: 0,
        deadStones: {},
        score: undefined,
        resigner: undefined,
        lastConfig: {
          mode: next.mode,
          boardSize: next.boardSize,
          humanPlayer: next.humanPlayer,
          difficulty: next.difficulty,
        },
        aiThinking: false,
        message: '',
      };
    });
    // When the human plays white the AI owns the opening move.
    void maybeRunAi(set, get);
  },
  playStone: (point) => {
    const state = get();
    if (state.phase !== 'playing' || state.aiThinking || state.board[point.y]?.[point.x] !== 'empty') return false;
    if (state.mode === 'ai' && state.currentPlayer !== state.humanPlayer) return false;
    const result = legalMoveResult(state.board, state.currentPlayer, point);
    if (!result) return false;
    const hash = hashBoard(result.board);
    if (state.positionHashes.has(hash)) return false;
    const mover = state.currentPlayer;
    const boardAfter = result.board;
    const nextMoves: GameMove[] = [...state.moves, {
      kind: 'stone', player: mover, point, captures: result.captured, boardAfter,
    }];
    const nextCaptures = mover === 'black'
      ? state.capturedByBlack + result.captured.length
      : state.capturedByWhite + result.captured.length;
    set({
      board: boardAfter,
      currentPlayer: result.nextPlayer,
      moves: nextMoves,
      positionHashes: new Set(state.positionHashes).add(hash),
      consecutivePasses: 0,
      lastMove: point,
      ...(mover === 'black' ? { capturedByBlack: nextCaptures } : { capturedByWhite: nextCaptures }),
      message: '',
    });
    void maybeRunAi(set, get);
    return true;
  },
  passTurn: () => {
    const state = get();
    if (state.phase !== 'playing' || state.aiThinking) return;
    if (state.mode === 'ai' && state.currentPlayer !== state.humanPlayer) return;
    const passes = state.consecutivePasses + 1;
    const nextMoves: GameMove[] = [...state.moves, {
      kind: 'pass', player: state.currentPlayer, captures: [], boardAfter: cloneBoard(state.board),
    }];
    if (passes >= 2) {
      terminateWorker();
      set({ moves: nextMoves, currentPlayer: opponent(state.currentPlayer), consecutivePasses: passes, phase: 'scoring', deadStones: {}, score: undefined });
      return;
    }
    const nextPlayer = opponent(state.currentPlayer);
    set({ moves: nextMoves, currentPlayer: nextPlayer, consecutivePasses: passes, lastMove: undefined, message: `${nextPlayer === 'black' ? '黑' : '白'}方继续` });
    void maybeRunAi(set, get);
  },
  resign: () => {
    const state = get();
    if (state.phase !== 'playing') return;
    terminateWorker();
    set({ phase: 'finished', resigner: state.currentPlayer, message: '' });
  },
  undo: () => {
    const state = get();
    if (state.phase !== 'playing' || state.moves.length === 0) return;
    let count = 1;
    if (state.mode === 'ai' && state.moves[state.moves.length - 1].player !== state.humanPlayer) count = 2;
    else if (state.moves.length > 1 && state.moves[state.moves.length - 1].player === state.humanPlayer && state.moves[state.moves.length - 2].player !== state.humanPlayer) count = 2;
    const restoredMoves = state.moves.slice(0, Math.max(0, state.moves.length - count));
    set({
      ...restoreState(restoredMoves, state.initialBoard, state.firstPlayer),
      moves: restoredMoves,
      phase: 'playing',
      score: undefined,
    });
    void maybeRunAi(set, get);
  },
  enterScoring: () => {
    const state = get();
    if (state.phase !== 'playing') return;
    set({ phase: 'scoring', deadStones: {}, score: scoreGame(state.board) });
  },
  toggleDeadStone: (point) => {
    const state = get();
    if (state.phase !== 'scoring') return;
    const player = state.board[point.y]?.[point.x];
    if (player !== 'black' && player !== 'white') return;
    const key = pointKey(point);
    const groupStones = findGroup(boardToRecord(state.board), point, player);
    const deadStones = { ...state.deadStones };
    const isDead = deadStones[key] === player;
    if (isDead) delete deadStones[key];
    else deadStones[key] = player;
    for (const [groupKey] of Object.entries(groupStones)) {
      if (isDead) delete deadStones[groupKey];
      else deadStones[groupKey] = player;
    }
    set({ deadStones, score: scoreGame(state.board, deadStones) });
  },
  confirmScore: () => {
    const state = get();
    if (state.phase !== 'scoring') return;
    terminateWorker();
    set({ phase: 'finished', score: state.score ?? scoreGame(state.board, state.deadStones) });
  },
  returnToMenu: () => {
    terminateWorker();
    set({
      phase: 'menu',
      board: emptyMenuBoard,
      initialBoard: emptyMenuBoard,
      moves: [],
      deadStones: {},
      score: undefined,
    });
  },
  // Imported records continue in local two-player mode: a loaded game is a
  // recording to review, so neither side should be driven by the AI.
  loadRecord: ({ boardSize, initialBoard, moves, warnings }) => {
    terminateWorker();
    const config: GameConfig = {
      mode: 'pvp',
      boardSize,
      humanPlayer: 'black',
      difficulty: get().difficulty,
    };
    // Whoever played the first move opened the game: white opens a handicap
    // record, so undoing back to the start has to hand the move back to white.
    const firstPlayer: Player = moves.length > 0 ? moves[0].player : 'black';
    set({
      ...config,
      phase: 'playing',
      initialBoard: cloneBoard(initialBoard),
      firstPlayer,
      ...restoreState(moves, initialBoard, firstPlayer),
      moves,
      deadStones: {},
      score: undefined,
      resigner: undefined,
      lastConfig: { ...config },
      aiThinking: false,
      message: warnings && warnings.length > 0
        ? warnings.join('；')
        : `已导入棋谱，共 ${moves.length} 手`,
    });
  },
}));

const boardToRecord = (board: Board): StoneMap => {
  const stones: StoneMap = {};
  board.forEach((row, y) => row.forEach((cell, x) => {
    if (cell !== 'empty') stones[`${x},${y}`] = cell;
  }));
  return stones;
};

const findGroup = (stones: StoneMap, start: Point, player: Player): StoneMap => {
  const visited: StoneMap = {};
  const stack = [start];
  while (stack.length > 0) {
    const point = stack.pop()!;
    const key = pointKey(point);
    if (visited[key]) continue;
    visited[key] = player;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const neighbor = { x: point.x + dx, y: point.y + dy };
      const value = stones[pointKey(neighbor)];
      if (value === player) stack.push(neighbor);
    }
  }
  return visited;
};

const countTrailingPasses = (moves: GameMove[]): number => {
  let count = 0;
  for (let index = moves.length - 1; index >= 0 && moves[index].kind === 'pass'; index -= 1) count += 1;
  return count;
};

let aiRunToken = 0;

/** Applies a pass for the side currently to move (used by the AI turn runner). */
const aiPass = (
  set: (partial: Partial<GameState>) => void,
  get: () => GameState,
): void => {
  const latest = get();
  if (latest.phase !== 'playing') {
    set({ aiThinking: false });
    return;
  }
  const passes = latest.consecutivePasses + 1;
  const nextPlayer = opponent(latest.currentPlayer);
  const nextMoves: GameMove[] = [...latest.moves, {
    kind: 'pass', player: latest.currentPlayer, captures: [], boardAfter: cloneBoard(latest.board),
  }];
  if (passes >= 2) {
    terminateWorker();
    set({
      moves: nextMoves,
      currentPlayer: nextPlayer,
      consecutivePasses: passes,
      phase: 'scoring',
      deadStones: {},
      score: undefined,
      lastMove: undefined,
      aiThinking: false,
      message: '',
    });
    return;
  }
  set({
    moves: nextMoves,
    currentPlayer: nextPlayer,
    consecutivePasses: passes,
    lastMove: undefined,
    aiThinking: false,
    message: `${nextPlayer === 'black' ? '黑' : '白'}方继续`,
  });
};

const maybeRunAi = async (
  set: (partial: Partial<GameState>) => void,
  get: () => GameState,
): Promise<void> => {
  const runId = ++aiRunToken;
  const state = get();
  if (state.phase !== 'playing' || state.mode !== 'ai' || state.currentPlayer === state.humanPlayer) {
    // No longer an AI turn (e.g. undo landed back on the human's side while a
    // search was pending): drop a stale thinking flag or the UI stays locked.
    if (state.aiThinking) set({ aiThinking: false });
    return;
  }
  set({ aiThinking: true });
  try {
    await new Promise((resolve) => window.setTimeout(resolve, 150));
    if (aiRunToken !== runId) return;
    const current = get();
    if (current.phase !== 'playing') {
      set({ aiThinking: false });
      return;
    }
    // The human just passed -> answer with a pass so the game always reaches
    // scoring instead of drifting on forever.
    if (current.consecutivePasses >= 1) {
      aiPass(set, get);
      return;
    }
    let point: Point | null;
    try {
      point = await chooseAiMove(current.board, current.currentPlayer, current.difficulty, {
        positionHashes: current.positionHashes,
      });
    } catch {
      // A failing AI layer (e.g. Worker construction blocked by CSP) must never
      // wedge the game: treat it like "no move found" and pass.
      point = null;
    }
    if (aiRunToken !== runId) return;
    const latest = get();
    if (latest.phase !== 'playing' || latest.currentPlayer === latest.humanPlayer) {
      set({ aiThinking: false });
      return;
    }
    const result = point ? legalMoveResult(latest.board, latest.currentPlayer, point) : null;
    const hash = result ? hashBoard(result.board) : null;
    // No legal move (or every move would repeat a known position) -> pass.
    if (!point || !result || hash === null || latest.positionHashes.has(hash)) {
      aiPass(set, get);
      return;
    }
  // Final validation: ensure state hasn't changed during async operations
    const finalState = get();
    if (finalState.phase !== 'playing' || finalState.currentPlayer !== latest.currentPlayer) {
      set({ aiThinking: false });
      return;
    }
    const mover = latest.currentPlayer;
    set({
      board: result.board,
      currentPlayer: result.nextPlayer,
      moves: [...latest.moves, { kind: 'stone', player: mover, point, captures: result.captured, boardAfter: result.board }],
      positionHashes: new Set(latest.positionHashes).add(hash),
      consecutivePasses: 0,
      lastMove: point,
      aiThinking: false,
      ...(mover === 'black'
        ? { capturedByBlack: latest.capturedByBlack + result.captured.length }
        : { capturedByWhite: latest.capturedByWhite + result.captured.length }),
      message: '',
    });
  } finally {
    // Last-resort cleanup: every normal path clears the flag itself; this
    // guarantees it stays off even if a future early return is added.
    if (aiRunToken === runId && get().aiThinking) set({ aiThinking: false });
  }
};
