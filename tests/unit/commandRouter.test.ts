import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCommandRouter, parseCommand } from '../../lib/services/commandRouter';
import type { CommandRouterDeps, SessionSummary, RestoredMessage } from '../../lib/services/types';

function makeDeps(overrides: Partial<CommandRouterDeps> = {}): CommandRouterDeps {
  return {
    getSessionsMetadata: vi.fn(async () => [] as SessionSummary[]),
    getChatHistory: vi.fn(async () => [] as RestoredMessage[]),
    deleteSessionMessages: vi.fn(async () => 0),
    ...overrides
  };
}

describe('parseCommand', () => {
  it('returns null for ordinary chat messages', () => {
    expect(parseCommand('I want a Tesla')).toBeNull();
  });

  it('is case-insensitive and whitespace-tolerant', () => {
    expect(parseCommand('  /HELP  ')).toEqual({ name: 'help' });
    expect(parseCommand('/Sessions')).toEqual({ name: 'sessions' });
  });

  it('parses /load with an argument', () => {
    expect(parseCommand('/load 2')).toEqual({ name: 'load', arg: '2' });
  });

  it('distinguishes /clear from /clear confirm', () => {
    expect(parseCommand('/clear')).toEqual({ name: 'clear' });
    expect(parseCommand('/clear confirm')).toEqual({ name: 'clear_confirm' });
    expect(parseCommand('/CLEAR CONFIRM')).toEqual({ name: 'clear_confirm' });
  });

  it('classifies unrecognized "/" input as unknown', () => {
    expect(parseCommand('/notacommand')).toEqual({ name: 'unknown' });
  });
});

describe('commandRouter — /sessions (US1)', () => {
  it('returns an empty-state message when there are no known sessions', async () => {
    const router = createCommandRouter(makeDeps());
    const result = await router.handle({ message: '/sessions', sessionId: 's1', knownSessionIds: [] });

    expect(result?.type).toBe('sessions');
    expect(result?.responseText).toMatch(/don't have any previous conversations/i);
  });

  it('lists known sessions with date and message count, most-recent first', async () => {
    const sessions: SessionSummary[] = [
      { id: 'a', startedAt: '2026-07-20T10:00:00.000Z', messageCount: 5 },
      { id: 'b', startedAt: '2026-07-19T10:00:00.000Z', messageCount: 2 }
    ];
    const getSessionsMetadata = vi.fn(async () => sessions);
    const router = createCommandRouter(makeDeps({ getSessionsMetadata }));

    const result = await router.handle({
      message: '/sessions',
      sessionId: 's1',
      knownSessionIds: ['a', 'b']
    });

    expect(getSessionsMetadata).toHaveBeenCalledWith(['a', 'b']);
    expect(result?.type).toBe('sessions');
    expect(result?.responseText).toContain('#1');
    expect(result?.responseText).toContain('5 messages');
    expect(result?.responseText).toContain('#2');
    expect(result?.responseText).toContain('2 messages');
  });

  it('excludes zero-message sessions (e.g. the just-created active session) from the list', async () => {
    const sessions: SessionSummary[] = [
      { id: 'brand-new', startedAt: '2026-07-22T10:00:00.000Z', messageCount: 0 }
    ];
    const router = createCommandRouter(makeDeps({ getSessionsMetadata: vi.fn(async () => sessions) }));

    const result = await router.handle({
      message: '/sessions',
      sessionId: 's1',
      knownSessionIds: ['brand-new']
    });

    expect(result?.responseText).toMatch(/don't have any previous conversations/i);
  });
});

describe('commandRouter — /load (US2)', () => {
  it('prompts for a reference when none is given', async () => {
    const router = createCommandRouter(makeDeps());
    const result = await router.handle({ message: '/load', sessionId: 's1', knownSessionIds: [] });

    expect(result?.type).toBe('load');
    expect(result?.responseText).toMatch(/please tell me which conversation/i);
    expect(result?.activeSessionId).toBeUndefined();
  });

  it('resolves a numeric index against the known-session ordering and restores history', async () => {
    const sessions: SessionSummary[] = [
      { id: 'a', startedAt: '2026-07-20T10:00:00.000Z', messageCount: 2 },
      { id: 'b', startedAt: '2026-07-19T10:00:00.000Z', messageCount: 1 }
    ];
    const history: RestoredMessage[] = [
      { role: 'user', content: 'hi', timestamp: '2026-07-19T10:00:00.000Z' },
      { role: 'assistant', content: 'hello', timestamp: '2026-07-19T10:00:04.000Z' }
    ];
    const getSessionsMetadata = vi.fn(async () => sessions);
    const getChatHistory = vi.fn(async () => history);
    const router = createCommandRouter(makeDeps({ getSessionsMetadata, getChatHistory }));

    const result = await router.handle({
      message: '/load 2',
      sessionId: 's1',
      knownSessionIds: ['a', 'b']
    });

    expect(getChatHistory).toHaveBeenCalledWith('b');
    expect(result?.type).toBe('load');
    expect(result?.activeSessionId).toBe('b');
    expect(result?.restoredMessages).toEqual(history);
  });

  it('resolves a full UUID reference only if present in knownSessionIds', async () => {
    const getChatHistory = vi.fn(async () => [] as RestoredMessage[]);
    const router = createCommandRouter(makeDeps({ getChatHistory }));

    const result = await router.handle({
      message: '/load b',
      sessionId: 's1',
      knownSessionIds: ['a', 'b']
    });

    expect(getChatHistory).toHaveBeenCalledWith('b');
    expect(result?.activeSessionId).toBe('b');
  });

  it('returns a generic not-found message for a reference outside knownSessionIds (no enumeration, FR-006)', async () => {
    const getChatHistory = vi.fn(async () => [] as RestoredMessage[]);
    const router = createCommandRouter(makeDeps({ getChatHistory }));

    const foreignRef = await router.handle({
      message: '/load some-other-uuid-that-exists-in-db',
      sessionId: 's1',
      knownSessionIds: ['a', 'b']
    });
    const missingRef = await router.handle({
      message: '/load totally-made-up',
      sessionId: 's1',
      knownSessionIds: ['a', 'b']
    });

    expect(getChatHistory).not.toHaveBeenCalled();
    expect(foreignRef?.responseText).toBe(missingRef?.responseText);
    expect(foreignRef?.activeSessionId).toBeUndefined();
    expect(foreignRef?.responseText).toMatch(/couldn't find/i);
  });

  it('returns a not-found message for an out-of-range numeric index', async () => {
    const getSessionsMetadata = vi.fn(async () => [] as SessionSummary[]);
    const router = createCommandRouter(makeDeps({ getSessionsMetadata }));

    const result = await router.handle({
      message: '/load 5',
      sessionId: 's1',
      knownSessionIds: []
    });

    expect(result?.activeSessionId).toBeUndefined();
    expect(result?.responseText).toMatch(/couldn't find/i);
  });
});

describe('commandRouter — /clear (US3)', () => {
  it('does not delete anything on the first /clear', async () => {
    const deleteSessionMessages = vi.fn(async () => 3);
    const router = createCommandRouter(makeDeps({ deleteSessionMessages }));

    const result = await router.handle({ message: '/clear', sessionId: 's1', knownSessionIds: [] });

    expect(deleteSessionMessages).not.toHaveBeenCalled();
    expect(result?.type).toBe('clear_prompt');
    expect(result?.responseText).toMatch(/clear confirm/i);
  });

  it('deletes the active session messages on /clear confirm', async () => {
    const deleteSessionMessages = vi.fn(async () => 4);
    const router = createCommandRouter(makeDeps({ deleteSessionMessages }));

    const result = await router.handle({
      message: '/clear confirm',
      sessionId: 'active-session',
      knownSessionIds: []
    });

    expect(deleteSessionMessages).toHaveBeenCalledWith('active-session');
    expect(result?.type).toBe('clear_confirmed');
    expect(result?.responseText).toMatch(/cleared/i);
  });

  it('reports nothing to clear when zero rows were deleted', async () => {
    const deleteSessionMessages = vi.fn(async () => 0);
    const router = createCommandRouter(makeDeps({ deleteSessionMessages }));

    const result = await router.handle({
      message: '/clear confirm',
      sessionId: 'empty-session',
      knownSessionIds: []
    });

    expect(result?.responseText).toMatch(/nothing to clear/i);
  });
});

describe('commandRouter — /help and unknown commands (US4)', () => {
  it('lists all four commands', async () => {
    const router = createCommandRouter(makeDeps());
    const result = await router.handle({ message: '/help', sessionId: 's1', knownSessionIds: [] });

    expect(result?.type).toBe('help');
    for (const cmd of ['/sessions', '/load', '/clear', '/help']) {
      expect(result?.responseText).toContain(cmd);
    }
  });

  it('redirects unrecognized "/" commands to /help', async () => {
    const router = createCommandRouter(makeDeps());
    const result = await router.handle({ message: '/frobnicate', sessionId: 's1', knownSessionIds: [] });

    expect(result?.type).toBe('unknown');
    expect(result?.responseText).toMatch(/\/help/);
  });

  it('returns null (not handled) for ordinary chat messages, letting the caller fall through to the LLM', async () => {
    const router = createCommandRouter(makeDeps());
    const result = await router.handle({
      message: 'What SUVs do you have under $40k?',
      sessionId: 's1',
      knownSessionIds: []
    });

    expect(result).toBeNull();
  });
});
