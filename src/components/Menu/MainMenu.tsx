import { useState } from 'react';
import { useGameStore } from '@/store/game-store';
import type { AiDifficulty, GameMode, Player } from '@/engine/types';

const option='rounded-xl border px-4 py-2 transition';
export const MainMenu = () => {
  const startGame=useGameStore(s=>s.startGame);
  const [mode,setMode]=useState<GameMode>('ai');
  const [size,setSize]=useState<9|13|19>(9);
  const [humanPlayer,setHumanPlayer]=useState<Player>('black');
  const [difficulty,setDifficulty]=useState<AiDifficulty>('easy');
  const chip=(active:boolean)=>`${option} ${active?'border-emerald-400 bg-emerald-500/20':'border-white/10 bg-white/5 hover:bg-white/10'}`;
  return (
    <div className="w-full max-w-md space-y-7 rounded-3xl border border-white/10 bg-black/25 p-8 backdrop-blur">
      <header><h1 className="text-4xl font-bold">围棋</h1><p className="mt-2 text-sm text-white/60">中国规则 · 数子法 · 贴目 7.5</p></header>
      <div className="space-y-3"><p className="font-medium">模式</p><div className="grid grid-cols-2 gap-2">
        <button className={chip(mode==='pvp')} onClick={()=>setMode('pvp')}>双人</button><button className={chip(mode==='ai')} onClick={()=>setMode('ai')}>人机</button></div></div>
      <div className="space-y-3"><p className="font-medium">棋盘</p><div className="grid grid-cols-3 gap-2">{([9,13,19] as const).map(item=>(<button key={item} className={chip(size===item)} onClick={()=>setSize(item)}>{item} 路</button>))}</div></div>
      {mode==='ai'&&<div className="space-y-3"><p className="font-medium">执子 / 难度</p>
        <div className="grid grid-cols-2 gap-2"><button className={chip(humanPlayer==='black')} onClick={()=>setHumanPlayer('black')}>执黑先行</button><button className={chip(humanPlayer==='white')} onClick={()=>setHumanPlayer('white')}>执白</button></div>
        <div className="grid grid-cols-2 gap-2">{(['easy','medium'] as const).map(item=>(<button key={item} className={chip(difficulty===item)} onClick={()=>setDifficulty(item)}>{item==='easy'?'初级':'中级 MCTS'}</button>))}</div></div>}
      <button className="w-full rounded-xl bg-emerald-500 py-3 font-semibold text-black transition hover:bg-emerald-400" onClick={()=>startGame({mode,boardSize:size,humanPlayer,difficulty})}>开始对局</button>
    </div>
  );
};
