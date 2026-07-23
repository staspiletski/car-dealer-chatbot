import { test, expect, Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { getDbPool, closeDbPool } from '../../lib/db/pool';
import { addChatMessage } from '../../lib/db/queries';

async function freshSession(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

async function seedSessionWithHistory(page: Page, sessionId: string) {
  const pool = getDbPool();
  await pool.query(
    `INSERT INTO chat_sessions (id, status, started_at) VALUES ($1, 'active', NOW())`,
    [sessionId]
  );
  await addChatMessage(sessionId, 'user', 'What SUVs do you have?');
  await addChatMessage(sessionId, 'assistant', 'We have a few great SUV options!');

  await page.goto('/');
  await page.evaluate(
    ({ id }) => {
      localStorage.setItem('cardealerbot.sessionHistory', JSON.stringify([id]));
    },
    { id: sessionId }
  );
  await page.reload();
}

async function sendMessage(page: Page, text: string) {
  const input = page.getByPlaceholder('Ask about vehicles, prices, features...');
  await input.fill(text);
  await input.press('Enter');
}

function lastBotBubble(page: Page) {
  return page.locator('.bg-white.text-slate-900').last();
}

test.afterAll(async () => {
  await closeDbPool();
});

test.describe('US1 - /sessions', () => {
  test('shows an empty-state message for a brand-new browser', async ({ page }) => {
    await freshSession(page);
    await sendMessage(page, '/sessions');

    await expect(lastBotBubble(page)).toContainText(/don't have any previous conversations/i);
  });

  test('lists a seeded previous conversation with its message count', async ({ page }) => {
    const sessionId = randomUUID();
    try {
      await seedSessionWithHistory(page, sessionId);
      await sendMessage(page, '/sessions');

      await expect(lastBotBubble(page)).toContainText('2 messages');
    } finally {
      const pool = getDbPool();
      await pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);
    }
  });
});

test.describe('US2 - /load', () => {
  test('gives a usage hint when no reference is provided', async ({ page }) => {
    await freshSession(page);
    await sendMessage(page, '/load');

    await expect(lastBotBubble(page)).toContainText(/please tell me which conversation/i);
  });

  test('reports not-found for an unknown reference', async ({ page }) => {
    await freshSession(page);
    await sendMessage(page, '/load 00000000-0000-4000-8000-000000000000');

    await expect(lastBotBubble(page)).toContainText(/couldn't find that conversation/i);
  });

  test('resumes a seeded conversation and restores its full history', async ({ page }) => {
    const sessionId = randomUUID();
    try {
      await seedSessionWithHistory(page, sessionId);
      await sendMessage(page, '/sessions');
      await expect(lastBotBubble(page)).toContainText('2 messages');

      await sendMessage(page, '/load 1');

      await expect(page.getByText('What SUVs do you have?')).toBeVisible();
      await expect(page.getByText('We have a few great SUV options!')).toBeVisible();
    } finally {
      const pool = getDbPool();
      await pool.query('DELETE FROM chat_sessions WHERE id = $1', [sessionId]);
    }
  });
});

test.describe('US3 - /clear', () => {
  test('prompts for confirmation and only clears after /clear confirm', async ({ page }) => {
    await freshSession(page);
    // The user's own sent messages render as `<p class="text-sm">`, distinct from the
    // assistant's markdown-rendered reply, so this scopes to the user bubble only.
    const userHelpBubble = page.locator('p.text-sm', { hasText: '/help' });

    await sendMessage(page, '/help');
    await expect(userHelpBubble).toBeVisible();

    await sendMessage(page, '/clear');
    await expect(lastBotBubble(page)).toContainText(/clear confirm/i);

    // Prior messages should still be visible before confirming.
    await expect(userHelpBubble).toBeVisible();

    await sendMessage(page, '/clear confirm');

    // After confirming, the conversation view is emptied.
    await expect(userHelpBubble).not.toBeVisible();
  });
});

test.describe('US4 - /help and unknown commands', () => {
  test('lists all four commands', async ({ page }) => {
    await freshSession(page);
    await sendMessage(page, '/help');

    const bubble = lastBotBubble(page);
    await expect(bubble).toContainText('/sessions');
    await expect(bubble).toContainText('/load');
    await expect(bubble).toContainText('/clear');
    await expect(bubble).toContainText('/help');
  });

  test('redirects an unrecognized command to /help', async ({ page }) => {
    await freshSession(page);
    await sendMessage(page, '/notacommand');

    await expect(lastBotBubble(page)).toContainText(/\/help/);
  });
});
