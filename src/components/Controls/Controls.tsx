import { useGameStore } from '@/store/game-store';

const button='rounded-xl border border-white/10 bg-white/10 px-4 py-2 transition hover:bg-white/20 disabled:opacity-40';
export const Controls = () => {
  const {passTurn,undo,resign,enterScoring}=useGameStore.getState();
  const disabled=useGameStore(s=>s.aiThinking||s.phase!=='playing');
  const canUndo=useGameStore(s=>s.moves.length>0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <button className={button} disabled={disabled} onClick={()=>{passTurn()}}>Pass</button>
      <button className={button} disabled={!canUndo} onClick={()=>{undo()}}>悔棋</button>
      <button className={button} disabled={disabled} onClick={()=>{resign()}}>认输</button>
      <button className={`${button} col-span-2`} disabled={disabled} onClick={()=>{enterScoring()}}>进入数子</button>
    </div>
  );
};
