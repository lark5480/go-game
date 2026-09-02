import { useRef } from 'react';
import { useGameStore } from '@/store/game-store';
import { buildSgf, loadGameRecord, stonesFromBoard } from '@/sgf/record';

const button = 'rounded-xl border border-white/10 bg-white/10 px-4 py-2 transition hover:bg-white/20 disabled:opacity-40';

type GameState = ReturnType<typeof useGameStore.getState>;

const resultText = (state: GameState): string | undefined => {
  if (state.resigner) return `${state.resigner === 'black' ? 'W' : 'B'}+R`;
  if (!state.score) return undefined;
  if (state.score.winner === 'draw') return '0';
  return `${state.score.winner === 'black' ? 'B' : 'W'}+${state.score.margin}`;
};

const downloadSgf = (text: string, filename: string): void => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-go-sgf;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const Controls = () => {
  const { passTurn, undo, resign, enterScoring, loadRecord } = useGameStore.getState();
  const disabled = useGameStore((s) => s.aiThinking || s.phase !== 'playing');
  const canUndo = useGameStore((s) => s.moves.length > 0 && !s.aiThinking && s.phase === 'playing');
  // Import/export stay available after the game ends: that is exactly when you
  // want to save the record.
  const busy = useGameStore((s) => s.aiThinking);
  const fileInput = useRef<HTMLInputElement>(null);

  const importSgf = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      useGameStore.setState({ message: '读取文件失败' });
      return;
    }
    const result = loadGameRecord(text);
    if (!result.ok) {
      useGameStore.setState({ message: result.error });
      return;
    }
    loadRecord(result);
  };

  const exportSgf = (): void => {
    const state = useGameStore.getState();
    const aiName = `AI·${state.difficulty === 'easy' ? '初级' : '中级'}`;
    const blackName = state.mode === 'ai'
      ? (state.humanPlayer === 'black' ? '我' : aiName)
      : '黑方';
    const whiteName = state.mode === 'ai'
      ? (state.humanPlayer === 'white' ? '我' : aiName)
      : '白方';
    downloadSgf(
      buildSgf({
        boardSize: state.boardSize,
        moves: state.moves,
        setup: stonesFromBoard(state.initialBoard),
        blackName,
        whiteName,
        result: resultText(state),
      }),
      `go-${state.boardSize}-${new Date().toISOString().slice(0, 10)}.sgf`,
    );
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <button className={button} disabled={disabled} onClick={() => { passTurn(); }}>Pass</button>
      <button className={button} disabled={!canUndo} onClick={() => { undo(); }}>悔棋</button>
      <button className={button} disabled={disabled} onClick={() => { resign(); }}>认输</button>
      <button className={`${button} col-span-2`} disabled={disabled} onClick={() => { enterScoring(); }}>进入数子</button>
      <button className={button} disabled={busy} onClick={() => { fileInput.current?.click(); }}>导入棋谱</button>
      <button className={button} disabled={busy} onClick={() => { exportSgf(); }}>导出棋谱</button>
      <input
        ref={fileInput}
        type="file"
        accept=".sgf,application/x-go-sgf"
        className="hidden"
        onChange={(event) => {
          void importSgf(event.target.files?.[0]);
          // Reset so picking the same file twice still fires a change event.
          event.target.value = '';
        }}
      />
    </div>
  );
};
