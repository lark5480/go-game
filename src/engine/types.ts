export type Player = 'black' | 'white';

export type Cell = Player | 'empty';

export interface Point {
  x: number;
  y: number;
}

export type Board = Cell[][];
export type StoneMap = Record<string, Player>;

export interface MoveResult {
  board: Board;
  captured: Point[];
  nextPlayer: Player;
}

export type GameMode = 'pvp' | 'ai';

export type AiDifficulty = 'easy' | 'medium';

export type GamePhase = 'menu' | 'playing' | 'scoring' | 'finished';

export type MoveKind = 'stone' | 'pass' | 'resign';

export interface GameMove {
  kind: MoveKind;
  player: Player;
  point?: Point;
  captures: Point[];
  boardAfter: Board;
}

export interface ScoreDetail {
  ownership: Board;
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  /** Stones this side captured from the opponent (dead-marking included). */
  blackPrisoners: number;
  whitePrisoners: number;
  blackScore: number;
  whiteScore: number;
  winner: Player | 'draw';
  margin: number;
}

export const opponent = (player: Player): Player => (player === 'black' ? 'white' : 'black');
export const pointKey = ({ x, y }: Point): string => `${x},${y}`;
