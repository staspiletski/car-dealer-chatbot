import { Pool } from 'pg';

interface ValidationResult {
    isValid: boolean;
    reason?: string;
    pattern?: string;
}

interface RateLimitStore {
    [key: string]: { count: number; resetTime: number };
}

const DANGEROUS_PATTERNS = [
    {
        regex: /\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|EXEC|EXECUTE)\s+(TABLE|DATABASE|SCHEMA|FROM|INTO|VALUES)\b/gi,
        reason: 'Potential SQL injection - database modification',
        name: 'SQL_MODIFICATION'
    },
    {
        regex: /(-{2}|\/\*|\*\/|;)/g,
        reason: 'SQL comment or statement terminator detected',
        name: 'SQL_SYNTAX'
    },
    {
        regex: /\b(UNION|SELECT.*FROM|WHERE.*OR.*=)\b/gi,
        reason: 'Potential SQL injection - query manipulation',
        name: 'SQL_QUERY'
    },
    {
        regex: /(system\s+prompt|system\s+message|instructions|ignore.*previous|forget.*previous)/gi,
        reason: 'Prompt injection attempt - system override',
        name: 'PROMPT_INJECTION'
    },
    {
        regex: /(replace.*instructions|override.*rules|secret.*key|api.*key|password)/gi,
        reason: 'Prompt injection attempt - credential theft or rule override',
        name: 'PROMPT_JAILBREAK'
    },
    {
        regex: /\b(delete\s+database|drop\s+database|truncate\s+table|erase\s+data)\b/gi,
        reason: 'Explicit database destruction attempt',
        name: 'DATA_DESTRUCTION'
    }
];

const rateLimitStore: RateLimitStore = {};
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 30;

export function validateUserInput(input: string): ValidationResult {
    if (!input || input.trim().length === 0) {
        return { isValid: false, reason: 'Input cannot be empty' };
    }

    if (input.length > 2000) {
        return { isValid: false, reason: 'Input too long (max 2000 characters)' };
    }

    for (const pattern of DANGEROUS_PATTERNS) {
        if (pattern.regex.test(input)) {
            return {
                isValid: false,
                reason: pattern.reason,
                pattern: pattern.name
            };
        }
    }

    return { isValid: true };
}

export function detectSemanticThreats(input: string): ValidationResult {
    const lowerInput = input.toLowerCase();

    const threatPhrases = [
        'erase all',
        'remove everything',
        'destroy the database',
        'wipe the system',
        'hack the system',
        'bypass security',
        'circumvent protection'
    ];

    for (const phrase of threatPhrases) {
        if (lowerInput.includes(phrase)) {
            return {
                isValid: false,
                reason: `Potential harmful request detected: "${phrase}"`,
                pattern: 'SEMANTIC_THREAT'
            };
        }
    }

    return { isValid: true };
}

export function checkRateLimit(sessionId: string): ValidationResult {
    const now = Date.now();
    const key = `limit_${sessionId}`;

    if (!rateLimitStore[key]) {
        rateLimitStore[key] = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
        return { isValid: true };
    }

    const record = rateLimitStore[key];

    if (now > record.resetTime) {
        record.count = 1;
        record.resetTime = now + RATE_LIMIT_WINDOW;
        return { isValid: true };
    }

    record.count++;
    if (record.count > RATE_LIMIT_MAX_REQUESTS) {
        return {
            isValid: false,
            reason: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_REQUESTS} messages per minute`
        };
    }

    return { isValid: true };
}

export async function logBlockedRequest(
    pool: Pool,
    sessionId: string | null,
    userInput: string,
    reason: string,
    pattern: string | undefined
) {
    try {
        await pool.query(
            `INSERT INTO blocked_requests (session_id, user_input, reason, pattern_detected, timestamp)
       VALUES ($1, $2, $3, $4, NOW())`,
            [sessionId, userInput.substring(0, 500), reason, pattern || null]
        );
    } catch (error) {
        console.error('Failed to log blocked request:', error);
    }
}

export async function validateRequest(
    pool: Pool,
    sessionId: string | null,
    userInput: string
): Promise<ValidationResult> {
    const basicCheck = validateUserInput(userInput);
    if (!basicCheck.isValid) {
        await logBlockedRequest(pool, sessionId, userInput, basicCheck.reason!, basicCheck.pattern);
        return basicCheck;
    }

    const semanticCheck = detectSemanticThreats(userInput);
    if (!semanticCheck.isValid) {
        await logBlockedRequest(pool, sessionId, userInput, semanticCheck.reason!, semanticCheck.pattern);
        return semanticCheck;
    }

    if (sessionId) {
        const rateLimitCheck = checkRateLimit(sessionId);
        if (!rateLimitCheck.isValid) {
            return rateLimitCheck;
        }
    }

    return { isValid: true };
}

export function getSafeErrorMessage(reason?: string): string {
    const messages = [
        "I'm not able to help with that request.",
        "That question is outside my scope. Let's focus on vehicle inquiries!",
        "I can only assist with vehicle-related questions.",
        "I encountered an issue processing your request. Please try again."
    ];

    return messages[Math.floor(Math.random() * messages.length)];
}