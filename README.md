# Backend Cron Job Scheduler – Background Jobs with Retries & Persistence

A production-ready Node.js + TypeScript backend project that implements a robust cron job scheduler and background job processor, suitable for enterprise use cases like scheduled reports, data cleanup, email batches, or API polling. Built with **BullMQ** and **Redis** for distributed reliability, featuring automatic retries, concurrency control, persistence, and comprehensive monitoring.

## 🚀 Features

- **Cron-based Scheduling**: Schedule recurring jobs using standard cron syntax (e.g., `0 2 * * *` for daily at 2 AM)
- **One-time & Delayed Jobs**: Queue jobs to run immediately or after a specified delay
- **Automatic Retries**: Configurable retry logic with exponential backoff, max attempts, and error handling
- **Persistence**: All job definitions, schedules, and state are stored in Redis, ensuring jobs survive restarts
- **Concurrency Control**: Limit parallel executions per job type or globally
- **Priority Support**: Assign priorities (LOW, MEDIUM, HIGH, CRITICAL) to jobs for execution order
- **Job Lifecycle Events**: Track jobs through their lifecycle (created, started, completed, failed, retry)
- **Graceful Shutdown**: Running jobs are allowed to finish or cancelled cleanly on process exit
- **Monitoring Dashboard**: Built-in Bull Board dashboard for viewing active/scheduled/failed jobs
- **Structured Logging**: Comprehensive logging for job execution with success/fail/retry details
- **Health Endpoint**: RESTful API endpoint for monitoring scheduler status and metrics
- **Type Safety**: Full TypeScript support with strict type checking
- **Distributed Locking**: Prevents duplicate executions when multiple instances run (via Redis)

## 🛠 Tech Stack & Why

### Core Technologies

- **Node.js 20+** with **TypeScript (ESM)**: Modern JavaScript runtime with type safety
- **BullMQ**: Battle-tested job queue library built on Redis
- **Redis**: In-memory data store for job persistence and distributed locking
- **Express**: Lightweight web framework for API endpoints
- **Pino**: High-performance structured logging
- **Zod**: Schema validation for job definitions and payloads
- **Jest**: Testing framework with comprehensive test coverage

### Why BullMQ + Redis?

**BullMQ** was chosen over alternatives (Agenda, Bree, custom solutions) because:

1. **Production-Ready**: Battle-tested in high-traffic production environments
2. **Feature-Rich**: Built-in support for retries, priorities, concurrency, repeatable jobs, and more
3. **Distributed**: Redis-based architecture enables horizontal scaling across multiple workers
4. **TypeScript Support**: Excellent TypeScript definitions and type safety
5. **Active Development**: Regularly updated with new features and bug fixes
6. **Performance**: Optimized for high-throughput job processing
7. **Reliability**: Jobs persist in Redis, surviving application restarts
8. **Monitoring**: Integrates seamlessly with Bull Board for job monitoring

**Redis** provides:
- Fast in-memory storage for job queues
- Distributed locking to prevent duplicate executions
- Pub/sub capabilities for real-time job events
- Persistence options (RDB/AOF) for durability
- Horizontal scaling support

## 📋 Prerequisites

- **Node.js** 20.0.0 or higher
- **Redis** 6.0 or higher (local instance or cloud service)
- **npm** or **yarn** package manager

### Redis Setup

**Local Development:**
```bash
# Using Docker
docker run -d -p 6379:6379 redis:7-alpine

# Or install locally
# macOS: brew install redis && redis-server
# Ubuntu: sudo apt-get install redis-server && redis-server
```

**Production:**
- Use a managed Redis service (AWS ElastiCache, Redis Cloud, Upstash, etc.)
- Configure persistence (RDB snapshots or AOF) for durability
- Set up replication for high availability

## 🚀 Quick Start

### 1. Clone and Install

```bash
git clone <repository-url>
cd Backend-Cron-Job-Scheduler
npm install
```

### 2. Configure Environment

Copy the example environment file and configure your Redis connection:

```bash
cp .env.example .env
```

Edit `.env` with your Redis connection details:

```env
REDIS_URL=redis://localhost:6379
# OR
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

NODE_ENV=development
PORT=3000
LOG_LEVEL=info
JOB_CONCURRENCY=5
MAX_RETRIES=3
```

### 3. Start the Application

**Development mode (with hot reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm run build
npm start
```

The scheduler will start on `http://localhost:3000` with:
- **Health endpoint**: `http://localhost:3000/health`
- **Dashboard**: `http://localhost:3000/admin/queues` (if enabled)
- **API**: `http://localhost:3000/api/*`

## 📖 Usage Guide

### Defining Jobs

Jobs are defined programmatically using the job registry. Each job requires a name and a handler function:

```typescript
import { jobRegistry } from './models/job-registry.js';
import { JobContext, JobPriority } from './types/job.types.js';

// Simple job handler
async function myJobHandler(context: JobContext): Promise<{ result: string }> {
  context.log('Starting job execution', { jobId: context.jobId });
  
  // Your job logic here
  const result = await performTask(context.data);
  
  // Update progress (0-100)
  await context.progress(100);
  
  return { result: 'success' };
}

// Register the job
jobRegistry.register({
  name: 'my-job',
  handler: myJobHandler,
  priority: JobPriority.HIGH,
  maxRetries: 3,
  retryDelay: 2000,
  concurrency: 2, // Allow 2 parallel executions
  timeout: 30000, // 30 second timeout
});
```

### Scheduling Recurring Jobs (Cron)

Schedule a job to run on a recurring schedule using cron syntax:

```typescript
import { scheduler } from './scheduler/scheduler.js';

// Schedule daily at 2 AM
await scheduler.scheduleCron('my-job', '0 2 * * *');

// Schedule every 5 minutes
await scheduler.scheduleCron('my-job', '*/5 * * * *');

// Schedule with custom data and priority
await scheduler.scheduleCron(
  'my-job',
  '0 3 * * *', // Daily at 3 AM
  { reportType: 'daily' },
  { priority: JobPriority.HIGH }
);
```

**Common Cron Patterns:**
- `*/5 * * * *` - Every 5 minutes
- `0 * * * *` - Every hour
- `0 2 * * *` - Daily at 2 AM
- `0 0 * * 0` - Weekly on Sunday at midnight
- `0 0 1 * *` - Monthly on the 1st at midnight

### Scheduling One-time Jobs

Schedule a job to run once, optionally with a delay:

```typescript
// Run immediately
await scheduler.scheduleOnce('my-job', { userId: 123 });

// Run after 5 minutes
await scheduler.scheduleOnce('my-job', { userId: 123 }, { delay: 300000 });

// Run with high priority
await scheduler.scheduleOnce('my-job', { userId: 123 }, { 
  priority: JobPriority.CRITICAL 
});
```

### Job Context

The handler receives a `JobContext` object with useful utilities:

```typescript
interface JobContext {
  jobId: string;              // Unique job ID
  jobName: string;            // Job name
  attempt: number;            // Current attempt (1-based)
  maxAttempts: number;       // Maximum retry attempts
  data: Record<string, unknown>; // Job payload
  progress: (progress: number) => Promise<void>; // Update progress (0-100)
  log: (message: string, meta?: Record<string, unknown>) => void; // Structured logging
}
```

### Error Handling & Retries

Jobs automatically retry on failure. Control retry behavior:

```typescript
import { JobError, NonRetryableJobError } from './utils/errors.js';

async function myJobHandler(context: JobContext): Promise<void> {
  try {
    await performTask();
  } catch (error) {
    // Retryable error - will be retried automatically
    if (error instanceof NetworkError) {
      throw new JobError('Network error, will retry', context.jobId, context.jobName);
    }
    
    // Non-retryable error - stops retries immediately
    if (error instanceof ValidationError) {
      throw new NonRetryableJobError(
        'Invalid input, cannot retry',
        context.jobId,
        context.jobName
      );
    }
    
    throw error; // Will be retried based on job configuration
  }
}
```

### Job Configuration Options

```typescript
jobRegistry.register({
  name: 'configured-job',
  handler: myHandler,
  
  // Scheduling
  cronPattern: '0 2 * * *', // Optional: for cron jobs
  
  // Priority (higher = executed first)
  priority: JobPriority.HIGH, // LOW, MEDIUM, HIGH, CRITICAL
  
  // Retry configuration
  maxRetries: 5,              // Maximum retry attempts
  retryDelay: 2000,           // Base delay in milliseconds
  retryDelayType: 'exponential', // 'fixed', 'linear', 'exponential'
  
  // Concurrency
  concurrency: 3,             // Max parallel executions for this job type
  
  // Timeout
  timeout: 60000,             // Job timeout in milliseconds
  
  // Cleanup
  removeOnComplete: true,     // Remove completed jobs from queue
  removeOnFail: false,        // Keep failed jobs for inspection
  
  // Default data
  data: { defaultKey: 'value' },
});
```

## 🔌 API Endpoints

### Health Check

```bash
GET /health
```

Returns scheduler status, active jobs count, and system metrics:

```json
{
  "status": "healthy",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "uptime": 3600,
  "scheduler": {
    "queues": 3,
    "workers": 3,
    "activeJobs": 2,
    "waitingJobs": 5,
    "completedJobs": 150,
    "failedJobs": 3
  },
  "registeredJobs": ["data-cleanup", "email-batch", "api-polling"],
  "redis": {
    "status": "connected"
  }
}
```

### Get All Jobs

```bash
GET /api/jobs?jobName=my-job&status=active
```

Query parameters:
- `jobName` (optional): Filter by job name
- `status` (optional): Filter by status (scheduled, queued, active, completed, failed, delayed, cancelled)

### Get Job Status

```bash
GET /api/jobs/:jobName/:jobId
```

Returns detailed job information including status, attempts, timestamps, and error details.

### Cancel Job

```bash
DELETE /api/jobs/:jobName/:jobId
```

Cancels a scheduled or active job.

### Get Statistics

```bash
GET /api/stats
```

Returns aggregate statistics across all queues.

### Get Registered Jobs

```bash
GET /api/jobs/registered
```

Returns list of all registered job definitions.

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `REDIS_HOST` | Redis host (if not using URL) | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `REDIS_PASSWORD` | Redis password | (empty) |
| `REDIS_DB` | Redis database number | `0` |
| `NODE_ENV` | Environment (development/production) | `development` |
| `PORT` | HTTP server port | `3000` |
| `LOG_LEVEL` | Logging level (trace/debug/info/warn/error) | `info` |
| `JOB_CONCURRENCY` | Default max parallel jobs | `5` |
| `MAX_RETRIES` | Default max retry attempts | `3` |
| `RETRY_DELAY_MS` | Default retry delay (ms) | `1000` |
| `RETRY_DELAY_TYPE` | Retry strategy (fixed/linear/exponential) | `exponential` |
| `ENABLE_DASHBOARD` | Enable Bull Board dashboard | `true` |
| `DASHBOARD_PATH` | Dashboard URL path | `/admin/queues` |
| `GRACEFUL_SHUTDOWN_TIMEOUT_MS` | Shutdown timeout (ms) | `30000` |
| `HEALTH_CHECK_ENABLED` | Enable health endpoint | `true` |

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

Tests cover:
- Job registration and validation
- Scheduling (cron and one-time)
- Job execution and retry logic
- Error handling
- Job status and cancellation
- Retry delay calculations

**Note**: Tests require a Redis instance. Use a separate Redis database or Docker container for testing.

## 🏭 Production Deployment

### Scaling Multiple Workers

The scheduler is designed for horizontal scaling. Run multiple instances:

```bash
# Worker 1
NODE_ENV=production PORT=3000 npm start

# Worker 2
NODE_ENV=production PORT=3001 npm start

# Worker 3
NODE_ENV=production PORT=3002 npm start
```

All workers connect to the same Redis instance and automatically share the job queue. Redis handles distributed locking to prevent duplicate executions.

### Monitoring Failed Jobs

1. **Dashboard**: Access Bull Board at `/admin/queues` to view failed jobs
2. **API**: Query `/api/jobs?status=failed` for programmatic access
3. **Logs**: Structured logs include all job failures with error details
4. **Alerts**: Set up monitoring on the `/health` endpoint to detect high failure rates

### Redis Tuning

For production Redis:

```redis
# Enable persistence (choose one)
save 900 1        # RDB: Save if at least 1 key changed in 900 seconds
appendonly yes    # AOF: Append-only file for durability

# Memory management
maxmemory 2gb
maxmemory-policy allkeys-lru

# Connection pooling
maxclients 10000
```

### Deployment Platforms

**Railway:**
```bash
railway up
# Set REDIS_URL environment variable
```

**Fly.io:**
```bash
fly launch
# Add Redis: fly redis create
# Set REDIS_URL in secrets
```

**Docker:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

**Kubernetes:**
- Deploy as a StatefulSet or Deployment
- Use Redis as a separate service
- Configure health checks using `/health` endpoint
- Set resource limits based on job concurrency

### Best Practices

1. **Job Idempotency**: Design jobs to be idempotent (safe to run multiple times)
2. **Error Handling**: Use `NonRetryableJobError` for validation errors that won't succeed on retry
3. **Timeouts**: Set appropriate timeouts for long-running jobs
4. **Monitoring**: Monitor job failure rates and execution times
5. **Logging**: Use structured logging for better observability
6. **Resource Limits**: Set concurrency limits based on system resources
7. **Graceful Shutdown**: Allow sufficient time for jobs to complete during shutdown

## 📚 Additional Resources

- [BullMQ Documentation](https://docs.bullmq.io/)
- [Redis Documentation](https://redis.io/docs/)
- [Cron Expression Guide](https://crontab.guru/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

## 🤝 Contributing

- telegram: https://t.me/topBtek
- twitter:  https://x.com/topBtek
