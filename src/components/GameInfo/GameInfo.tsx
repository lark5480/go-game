import { useMemo } from 'react';
import { useGameStore } from '@/store/game-store';
import { scoreGame } from '@/engine/scoring';

export const GameInfo = () => {
  const player = useGameStore(s => s.currentPlayer);
  const blackCaptures = useGameStore(s => s.capturedByBlack);
  const whiteCaptures = useGameStore(s => s.capturedByWhite);
  const moves = useGameStore(s => s.moves.length);
  const thinking = useGameStore(s => s.aiThinking);
  const phase = useGameStore(s => s.phase);
  const board = useGameStore(s => s.board);

  // Rough mid-game standing so players see what actually decides the game:
  // final area score, not capture counts. Clearly labelled as an estimate.
  const estimate = useMemo(
    () => (phase === 'playing' ? scoreGame(board) : undefined),
    [phase, board],
  );

  return (
    <section className="grid grid-cols-2 gap-3">
      {[['black', '黑方'], ['white', '白方']].map(([id, label]) => (
        <div key={id} className={`rounded-xl border p-4 ${player === id ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/10 bg-white/5'}`}>
          <p className="text-sm text-white/60">{label}</p>
          <p className="mt-1 text-lg font-semibold">{id === 'black' ? blackCaptures : whiteCaptures} 提子</p>
        </div>
      ))}
      <p className="col-span-2 rounded-xl bg-white/5 px-4 py-3 text-center text-sm">
        第 {moves + 1} 手 · {thinking ? 'AI 思考中…' : `${player === 'black' ? '黑' : '白'}方落子`}
      </p>
      {estimate && (
        <p className="col-span-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-center text-sm text-emerald-200">
          形势粗估：黑 {estimate.blackScore.toFixed(1)} — 白 {estimate.whiteScore.toFixed(1)}
          <span className="ml-1 text-xs text-white/45">（按当前盘面估算，仅供参考）</span>
        </p>
      )}
      <p className="col-span-2 rounded-xl bg-white/5 px-4 py-3 text-xs leading-relaxed text-white/55">
        胜负规则：终局数子定胜负——黑得分＝黑存子＋黑地＋提获白子，白得分＝白存子＋白地＋提获黑子＋贴 7.5 目，分高者胜。
        提子多只是过程战果，不直接等于赢；想结束对局请点 Pass 或「进入数子」。
      </p>
    </section>
  );
};
