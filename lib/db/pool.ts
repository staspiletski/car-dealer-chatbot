import { Pool } from 'pg';

let pool: Pool | null = null;

export function getDbPool(): Pool {
    if (!pool) {
        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is not set');
        }

        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 2000,
        });

        pool.on('error', (err) => {
            console.error('Unexpected pool error:', err);
        });
    }

    return pool;
}

export async function closeDbPool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
    }
}

export async function testConnection(): Promise<boolean> {
    try {
        const pool = getDbPool();
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Database connected:', result.rows[0]);
        return true;
    } catch (error) {
        console.error('❌ Database connection failed:', error);
        return false;
    }
}