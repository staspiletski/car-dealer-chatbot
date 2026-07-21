const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

async function initDB() {
    try {
        console.log('📦 Initializing database...');

        // Read and execute schema
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schema = fs.readFileSync(schemaPath, 'utf8');

        // Split by semicolon and execute each statement
        const statements = schema.split(';').filter(stmt => stmt.trim());
        for (const stmt of statements) {
            await pool.query(stmt);
        }

        console.log('✅ Database initialization complete!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Database initialization failed:', err.message);
        process.exit(1);
    }
}

initDB();