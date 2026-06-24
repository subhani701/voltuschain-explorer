-- Create stats database
CREATE DATABASE blockscout_stats;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE blockscout TO blockscout;
GRANT ALL PRIVILEGES ON DATABASE blockscout_stats TO blockscout;