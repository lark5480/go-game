import {
  FLAT_BLACK,
  FLAT_EMPTY,
  FLAT_WHITE,
  flatFromBoard,
  getFastContext,
  isQuickLegal,
  tryApplyMove,
  type FastContext,
} from '@/engine/fast-rules';
import { hashBoard, legalMoveResult } from '@/engine/rules';
import type { Board as GridBoard, Player, Point } from '@/engine/types';

export interface MctsOptions {
  durationMs?: number;
  maxIterations?: number;
  exploration?: number;
  random?: () => number;
  /** Known game positions (positional superko): the root never plays a move
   *  recreating one. Playouts inside the tree are unaffected. */
  positionHashes?: ReadonlySet<string>;
}

interface Node {
  parent?: Node;
  /** Flat index of the move leading here; -1 for the root. */
  moveIndex: number;
  /** Flat colour code of the stone placed by the move leading here. */
  playerJustMoved: number;
  board: Uint8Array;
  nextPlayer: number;
  visits: number;
  reward: number;
  children: Node[];
  untriedMoves: number[];
  /** Untried moves are generated lazily on first descent into the node. */
  expanded: boolean;
}

const shuffleIndices = (items: number[], random: () => number): void => {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [items[index], items[swap]] = [items[swap], items[index]];
  }
};

/**
 * UCT Monte-Carlo tree search over a flat Uint8Array board representation.
 *
 * Legality/capture probing uses the zero-allocation primitives from
 * engine/fast-rules.ts, and playouts maintain an incremental list of empty
 * points near existing stones instead of rescanning the whole grid every step.
 * Public API (constructor/reset/run/best and MctsOptions) is unchanged.
 */
export class MCTS {
  private readonly random: () => number;
  private readonly exploration: number;
  private readonly positionHashes?: ReadonlySet<string>;
  private root!: Node;
  private size = 0;
  private ctx!: FastContext;

  /* reusable playout scratch */
  private playoutBuf!: Uint8Array;
  /** Empty points within distance 2 of a stone, as a compact live set. */
  private candidateBuf!: Int32Array;
  /** candidateBuf index per point, -1 when not a candidate; O(1) membership. */
  private candidatePos!: Int32Array;
  private candidateCount = 0;

  constructor(board: GridBoard, aiPlayer: Player, options: MctsOptions & { exploration?: number } = {}) {
    this.random = options.random ?? Math.random;
    this.exploration = options.exploration ?? 1.2;
    this.positionHashes = options.positionHashes;
    this.reset(board, aiPlayer);
  }

  reset(board: GridBoard, aiPlayer: Player): void {
    this.size = board.length;
    this.ctx = getFastContext(this.size);
    this.playoutBuf = new Uint8Array(this.size * this.size);
    this.candidateBuf = new Int32Array(this.size * this.size);
    this.candidatePos = new Int32Array(this.size * this.size);
    this.candidateCount = 0;

    const aiCode = aiPlayer === 'black' ? FLAT_BLACK : FLAT_WHITE;
    const root: Node = {
      moveIndex: -1,
      playerJustMoved: aiCode === FLAT_BLACK ? FLAT_WHITE : FLAT_BLACK,
      board: flatFromBoard(board),
      nextPlayer: aiCode,
      visits: 0,
      reward: 0,
      children: [],
      untriedMoves: [],
      expanded: false,
    };
    if (this.positionHashes && this.positionHashes.size > 0) {
      // Root-level superko filter: exclude moves recreating a known position.
      const moves: number[] = [];
      for (let y = 0; y < this.size; y += 1) {
        for (let x = 0; x < this.size; x += 1) {
          if (board[y][x] !== 'empty') continue;
          const result = legalMoveResult(board, aiPlayer, { x, y });
          if (!result || this.positionHashes.has(hashBoard(result.board))) continue;
          moves.push(y * this.size + x);
        }
      }
      shuffleIndices(moves, this.random);
      root.untriedMoves = moves;
      root.expanded = true;
    } else {
      this.expandNode(root);
    }
    this.root = root;
  }

  /** Wall time is the real budget; maxIterations only guards against a runaway
   *  loop (e.g. a broken timer), so default generously high. */
  run(durationMs: number, maxIterations = 100_000): void {
    const startedAt = performance.now();
    while (performance.now() - startedAt < durationMs && this.root.visits < maxIterations) {
      let node = this.root;

      // Selection: descend fully-expanded nodes; expand lazily otherwise.
      for (;;) {
        if (node.untriedMoves.length > 0) break;
        if (!node.expanded) {
          this.expandNode(node);
          if (node.untriedMoves.length > 0) break;
        }
        if (node.children.length === 0) break; // terminal position
        node = this.selectChild(node);
      }

      // Expansion.
      if (node.untriedMoves.length > 0) {
        const moveIndex = node.untriedMoves.pop()!;
        const childBoard = node.board.slice();
        tryApplyMove(this.ctx, childBoard, node.nextPlayer, moveIndex);
        const child: Node = {
          parent: node,
          moveIndex,
          playerJustMoved: node.nextPlayer,
          board: childBoard,
          nextPlayer: node.nextPlayer === FLAT_BLACK ? FLAT_WHITE : FLAT_BLACK,
          visits: 0,
          reward: 0,
          children: [],
          untriedMoves: [],
          expanded: false,
        };
        node.children.push(child);
        node = child;
      }

      const reward = this.simulate(node.board, node.nextPlayer);

      let cursor: Node | undefined = node;
      while (cursor) {
        cursor.visits += 1;
        cursor.reward += cursor.playerJustMoved === FLAT_BLACK ? reward : 1 - reward;
        cursor = cursor.parent;
      }
    }
  }

  best(): Point | null {
    if (this.root.children.length === 0) return null;
    const best = this.root.children.reduce((left, right) =>
      right.visits !== left.visits
        ? right.visits > left.visits ? right : left
        : right.reward / right.visits > left.reward / left.visits ? right : left,
    );
    if (best.moveIndex < 0) return null;
    const x = best.moveIndex % this.size;
    return { x, y: (best.moveIndex - x) / this.size };
  }

  private expandNode(node: Node): void {
    const moves: number[] = [];
    const board = node.board;
    for (let index = 0; index < this.ctx.total; index += 1) {
      if (board[index] !== FLAT_EMPTY) continue;
      if (isQuickLegal(this.ctx, board, node.nextPlayer, index)) moves.push(index);
    }
    shuffleIndices(moves, this.random);
    node.untriedMoves = moves;
    node.expanded = true;
  }

  private selectChild(node: Node): Node {
    const logParentVisits = Math.log(Math.max(1, node.visits));
    let best = node.children[0];
    let bestScore =
      best.reward / best.visits + this.exploration * Math.sqrt(logParentVisits / best.visits);
    for (let i = 1; i < node.children.length; i += 1) {
      const child = node.children[i];
      const score =
        child.reward / child.visits + this.exploration * Math.sqrt(logParentVisits / child.visits);
      if (score > bestScore) {
        best = child;
        bestScore = score;
      }
    }
    return best;
  }

  /**
   * Plays uniformly random near-stone moves until both players pass, scoring by
   * stone count with 7.5 komi — identical outcome semantics to the previous
   * implementation, just without whole-board clones at every step. Simple-ko
   * recaptures are banned and a hard step cap guarantees termination.
   *
   * The candidate set (empty points within distance 2 of a stone) is kept as a
   * compact live list updated in O(1) per move, so no per-step rescan is needed.
   */
  private simulate(startBoard: Uint8Array, startPlayer: number): number {
    if (this.isEmptyBoard(startBoard)) return this.random() < .5 ? 1 : 0;

    const flat = this.playoutBuf;
    flat.set(startBoard);
    this.rebuildCandidates(flat);

    let player = startPlayer;
    let passCount = 0;
    // Simple-ko ban + hard step cap: without them, uniform-random playouts can
    // enter endless recapture wars where neither side ever passes (observed as
    // multi-second/never-ending searches — the main cause of mid-game stalls).
    let koPoint = -1;
    let koForbidden = FLAT_EMPTY;
    const maxSteps = this.size * this.size * 2;
    let steps = 0;

    while (passCount < 2 && steps < maxSteps) {
      steps += 1;

      let played = -1;
      // Lazy partial shuffle: try candidates in random order, each at most once.
      for (let remaining = this.candidateCount; remaining > 0; remaining -= 1) {
        const pick = Math.floor(this.random() * remaining);
        const swap = remaining - 1;
        const picked = this.candidateBuf[pick];
        const swapped = this.candidateBuf[swap];
        this.candidateBuf[pick] = swapped;
        this.candidateBuf[swap] = picked;
        this.candidatePos[picked] = swap;
        this.candidatePos[swapped] = pick;
        if (picked === koPoint && player === koForbidden) continue;
        if (tryApplyMove(this.ctx, flat, player, picked)) {
          played = picked;
          break;
        }
      }

      if (played < 0) {
        passCount += 1;
        koPoint = -1;
      } else {
        passCount = 0;
        if (this.ctx.capturedCount === 1 && this.ctx.measureLiberties === 1) {
          // Single stone captured by a lone one-liberty stone -> simple ko.
          koPoint = this.ctx.capturedBuf[0];
          koForbidden = player === FLAT_BLACK ? FLAT_WHITE : FLAT_BLACK;
        } else {
          koPoint = -1;
        }
        this.removeCandidate(played);
        this.extendCandidatesAround(played);
        for (let c = 0; c < this.ctx.capturedCount; c += 1) {
          this.extendCandidatesAround(this.ctx.capturedBuf[c]);
        }
      }
      player = player === FLAT_BLACK ? FLAT_WHITE : FLAT_BLACK;
    }

    let black = 0;
    let white = 0;
    for (let i = 0; i < flat.length; i += 1) {
      const value = flat[i];
      if (value === FLAT_BLACK) black += 1;
      else if (value === FLAT_WHITE) white += 1;
    }
    return black - white - 7.5 > 0 ? 1 : 0;
  }

  private isEmptyBoard(flat: Uint8Array): boolean {
    for (let i = 0; i < flat.length; i += 1) if (flat[i] !== FLAT_EMPTY) return false;
    return true;
  }

  /** True when any stone lies within Chebyshev distance 2 (matches the old
   *  5x5 neighbourhood scan). */
  private isNearStone(flat: Uint8Array, index: number): boolean {
    const size = this.size;
    const x = index % size;
    const y = (index - x) / size;
    for (let dy = -2; dy <= 2; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= size) continue;
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= size) continue;
        if (flat[ny * size + nx] !== FLAT_EMPTY) return true;
      }
    }
    return false;
  }

  private rebuildCandidates(flat: Uint8Array): void {
    this.candidateCount = 0;
    // Positions are only valid within the current playout: stale entries from
    // the previous playout must not survive the membership check.
    this.candidatePos.fill(-1);
    for (let index = 0; index < this.ctx.total; index += 1) {
      if (flat[index] !== FLAT_EMPTY) continue;
      if (!this.isNearStone(flat, index)) continue;
      this.candidatePos[index] = this.candidateCount;
      this.candidateBuf[this.candidateCount++] = index;
    }
  }

  /** O(1) swap-remove of a candidate that just got occupied. */
  private removeCandidate(index: number): void {
    const position = this.candidatePos[index];
    if (position < 0) return;
    const last = this.candidateCount - 1;
    this.candidateCount = last;
    this.candidatePos[index] = -1;
    if (position === last) return;
    const moved = this.candidateBuf[last];
    this.candidateBuf[position] = moved;
    this.candidatePos[moved] = position;
  }

  /** Adds empty points around a changed cell (played stone or freed capture)
   *  that are near a stone and not yet candidates; deduplicated via
   *  candidatePos. */
  private extendCandidatesAround(index: number): void {
    const size = this.size;
    const flat = this.playoutBuf;
    const x = index % size;
    const y = (index - x) / size;
    for (let dy = -2; dy <= 2; dy += 1) {
      const ny = y + dy;
      if (ny < 0 || ny >= size) continue;
      for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx;
        if (nx < 0 || nx >= size) continue;
        const neighbour = ny * size + nx;
        if (flat[neighbour] !== FLAT_EMPTY) continue;
        if (this.candidatePos[neighbour] >= 0) continue;
        if (!this.isNearStone(flat, neighbour)) continue;
        this.candidatePos[neighbour] = this.candidateCount;
        this.candidateBuf[this.candidateCount++] = neighbour;
      }
    }
  }
}
