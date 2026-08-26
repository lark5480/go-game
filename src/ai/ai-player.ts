import { chooseEasyMove } from './easy-ai';
import { chooseMediumMove } from './medium-ai';
import { legalMoveResult, hashBoard } from '@/engine/rules';
import type { AiDifficulty, Board, Player, Point } from '@/engine/types';

export interface AiMoveContext {
  /** Positions already seen in the game; AI moves must not recreate one. */
  positionHashes?: ReadonlySet<string>;
}

export const chooseAiMove = async (
  board: Board,
  player: Player,
  difficulty: AiDifficulty,
  context: AiMoveContext = {},
): Promise<Point | null> => {
  const hashes = context.positionHashes;
  const move = difficulty === 'easy'
    ? chooseEasyMove(board, player, { positionHashes: hashes })
    : await chooseMediumMove(board, player, hashes);
  if (!move) return null;
  const result = legalMoveResult(board, player, move);
  if (!result) return null;
  // Defensive superko check (selection layers already filter).
  if (hashes && hashes.has(hashBoard(result.board))) return null;
  return move;
};
