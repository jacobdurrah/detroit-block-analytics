-- Detroit Block Analytics Database Schema
-- For use with Supabase (PostgreSQL)

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Blocks table: Stores unique street blocks
CREATE TABLE IF NOT EXISTS blocks (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    block_id VARCHAR(255) UNIQUE NOT NULL, -- Format: streetname_fromcross_tocross
    street_name VARCHAR(255) NOT NULL,
    from_cross_street VARCHAR(255) NOT NULL,
    to_cross_street VARCHAR(255) NOT NULL,
    block_bounds GEOMETRY(Polygon, 4326), -- Spatial bounds of the block
    center_point GEOMETRY(Point, 4326), -- Center point for mapping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create spatial indexes for geographic queries
CREATE INDEX idx_blocks_bounds ON blocks USING GIST (block_bounds);
CREATE INDEX idx_blocks_center ON blocks USING GIST (center_point);
CREATE INDEX idx_blocks_street_name ON blocks (street_name);

-- Block parcels: Links parcels to blocks
CREATE TABLE IF NOT EXISTS block_parcels (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
    parcel_id VARCHAR(255) NOT NULL,
    address VARCHAR(500),
    property_data JSONB, -- Store full parcel data as JSONB
    geometry GEOMETRY(Geometry, 4326), -- Parcel geometry
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(block_id, parcel_id)
);

CREATE INDEX idx_block_parcels_block_id ON block_parcels (block_id);
CREATE INDEX idx_block_parcels_parcel_id ON block_parcels (parcel_id);
CREATE INDEX idx_block_parcels_geometry ON block_parcels USING GIST (geometry);
CREATE INDEX idx_block_parcels_property_data ON block_parcels USING GIN (property_data);

-- Block analytics: Computed analytics for each block
CREATE TABLE IF NOT EXISTS block_analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    block_id UUID REFERENCES blocks(id) ON DELETE CASCADE,
    analytics_date DATE DEFAULT CURRENT_DATE,
    
    -- Parcel counts
    total_parcels INTEGER DEFAULT 0,
    residential_parcels INTEGER DEFAULT 0,
    commercial_parcels INTEGER DEFAULT 0,
    vacant_parcels INTEGER DEFAULT 0,
    
    -- Building statistics
    total_buildings INTEGER DEFAULT 0,
    occupied_buildings INTEGER DEFAULT 0,
    vacant_buildings INTEGER DEFAULT 0,
    condemned_buildings INTEGER DEFAULT 0,
    
    -- Financial metrics
    avg_assessed_value NUMERIC(12, 2),
    median_assessed_value NUMERIC(12, 2),
    total_assessed_value NUMERIC(15, 2),
    avg_taxable_value NUMERIC(12, 2),
    median_taxable_value NUMERIC(12, 2),
    
    -- Sales activity
    recent_sales_count INTEGER DEFAULT 0, -- Last 2 years
    recent_sales_avg_price NUMERIC(12, 2),
    last_sale_date DATE,
    
    -- Tax status
    tax_delinquent_count INTEGER DEFAULT 0,
    tax_delinquent_percentage NUMERIC(5, 2),
    
    -- Property characteristics
    avg_lot_size_sqft NUMERIC(10, 2),
    avg_building_size_sqft NUMERIC(10, 2),
    
    -- Additional metrics
    owner_occupied_count INTEGER DEFAULT 0,
    investor_owned_count INTEGER DEFAULT 0,
    city_owned_count INTEGER DEFAULT 0,
    land_bank_owned_count INTEGER DEFAULT 0,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(block_id, analytics_date)
);

CREATE INDEX idx_block_analytics_block_id ON block_analytics (block_id);
CREATE INDEX idx_block_analytics_date ON block_analytics (analytics_date);
CREATE INDEX idx_block_analytics_vacant_rate ON block_analytics ((vacant_parcels::FLOAT / NULLIF(total_parcels, 0)));

-- Analytics runs: Track processing history
CREATE TABLE IF NOT EXISTS analytics_runs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    run_type VARCHAR(50) NOT NULL, -- 'full' or 'incremental'
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'running', -- running, completed, failed
    parcels_processed INTEGER DEFAULT 0,
    blocks_processed INTEGER DEFAULT 0,
    errors_count INTEGER DEFAULT 0,
    error_details JSONB,
    metadata JSONB, -- Additional run information
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_analytics_runs_status ON analytics_runs (status);
CREATE INDEX idx_analytics_runs_started ON analytics_runs (started_at);

-- Views for easier querying

-- Current block analytics (latest date for each block)
CREATE OR REPLACE VIEW current_block_analytics AS
SELECT DISTINCT ON (block_id) *
FROM block_analytics
ORDER BY block_id, analytics_date DESC;

-- Block summary view
CREATE OR REPLACE VIEW block_summary AS
SELECT 
    b.id,
    b.block_id,
    b.street_name,
    b.from_cross_street,
    b.to_cross_street,
    ba.total_parcels,
    ba.vacant_parcels,
    ba.vacant_buildings,
    ROUND((ba.vacant_parcels::FLOAT / NULLIF(ba.total_parcels, 0) * 100), 2) as vacancy_rate,
    ba.avg_assessed_value,
    ba.recent_sales_count,
    ba.tax_delinquent_percentage,
    ba.analytics_date
FROM blocks b
LEFT JOIN current_block_analytics ba ON b.id = ba.block_id;

-- High activity blocks (many recent sales)
CREATE OR REPLACE VIEW high_activity_blocks AS
SELECT *
FROM block_summary
WHERE recent_sales_count > 5
ORDER BY recent_sales_count DESC;

-- Distressed blocks (high vacancy and tax delinquency)
CREATE OR REPLACE VIEW distressed_blocks AS
SELECT *
FROM block_summary
WHERE vacancy_rate > 30 
   OR tax_delinquent_percentage > 25
ORDER BY vacancy_rate DESC;

-- Functions

-- Update timestamps automatically
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_blocks_updated_at BEFORE UPDATE ON blocks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_block_analytics_updated_at BEFORE UPDATE ON block_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();