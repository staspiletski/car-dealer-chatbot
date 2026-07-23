export interface SessionSummary {
  id: string;
  startedAt: string;
  messageCount: number;
}

export interface RestoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export type CommandType =
  | 'sessions'
  | 'load'
  | 'clear_prompt'
  | 'clear_confirmed'
  | 'help'
  | 'unknown';

export interface CommandResult {
  type: CommandType;
  responseText: string;
  activeSessionId?: string;
  restoredMessages?: RestoredMessage[];
}

export interface CommandRouterDeps {
  getSessionsMetadata(sessionIds: string[]): Promise<SessionSummary[]>;
  getChatHistory(sessionId: string): Promise<RestoredMessage[]>;
  deleteSessionMessages(sessionId: string): Promise<number>;
}
