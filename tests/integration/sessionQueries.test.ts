import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getDbPool, closeDbPool } from '../../lib/db/pool';
import {
  getSessionsMetadata,
  deleteSessionMessages,
  addChatMessage,
  saveLead
} from '../../lib/db/queries';

async function createSession(startedAt: Date): Promise<string> {
  const pool = getDbPool();
  const id = randomUUID();
  await pool.query(
    `INSERT INTO chat_sessions (id, status, started_at) VALUES ($1, 'active', $2)`,
    [id, startedAt]
  );
  return id;
}

const createdSessionIds: string[] = [];

describe('session repository (integration)', () => {
  beforeAll(async () => {
    const pool = getDbPool();
    await pool.query('SELECT 1');
  });

  afterAll(async () => {
    const pool = getDbPool();
    if (createdSessionIds.length > 0) {
      await pool.query('DELETE FROM chat_sessions WHERE id = ANY($1)', [createdSessionIds]);
    }
    await closeDbPool();
  });

  it('getSessionsMetadata returns only requested sessions, with counts and recency ordering', async () => {
    const older = await createSession(new Date('2026-07-01T10:00:00.000Z'));
    const newer = await createSession(new Date('2026-07-10T10:00:00.000Z'));
    const notRequested = await createSession(new Date('2026-07-15T10:00:00.000Z'));
    createdSessionIds.push(older, newer, notRequested);

    await addChatMessage(older, 'user', 'hi');
    await addChatMessage(older, 'assistant', 'hello');
    await addChatMessage(newer, 'user', 'hey');

    const results = await getSessionsMetadata([older, newer]);

    expect(results.map((r) => r.id)).toEqual([newer, older]);
    expect(results.find((r) => r.id === older)?.messageCount).toBe(2);
    expect(results.find((r) => r.id === newer)?.messageCount).toBe(1);
    expect(results.find((r) => r.id === notRequested)).toBeUndefined();
  });

  it('getSessionsMetadata returns an empty array for an empty id list', async () => {
    const results = await getSessionsMetadata([]);
    expect(results).toEqual([]);
  });

  it('deleteSessionMessages removes only that session\'s messages and leaves leads untouched', async () => {
    const sessionId = await createSession(new Date());
    createdSessionIds.push(sessionId);

    await addChatMessage(sessionId, 'user', 'question');
    await addChatMessage(sessionId, 'assistant', 'answer');
    const leadEmail = `test-${randomUUID()}@example.com`;
    await saveLead(leadEmail, 'Test Customer', null, {}, sessionId);

    const deletedCount = await deleteSessionMessages(sessionId);
    expect(deletedCount).toBe(2);

    const [afterDelete] = await getSessionsMetadata([sessionId]);
    expect(afterDelete.messageCount).toBe(0);

    const pool = getDbPool();
    const leadRows = await pool.query('SELECT * FROM leads WHERE email = $1', [leadEmail]);
    expect(leadRows.rows).toHaveLength(1);

    await pool.query('DELETE FROM leads WHERE email = $1', [leadEmail]);
  });

  it('deleteSessionMessages returns 0 when the session already has no messages', async () => {
    const sessionId = await createSession(new Date());
    createdSessionIds.push(sessionId);

    const deletedCount = await deleteSessionMessages(sessionId);
    expect(deletedCount).toBe(0);
  });
});
