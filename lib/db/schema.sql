-- lib/db/schema.sql
-- Car Dealer Chatbot Database Schema

-- Vehicles table (FR-003)
CREATE TABLE IF NOT EXISTS vehicles (
    id SERIAL PRIMARY KEY,
    brand VARCHAR(100) NOT NULL,
    model VARCHAR(100) NOT NULL,
    year INT NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    mileage INT NOT NULL,
    transmission VARCHAR(20),
    fuel_type VARCHAR(20),
    color VARCHAR(50),
    description TEXT,
    in_stock BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat sessions table (FR-005)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY,
    customer_email VARCHAR(100),
    customer_name VARCHAR(100),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'active',
    preferences JSONB
);

-- Chat messages table (FR-005)
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leads table (FR-006)
CREATE TABLE IF NOT EXISTS leads (
    id SERIAL PRIMARY KEY,
    email VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    preferences JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_id UUID REFERENCES chat_sessions(id)
);

-- Blocked requests log (FR-004)
CREATE TABLE IF NOT EXISTS blocked_requests (
    id SERIAL PRIMARY KEY,
    session_id UUID,
    user_input TEXT,
    reason VARCHAR(255),
    pattern_detected VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles(price);
CREATE INDEX IF NOT EXISTS idx_vehicles_fuel_type ON vehicles(fuel_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_transmission ON vehicles(transmission);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_blocked_requests_timestamp ON blocked_requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);

-- Insert dummy vehicles data (FR-003)
INSERT INTO vehicles (brand, model, year, price, mileage, transmission, fuel_type, color, description, in_stock)
VALUES
    ('Tesla', 'Model 3', 2024, 45999.00, 0, 'Automatic', 'Electric', 'Pearl White', 'Premium electric sedan with Autopilot', true),
    ('BMW', '330i', 2023, 52500.00, 15000, 'Automatic', 'Gasoline', 'Alpine Black', 'Luxury sports sedan with M Package', true),
    ('Honda', 'Civic', 2023, 28900.00, 25000, 'CVT', 'Gasoline', 'Sonic Blue', 'Reliable compact car, great fuel economy', true),
    ('Toyota', 'RAV4', 2024, 38450.00, 5000, 'Automatic', 'Hybrid', 'Silver Metallic', 'Popular SUV with excellent safety ratings', true),
    ('Ford', 'Mustang', 2023, 48900.00, 22000, 'Automatic', 'Gasoline', 'Red', 'Iconic sports car with powerful engine', true),
    ('Porsche', '911 Carrera', 2022, 99999.00, 35000, 'Automatic', 'Gasoline', 'Midnight Blue', 'Legendary sports car, pristine condition', true),
    ('Audi', 'A4', 2023, 44500.00, 18000, 'Automatic', 'Gasoline', 'Pearl Gray', 'Luxury sedan with advanced tech features', true),
    ('Chevrolet', 'Corvette', 2024, 68900.00, 0, 'Automatic', 'Gasoline', 'Bright Yellow', 'Next-gen sports car, mid-engine marvel', true),
    ('Hyundai', 'Elantra', 2023, 22800.00, 32000, 'Automatic', 'Gasoline', 'Cream White', 'Affordable sedan with modern styling', true),
    ('Subaru', 'Outback', 2024, 32100.00, 12000, 'CVT', 'Gasoline', 'Magnetite Gray', 'AWD wagon perfect for adventures', true),
    ('Volkswagen', 'Golf GTI', 2023, 35900.00, 28000, 'Manual', 'Gasoline', 'Deep Black', 'Performance hatchback for driving enthusiasts', true),
    ('Mazda', 'CX-5', 2023, 31500.00, 20000, 'Automatic', 'Gasoline', 'Soul Red', 'Stylish compact crossover with great handling', true)
ON CONFLICT DO NOTHING;
