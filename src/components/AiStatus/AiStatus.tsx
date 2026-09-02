import { useEffect, useState } from 'react';
import { subscribeAiStatus } from '@/ai/ai-status';
import type { AiDegradationReason, AiStatusEvent } from '@/ai/ai-status';

const MESSAGES: Record<AiDegradationReason, string> = {
  'worker-unsupported': '当前浏览器不支持 Web Worker，中级 AI 已降级为初级策略',
  'worker-construction-failed': 'AI 引擎启动失败，中级 AI 已降级为初级策略',
  'worker-timeout': 'AI 思考超时，本手已改用初级策略',
  'worker-error': 'AI 引擎异常，中级 AI 已降级为初级策略',
};

const AUTO_DISMISS_MS = 6000;

/** Surfaces medium-AI degradations: the engine fell back to the easy heuristic. */
export const AiStatus = () => {
  const [event, setEvent] = useState<AiStatusEvent | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeAiStatus(setEvent);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!event) return;
    const timer = window.setTimeout(() => setEvent(null), AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [event]);

  if (!event) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm text-amber-200"
    >
      <div className="flex items-start gap-3">
        <span className="flex-1 leading-relaxed">{MESSAGES[event.reason]}</span>
        <button
          type="button"
          aria-label="关闭提示"
          className="-my-1 rounded-lg px-2 text-white/60 transition hover:bg-white/10 hover:text-white"
          onClick={() => setEvent(null)}
        >
          ×
        </button>
      </div>
    </div>
  );
};
