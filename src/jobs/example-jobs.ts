/**
 * Example job definitions demonstrating various use cases
 */

import { JobContext, JobPriority } from '../types/job.types.js';
import { jobRegistry } from '../models/job-registry.js';
import { NonRetryableJobError, JobError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Example: Simple data cleanup job
 * Runs daily at 2 AM to clean up old records
 */
async function dataCleanupHandler(context: JobContext): Promise<{ deleted: number }> {
  context.log('Starting data cleanup', { jobId: context.jobId });

  // Simulate cleanup operation
  const deleted = Math.floor(Math.random() * 100);
  await new Promise((resolve) => setTimeout(resolve, 1000));

  context.log(`Data cleanup completed: ${deleted} records deleted`);
  return { deleted };
}

/**
 * Example: Email batch job with progress tracking
 * Sends emails in batches with progress updates
 */
async function emailBatchHandler(context: JobContext): Promise<{ sent: number; failed: number }> {
  const emails = context.data.emails as string[] || ['user1@example.com', 'user2@example.com'];
  const total = emails.length;
  let sent = 0;
  let failed = 0;

  context.log(`Starting email batch: ${total} emails`);

  for (let i = 0; i < emails.length; i++) {
    try {
      // Simulate email sending
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Simulate occasional failures
      if (Math.random() < 0.1) {
        throw new Error('Email service temporarily unavailable');
      }

      sent++;
      context.log(`Email sent to ${emails[i]}`);
    } catch (error) {
      failed++;
      context.log(`Failed to send email to ${emails[i]}`, { error });
    }

    // Update progress
    const progress = Math.round(((i + 1) / total) * 100);
    await context.progress(progress);
  }

  return { sent, failed };
}

/**
 * Example: API polling job
 * Polls an external API and processes results
 */
async function apiPollingHandler(context: JobContext): Promise<{ fetched: number; processed: number }> {
  const apiUrl = context.data.apiUrl as string || 'https://api.example.com/data';
  
  context.log('Polling external API', { url: apiUrl });

  try {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Simulate occasional API failures
    if (Math.random() < 0.2) {
      throw new JobError('API request failed', context.jobId, context.jobName, true);
    }

    const fetched = Math.floor(Math.random() * 50) + 10;
    const processed = fetched;

    context.log(`API polling completed: ${fetched} items fetched and processed`);
    return { fetched, processed };
  } catch (error) {
    context.log('API polling failed', { error });
    throw error;
  }
}

/**
 * Example: Report generation job
 * Generates a report (long-running task)
 */
async function reportGenerationHandler(context: JobContext): Promise<{ reportId: string; size: number }> {
  const reportType = context.data.reportType as string || 'daily';
  
  context.log(`Generating ${reportType} report`);

  // Simulate report generation (long-running)
  const steps = 10;
  for (let i = 0; i < steps; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await context.progress(Math.round(((i + 1) / steps) * 100));
  }

  const reportId = `report-${Date.now()}`;
  const size = Math.floor(Math.random() * 1000000) + 100000;

  context.log(`Report generated: ${reportId} (${size} bytes)`);
  return { reportId, size };
}

/**
 * Example: Job that fails on validation (non-retryable)
 */
async function validationJobHandler(context: JobContext): Promise<void> {
  const userId = context.data.userId as string | undefined;

  if (!userId) {
    throw new NonRetryableJobError(
      'User ID is required',
      context.jobId,
      context.jobName
    );
  }

  context.log('Validation passed', { userId });
}

/**
 * Example: Job with timeout
 * Demonstrates timeout handling
 */
async function timeoutJobHandler(context: JobContext): Promise<string> {
  const duration = (context.data.duration as number) || 5000;
  
  context.log(`Running job for ${duration}ms`);
  
  await new Promise((resolve) => setTimeout(resolve, duration));
  
  return 'Job completed successfully';
}

/**
 * Register all example jobs
 */
export function registerExampleJobs(): void {
  // Data cleanup - daily at 2 AM
  jobRegistry.register({
    name: 'data-cleanup',
    handler: dataCleanupHandler,
    cronPattern: '0 2 * * *', // Daily at 2 AM
    priority: JobPriority.MEDIUM,
    maxRetries: 2,
    retryDelay: 5000,
    concurrency: 1,
  });

  // Email batch - runs on demand
  jobRegistry.register({
    name: 'email-batch',
    handler: emailBatchHandler,
    priority: JobPriority.HIGH,
    maxRetries: 3,
    retryDelay: 2000,
    concurrency: 2,
  });

  // API polling - every 5 minutes
  jobRegistry.register({
    name: 'api-polling',
    handler: apiPollingHandler,
    cronPattern: '*/5 * * * *', // Every 5 minutes
    priority: JobPriority.MEDIUM,
    maxRetries: 5,
    retryDelay: 1000,
    concurrency: 1,
  });

  // Report generation - daily at 3 AM
  jobRegistry.register({
    name: 'report-generation',
    handler: reportGenerationHandler,
    cronPattern: '0 3 * * *', // Daily at 3 AM
    priority: JobPriority.LOW,
    maxRetries: 1,
    retryDelay: 10000,
    timeout: 60000, // 1 minute timeout
    concurrency: 1,
  });

  // Validation job - on demand
  jobRegistry.register({
    name: 'validation-job',
    handler: validationJobHandler,
    priority: JobPriority.HIGH,
    maxRetries: 0, // No retries for validation errors
  });

  // Timeout job - on demand
  jobRegistry.register({
    name: 'timeout-job',
    handler: timeoutJobHandler,
    priority: JobPriority.MEDIUM,
    maxRetries: 1,
    timeout: 3000, // 3 second timeout
  });

  logger.info('Example jobs registered');
}
