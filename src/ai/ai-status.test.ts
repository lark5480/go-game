import { beforeEach, describe, expect, it } from 'vitest';
import {
  getLastAiStatus,
  reportAiDegradation,
  resetAiStatus,
  subscribeAiStatus,
} from './ai-status';
import type { AiStatusEvent } from './ai-status';

describe('ai-status', () => {
  beforeEach(() => {
    resetAiStatus();
  });

  it('starts with no recorded status', () => {
    expect(getLastAiStatus()).toBeNull();
  });

  it('delivers published events to subscribers', () => {
    const received: AiStatusEvent[] = [];
    const unsubscribe = subscribeAiStatus((event) => {
      if (event) received.push(event);
    });

    const before = Date.now();
    reportAiDegradation('worker-timeout');
    const after = Date.now();

    expect(received).toHaveLength(1);
    expect(received[0]?.reason).toBe('worker-timeout');
    expect(received[0]?.at).toBeGreaterThanOrEqual(before);
    expect(received[0]?.at).toBeLessThanOrEqual(after);

    unsubscribe();
  });

  it('notifies every subscriber of the same event', () => {
    const first: string[] = [];
    const second: string[] = [];
    const offFirst = subscribeAiStatus((event) => first.push(event?.reason ?? ''));
    const offSecond = subscribeAiStatus((event) => second.push(event?.reason ?? ''));

    reportAiDegradation('worker-error');

    expect(first).toEqual(['worker-error']);
    expect(second).toEqual(['worker-error']);

    offFirst();
    offSecond();
  });

  it('stops delivering after unsubscribe', () => {
    const received: AiStatusEvent[] = [];
    const unsubscribe = subscribeAiStatus((event) => {
      if (event) received.push(event);
    });

    reportAiDegradation('worker-unsupported');
    unsubscribe();
    reportAiDegradation('worker-construction-failed');

    expect(received).toHaveLength(1);
    expect(received[0]?.reason).toBe('worker-unsupported');
  });

  it('does not replay past events to a new subscriber', () => {
    reportAiDegradation('worker-unsupported');
    expect(getLastAiStatus()?.reason).toBe('worker-unsupported');

    const received: AiStatusEvent[] = [];
    const unsubscribe = subscribeAiStatus((event) => {
      if (event) received.push(event);
    });

    expect(received).toHaveLength(0);

    reportAiDegradation('worker-timeout');
    expect(received.map((event) => event.reason)).toEqual(['worker-timeout']);

    unsubscribe();
  });

  it('keeps only the most recent event in getLastAiStatus', () => {
    reportAiDegradation('worker-unsupported');
    reportAiDegradation('worker-timeout');
    reportAiDegradation('worker-error');

    expect(getLastAiStatus()?.reason).toBe('worker-error');
  });

  it('resetAiStatus clears the recorded event and the subscribers', () => {
    const received: AiStatusEvent[] = [];
    subscribeAiStatus((event) => {
      if (event) received.push(event);
    });

    reportAiDegradation('worker-error');
    resetAiStatus();

    expect(getLastAiStatus()).toBeNull();

    reportAiDegradation('worker-timeout');
    expect(received).toHaveLength(1);
  });
});
