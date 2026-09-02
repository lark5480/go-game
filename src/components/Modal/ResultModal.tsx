import { useGameStore } from '@/store/game-store';

export const ResultModal = () => {
  const phase = useGameStore(s => s.phase); const score = useGameStore(s => s.score);
  const resigner = useGameStore(s => s.resigner); const returnToMenu = useGameStore(s => s.returnToMenu);
  const startGame = useGameStore(s => s.startGame);
  const lastConfig = useGameStore(s => s.lastConfig);
  if (phase !== 'finished') return null;
  const winner = resigner ? (resigner === 'black' ? 'white' : 'black') : score?.winner;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-900 p-8 text-center">
        <h2 className="text-3xl font-bold">{winner === 'draw' ? '和棋' : `${winner === 'black' ? '黑' : '白'}方胜`}</h2>
        {score && (
          <div className="mt-4 space-y-1 text-sm text-white/70">
            <p>黑 {score.blackScore.toFixed(1)}（存子 {score.blackStones} ＋ 地 {score.blackTerritory} ＋ 提获白子 {score.blackPrisoners}）</p>
            <p>白 {score.whiteScore.toFixed(1)}（存子 {score.whiteStones} ＋ 地 {score.whiteTerritory} ＋ 提获黑子 {score.whitePrisoners} ＋ 贴 7.5）</p>
            <p className="pt-1 text-base font-semibold text-emerald-400">
              {winner === 'draw' ? '' : `${winner === 'black' ? '黑' : '白'}方胜 ${score.margin.toFixed(1)} 分`}
            </p>
          </div>
        )}
        {!score && resigner && <p className="mt-4 text-white/70">{resigner === 'black' ? '黑' : '白'}方认输</p>}
        <div className="mt-8 grid grid-cols-2 gap-3">
          <button className="rounded-xl bg-white/10 py-3" onClick={returnToMenu}>主菜单</button>
          <button className="rounded-xl bg-emerald-500 py-3 font-semibold text-black" onClick={() => startGame(lastConfig)}>再来一局</button>
        </div>
      </div>
    </div>
  );
};
