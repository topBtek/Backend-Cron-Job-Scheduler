/**
 * Jest test setup
 */

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.PORT = '0'; // Use random port for tests
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests
