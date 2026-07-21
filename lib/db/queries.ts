import { getDbPool } from './pool';

export async function getVehicles(limit = 10): Promise<any[]> {
    const pool = getDbPool();
    const result = await pool.query(
        `SELECT * FROM vehicles WHERE in_stock = true ORDER BY created_at DESC LIMIT $1`,
        [limit]
    );
    return result.rows;
}

export async function searchVehicles(
    minPrice: number,
    maxPrice: number,
    fuelType?: string,
    transmission?: string
): Promise<any[]> {
    const pool = getDbPool();
    let query = `SELECT * FROM vehicles WHERE in_stock = true AND price >= $1 AND price <= $2`;
    const params: any[] = [minPrice, maxPrice];

    if (fuelType) {
        params.push(fuelType);
        query += ` AND fuel_type = $${params.length}`;
    }

    if (transmission) {
        params.push(transmission);
        query += ` AND transmission = $${params.length}`;
    }

    query += ` ORDER BY price ASC`;

    const result = await pool.query(query, params);
    return result.rows;
}

export async function getVehicleById(id: number): Promise<any | null> {
    const pool = getDbPool();
    const result = await pool.query(
        `SELECT * FROM vehicles WHERE id = $1`,
        [id]
    );
    return result.rows[0] || null;
}

export async function createChatSession(
    sessionId: string,
    customerEmail?: string,
    customerName?: string
): Promise<any> {
    const pool = getDbPool();
    const result = await pool.query(
        `INSERT INTO chat_sessions (id, customer_email, customer_name, status, started_at)
     VALUES ($1, $2, $3, 'active', NOW())
     RETURNING *`,
        [sessionId, customerEmail || null, customerName || null]
    );
    return result.rows[0];
}

export async function getChatHistory(sessionId: string): Promise<any[]> {
    const pool = getDbPool();
    const result = await pool.query(
        `SELECT * FROM chat_messages WHERE session_id = $1 ORDER BY timestamp ASC`,
        [sessionId]
    );
    return result.rows;
}

export async function addChatMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
): Promise<any> {
    const pool = getDbPool();
    const result = await pool.query(
        `INSERT INTO chat_messages (session_id, role, content, timestamp)
     VALUES ($1, $2, $3, NOW())
     RETURNING *`,
        [sessionId, role, content]
    );
    return result.rows[0];
}

export async function saveLead(
    email: string,
    name: string,
    phone: string | null,
    preferences: any,
    sessionId?: string
): Promise<any> {
    const pool = getDbPool();
    try {
        const result = await pool.query(
            `INSERT INTO leads (email, name, phone, preferences, session_id, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (email) DO UPDATE SET preferences = $4
       RETURNING *`,
            [email, name, phone, JSON.stringify(preferences), sessionId || null]
        );
        return result.rows[0];
    } catch (error) {
        throw error;
    }
}

export function validatePrice(price: any): number {
    const parsed = parseFloat(price);
    if (isNaN(parsed) || parsed < 0) {
        throw new Error('Invalid price');
    }
    return parsed;
}

export function validateEmail(email: string): string {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
    }
    return email;
}