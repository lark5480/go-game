import { GoBoard } from '@/components/Board/GoBoard';
import { GameInfo } from '@/components/GameInfo/GameInfo';
import { Controls } from '@/components/Controls/Controls';
import { MainMenu } from '@/components/Menu/MainMenu';
import { ResultModal } from '@/components/Modal/ResultModal';
import { useGameStore } from '@/store/game-store';
import type { ScoreDetail } from '@/engine/types';

export default function App() {
  const phase=useGameStore(s=>s.phase);
  const enterScoring=useGameStore(s=>s.enterScoring);
  const confirmScore=useGameStore(s=>s.confirmScore);
  const score=useGameStore(s=>s.score as ScoreDetail|undefined);
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-stone-900 text-white">
      <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
        {phase==='menu'?<div className="flex min-h-[80vh] items-center justify-center"><MainMenu/></div>:(
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="flex justify-center"><GoBoard/></div>
            <aside className="space-y-5">
              <GameInfo/>
              {phase==='scoring'&&<div className="rounded-xl bg-amber-500/15 p-4 text-sm text-amber-200">点击棋子标记或取消死子；点击确认结束。</div>}
              {phase==='scoring'&&score&&(
                <div className="rounded-xl bg-white/5 p-4 text-sm leading-relaxed">
                  <p>黑 {score.blackScore.toFixed(1)} ＝ 存子 {score.blackStones} ＋ 地 {score.blackTerritory} {score.blackPrisoners>0?`＋ 提获白子 ${score.blackPrisoners}`:''}</p>
                  <p className="mt-1">白 {score.whiteScore.toFixed(1)} ＝ 存子 {score.whiteStones} ＋ 地 {score.whiteTerritory} {score.whitePrisoners>0?`＋ 提获黑子 ${score.whitePrisoners}`:''} ＋ 贴 7.5</p>
                </div>
              )}
              <Controls/>
              {phase==='playing'&&<button className="w-full rounded-xl bg-amber-500 py-3 font-semibold text-black" onClick={()=>{enterScoring();confirmScore();}}>直接终局计算</button>}
              {phase==='scoring'&&<button className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black" onClick={confirmScore}>确认结果</button>}
              <button className="w-full rounded-xl border border-white/10 py-3 hover:bg-white/10" onClick={useGameStore.getState().returnToMenu}>返回菜单</button>
            </aside>
          </div>
        )}
      </div>
      <ResultModal/>
    </main>
  );
}
