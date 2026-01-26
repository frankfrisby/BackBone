# Task Automation Skill

Automate repetitive tasks and workflows.

## Dependencies
```bash
npm install node-cron bottleneck p-queue
```

## Scheduled Tasks

```javascript
import cron from 'node-cron';

class TaskScheduler {
  constructor() {
    this.tasks = new Map();
  }

  // Schedule task with cron expression
  schedule(name, cronExpression, callback) {
    const task = cron.schedule(cronExpression, async () => {
      console.log(`Running: ${name}`);
      try {
        await callback();
      } catch (error) {
        console.error(`Error in ${name}:`, error);
      }
    });

    this.tasks.set(name, task);
    return task;
  }

  // Common schedules
  everyMinute(name, cb) { return this.schedule(name, '* * * * *', cb); }
  everyHour(name, cb) { return this.schedule(name, '0 * * * *', cb); }
  everyDay(name, cb, hour = 0) { return this.schedule(name, `0 ${hour} * * *`, cb); }
  everyWeek(name, cb, day = 0, hour = 0) { return this.schedule(name, `0 ${hour} * * ${day}`, cb); }
  everyMonth(name, cb, day = 1, hour = 0) { return this.schedule(name, `0 ${hour} ${day} * *`, cb); }

  stop(name) {
    const task = this.tasks.get(name);
    if (task) {
      task.stop();
      this.tasks.delete(name);
    }
  }

  stopAll() {
    this.tasks.forEach(task => task.stop());
    this.tasks.clear();
  }

  list() {
    return Array.from(this.tasks.keys());
  }
}
```

## Rate Limiting

```javascript
import Bottleneck from 'bottleneck';

// Rate limiter
function createRateLimiter(options = {}) {
  return new Bottleneck({
    maxConcurrent: options.maxConcurrent || 1,
    minTime: options.minTime || 1000,
    reservoir: options.reservoir,
    reservoirRefreshAmount: options.refreshAmount,
    reservoirRefreshInterval: options.refreshInterval
  });
}

// Example: 10 requests per second
const apiLimiter = createRateLimiter({ maxConcurrent: 10, minTime: 100 });

async function rateLimitedFetch(url) {
  return await apiLimiter.schedule(() => fetch(url));
}
```

## Task Queue

```javascript
import PQueue from 'p-queue';

class TaskQueue {
  constructor(options = {}) {
    this.queue = new PQueue({
      concurrency: options.concurrency || 1,
      timeout: options.timeout,
      throwOnTimeout: options.throwOnTimeout || false
    });
    this.results = [];
  }

  add(task, priority = 0) {
    return this.queue.add(task, { priority });
  }

  addAll(tasks) {
    return this.queue.addAll(tasks);
  }

  async run(tasks) {
    const results = await Promise.all(tasks.map(t => this.add(t)));
    return results;
  }

  pause() { this.queue.pause(); }
  resume() { this.queue.start(); }
  clear() { this.queue.clear(); }

  get pending() { return this.queue.pending; }
  get size() { return this.queue.size; }

  onIdle() { return this.queue.onIdle(); }
  onEmpty() { return this.queue.onEmpty(); }
}
```

## Workflow Builder

```javascript
class Workflow {
  constructor(name) {
    this.name = name;
    this.steps = [];
    this.context = {};
  }

  addStep(name, fn, options = {}) {
    this.steps.push({
      name,
      fn,
      retries: options.retries || 0,
      retryDelay: options.retryDelay || 1000,
      condition: options.condition
    });
    return this;
  }

  async runStep(step) {
    let attempts = 0;
    const maxAttempts = step.retries + 1;

    while (attempts < maxAttempts) {
      try {
        return await step.fn(this.context);
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
        await new Promise(r => setTimeout(r, step.retryDelay));
      }
    }
  }

  async run(initialContext = {}) {
    this.context = { ...initialContext };
    const results = [];

    for (const step of this.steps) {
      // Check condition
      if (step.condition && !step.condition(this.context)) {
        results.push({ step: step.name, skipped: true });
        continue;
      }

      console.log(`Running step: ${step.name}`);
      try {
        const result = await this.runStep(step);
        this.context[step.name] = result;
        results.push({ step: step.name, success: true, result });
      } catch (error) {
        results.push({ step: step.name, success: false, error: error.message });
        throw error;
      }
    }

    return { context: this.context, results };
  }
}
```

## File Watcher Automation

```javascript
import fs from 'fs';
import path from 'path';

class FileWatcher {
  constructor() {
    this.watchers = new Map();
  }

  watch(directory, pattern, callback, options = {}) {
    const watcher = fs.watch(directory, { recursive: options.recursive }, (event, filename) => {
      if (!filename) return;

      const regex = new RegExp(pattern);
      if (regex.test(filename)) {
        callback({
          event,
          filename,
          filepath: path.join(directory, filename),
          timestamp: new Date()
        });
      }
    });

    this.watchers.set(directory, watcher);
    return watcher;
  }

  unwatch(directory) {
    const watcher = this.watchers.get(directory);
    if (watcher) {
      watcher.close();
      this.watchers.delete(directory);
    }
  }

  unwatchAll() {
    this.watchers.forEach(w => w.close());
    this.watchers.clear();
  }
}
```

## Retry Helper

```javascript
async function withRetry(fn, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const delay = options.delay || 1000;
  const backoff = options.backoff || 2;

  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, delay * Math.pow(backoff, i)));
      }
    }
  }
  throw lastError;
}

// Polling helper
async function pollUntil(fn, condition, options = {}) {
  const interval = options.interval || 1000;
  const timeout = options.timeout || 30000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const result = await fn();
    if (condition(result)) return result;
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error('Polling timeout');
}
```

## Usage Examples

```javascript
// Scheduled tasks
const scheduler = new TaskScheduler();
scheduler.everyHour('backup', async () => {
  await createBackup();
});
scheduler.everyDay('report', async () => {
  await generateDailyReport();
}, 9); // 9 AM

// Task queue
const queue = new TaskQueue({ concurrency: 3 });
await queue.run([
  () => processFile('a.txt'),
  () => processFile('b.txt'),
  () => processFile('c.txt')
]);

// Workflow
const workflow = new Workflow('data-pipeline')
  .addStep('fetch', async () => await fetchData())
  .addStep('transform', async (ctx) => transform(ctx.fetch), { retries: 2 })
  .addStep('save', async (ctx) => save(ctx.transform));

await workflow.run();

// File watcher
const watcher = new FileWatcher();
watcher.watch('./uploads', '\\.csv$', async (event) => {
  console.log(`New CSV: ${event.filename}`);
  await processCSV(event.filepath);
});

// Retry
const data = await withRetry(() => unreliableAPI(), { maxRetries: 5 });

// Poll until ready
const status = await pollUntil(
  () => checkJobStatus(jobId),
  (s) => s === 'completed',
  { interval: 2000, timeout: 60000 }
);
```
