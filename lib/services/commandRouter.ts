import type { CommandRouterDeps, CommandResult, SessionSummary } from './types';
import { getDbPool } from '@/lib/db/pool';  // ← ADD THIS IMPORT AT TOP

const HELP_TEXT = [
  '**Available commands:**',
  '- `/sessions` — list your previous conversations with their date and message count',
  '- `/load [reference]` — resume a previous conversation by its number or ID from `/sessions`',
  '- `/clear` — clear the current conversation (asks you to confirm first)',
  '- `/help` — show this list of commands',
].join('\n');

interface ParsedCommand {
  name: 'sessions' | 'load' | 'clear' | 'clear_confirm' | 'help' | 'unknown';
  arg?: string;
}

export function parseCommand(message: string): ParsedCommand | null {
  const trimmed = message.trim();

  console.log('🔍 [parseCommand] Input message:', trimmed);
  console.log('🔍 [parseCommand] Starts with /:', trimmed.startsWith('/'));

  if (!trimmed.startsWith('/')) {
    console.log('🔍 [parseCommand] Not a command, returning null');
    return null;
  }

  const [rawName, ...rest] = trimmed.slice(1).split(/\s+/);
  const name = rawName.toLowerCase();
  const arg = rest.join(' ').trim();

  console.log('🔍 [parseCommand] Command name:', name, 'Arg:', arg);

  if (name === 'sessions') {
    console.log('✅ [parseCommand] Recognized: sessions');
    return { name: 'sessions' };
  }
  if (name === 'load') {
    console.log('✅ [parseCommand] Recognized: load');
    return { name: 'load', arg };
  }
  if (name === 'help') {
    console.log('✅ [parseCommand] Recognized: help');
    return { name: 'help' };
  }
  if (name === 'clear') {
    const result = arg.toLowerCase() === 'confirm' ? { name: 'clear_confirm' as const } : { name: 'clear' as const };
    console.log('✅ [parseCommand] Recognized:', result.name);
    return result;
  }

  console.log('⚠️ [parseCommand] Unknown command:', name);
  return { name: 'unknown' };
}

function formatSessionList(sessions: SessionSummary[]): string {
  if (sessions.length === 0) {
    return "You don't have any previous conversations yet.";
  }

  const lines = sessions.map((session, index) => {
    const date = new Date(session.startedAt).toLocaleString();
    const count = session.messageCount;
    const noun = count === 1 ? 'message' : 'messages';
    return `#${index + 1} — ${date} — ${count} ${noun} (id: ${session.id})`;
  });

  return ['**Your previous conversations:**', ...lines].join('\n');
}

async function getDisplayableSessions(
    _knownSessionIds: string[],
    deps: CommandRouterDeps
): Promise<SessionSummary[]> {
  console.log('📋 [getDisplayableSessions] Fetching ALL sessions from database (ignoring knownSessionIds)');

  const sessions = await deps.getSessionsMetadata([]);
  console.log('📋 [getDisplayableSessions] Total sessions fetched:', sessions.length);

  const filtered = sessions.filter((session) => session.messageCount > 0);
  console.log('📋 [getDisplayableSessions] After filtering (messageCount > 0):', filtered.length);

  return filtered;
}

async function handleSessions(
    knownSessionIds: string[],
    deps: CommandRouterDeps
): Promise<CommandResult> {
  console.log('🎯 [handleSessions] Processing /sessions command');
  const sessions = await getDisplayableSessions(knownSessionIds, deps);
  const response = formatSessionList(sessions);
  console.log('🎯 [handleSessions] Returning response with', sessions.length, 'sessions');
  return { type: 'sessions', responseText: response };
}

async function handleLoad(
    arg: string,
    knownSessionIds: string[],
    deps: CommandRouterDeps
): Promise<CommandResult> {
  console.log('🎯 [handleLoad] Processing /load command with arg:', arg);
  console.log('🎯 [handleLoad] knownSessionIds:', knownSessionIds);

  if (!arg) {
    console.log('🎯 [handleLoad] No argument provided');
    return {
      type: 'load',
      responseText:
          'Please tell me which conversation to load, e.g. `/load 1` (see `/sessions` for the list) or `/load <id>`.',
    };
  }

  let targetId: string | null = null;

  // CASE 1: Numeric reference like /load 1
  if (/^\d+$/.test(arg)) {
    console.log('🎯 [handleLoad] Numeric reference detected:', arg);
    const sessions = await getDisplayableSessions([], deps);
    console.log('🎯 [handleLoad] Total displayable sessions:', sessions.length);
    console.log('🎯 [handleLoad] Sessions:', sessions.map(s => ({ id: s.id, messageCount: s.messageCount })));

    const index = parseInt(arg, 10) - 1;
    console.log('🎯 [handleLoad] Looking for index:', index, '(user said:', arg, ')');

    targetId = sessions[index]?.id ?? null;
    console.log('🎯 [handleLoad] Found session ID at index:', targetId);
  }
  // CASE 2: Direct UUID - check current session first
  else if (knownSessionIds.includes(arg)) {
    console.log('🎯 [handleLoad] UUID found in knownSessionIds');
    targetId = arg;
  }
  // CASE 3: Direct UUID - query database
  else {
    console.log('🎯 [handleLoad] UUID not in knownSessionIds, querying database...');

    try {
      const pool = getDbPool();  // ← FIXED: Direct import, not from deps

      const result = await pool.query(
          'SELECT id, started_at, (SELECT COUNT(*) FROM chat_messages WHERE session_id = chat_sessions.id) as message_count FROM chat_sessions WHERE id = $1',
          [arg]
      );

      console.log('🎯 [handleLoad] Direct UUID lookup result:', result.rows.length, 'rows');

      if (result.rows.length > 0) {
        const session = result.rows[0];
        console.log('🎯 [handleLoad] Found session:', {
          id: session.id,
          messageCount: session.message_count,
          startedAt: session.started_at
        });
        targetId = session.id;
      } else {
        console.log('🎯 [handleLoad] UUID not found in database');

        // As fallback, get all sessions and search
        console.log('🎯 [handleLoad] Attempting fallback: query all sessions');
        const allSessions = await getDisplayableSessions([], deps);
        console.log('🎯 [handleLoad] All displayable sessions:', allSessions.length);
        console.log('🎯 [handleLoad] Sessions list:', allSessions.map(s => ({ id: s.id, messageCount: s.messageCount })));

        targetId = allSessions.find(s => s.id === arg)?.id ?? null;
        console.log('🎯 [handleLoad] Fallback lookup result:', targetId);
      }
    } catch (error) {
      console.error('🎯 [handleLoad] Error querying database:', error);
    }
  }

  if (!targetId) {
    console.log('❌ [handleLoad] Session not found for arg:', arg);
    return {
      type: 'load',
      responseText: "I couldn't find that conversation. Try `/sessions` to see what's available.",
    };
  }

  console.log('🎯 [handleLoad] Loading history for session:', targetId);
  const restoredMessages = await deps.getChatHistory(targetId);
  console.log('🎯 [handleLoad] Restored', restoredMessages.length, 'messages');

  return {
    type: 'load',
    responseText: 'Here you go — picking up where you left off.',
    activeSessionId: targetId,
    restoredMessages,
  };
}

function handleClearPrompt(): CommandResult {
  console.log('🎯 [handleClear] Processing /clear command (prompt)');
  return {
    type: 'clear_prompt',
    responseText:
        'Are you sure you want to clear this conversation? Reply `/clear confirm` to proceed.',
  };
}

async function handleClearConfirmed(
    sessionId: string,
    deps: CommandRouterDeps
): Promise<CommandResult> {
  console.log('🎯 [handleClearConfirmed] Processing /clear confirm command for session:', sessionId);
  const deletedCount = await deps.deleteSessionMessages(sessionId);
  console.log('🎯 [handleClearConfirmed] Deleted', deletedCount, 'messages');
  return {
    type: 'clear_confirmed',
    responseText:
        deletedCount > 0
            ? 'Your conversation has been cleared.'
            : 'There was nothing to clear.',
  };
}

function handleHelp(): CommandResult {
  console.log('🎯 [handleHelp] Processing /help command');
  return { type: 'help', responseText: HELP_TEXT };
}

function handleUnknownCommand(): CommandResult {
  console.log('🎯 [handleUnknownCommand] Processing unknown command');
  return {
    type: 'unknown',
    responseText: `Sorry, I don't recognize that command. ${HELP_TEXT}`,
  };
}

export interface CommandRequest {
  message: string;
  sessionId: string;
  knownSessionIds: string[];
}

export interface CommandRouter {
  handle(request: CommandRequest): Promise<CommandResult | null>;
}

export function createCommandRouter(deps: CommandRouterDeps): CommandRouter {
  return {
    async handle({ message, sessionId, knownSessionIds }: CommandRequest): Promise<CommandResult | null> {
      console.log('📡 [CommandRouter.handle] Received message:', message);
      console.log('📡 [CommandRouter.handle] sessionId:', sessionId);
      console.log('📡 [CommandRouter.handle] knownSessionIds count:', knownSessionIds.length);

      const parsed = parseCommand(message);

      console.log('📡 [CommandRouter.handle] Parsed command:', parsed ? parsed.name : 'null (not a command)');

      if (!parsed) {
        console.log('📡 [CommandRouter.handle] Not a command, passing to LLM');
        return null;
      }

      console.log('📡 [CommandRouter.handle] Executing command:', parsed.name);

      let result: CommandResult | null = null;

      switch (parsed.name) {
        case 'sessions':
          result = await handleSessions(knownSessionIds, deps);
          break;
        case 'load':
          result = await handleLoad(parsed.arg ?? '', knownSessionIds, deps);
          break;
        case 'clear':
          result = handleClearPrompt();
          break;
        case 'clear_confirm':
          result = await handleClearConfirmed(sessionId, deps);
          break;
        case 'help':
          result = handleHelp();
          break;
        case 'unknown':
        default:
          result = handleUnknownCommand();
      }

      console.log('📡 [CommandRouter.handle] Returning result type:', result.type);
      return result;
    },
  };
}