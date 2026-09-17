const OCR_JOB_CONCURRENCY = Math.max(1, Number(process.env.OCR_JOB_CONCURRENCY || 1));
const OCR_JOB_TIMEOUT_MS = Math.max(60_000, Number(process.env.OCR_JOB_TIMEOUT_MS || 8 * 60_000));

class InvoiceOcrJobService {
  constructor() {
    this.activeCount = 0;
    this.queue = [];
    this.jobs = new Map();
  }

  enqueue({ jobId, task, onStart, onSuccess, onFailure }) {
    const queuedAt = Date.now();
    const job = {
      jobId,
      task,
      onStart,
      onSuccess,
      onFailure,
      queuedAt,
    };

    this.queue.push(job);
    const queuePosition = this.queue.length;
    this.jobs.set(jobId, {
      jobId,
      status: 'QUEUED',
      stage: 'UPLOAD',
      progress: 5,
      queuedAt: new Date(queuedAt).toISOString(),
      startedAt: null,
      completedAt: null,
      errorMessage: null,
    });
    setImmediate(() => this.drain());

    return {
      jobId,
      queuePosition,
      activeCount: this.activeCount,
      queuedAt: new Date(queuedAt).toISOString(),
      concurrency: OCR_JOB_CONCURRENCY,
      timeoutMs: OCR_JOB_TIMEOUT_MS,
    };
  }

  updateJob(jobId, patch = {}) {
    if (!jobId) return null;
    const current = this.jobs.get(jobId) || { jobId };
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.jobs.set(jobId, next);
    return next;
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  drain() {
    while (this.activeCount < OCR_JOB_CONCURRENCY && this.queue.length > 0) {
      const job = this.queue.shift();
      this.run(job);
    }
  }

  async run(job) {
    this.activeCount += 1;
    let timeoutId = null;
    let timedOut = false;

    try {
      this.updateJob(job.jobId, {
        status: 'PROCESSING',
        stage: 'OCR_EXTRACTION',
        progress: 15,
        startedAt: new Date().toISOString(),
      });
      await job.onStart?.();
      timeoutId = setTimeout(() => {
        timedOut = true;
        this.updateJob(job.jobId, {
          status: 'FAILED',
          stage: 'FAILED',
          progress: 100,
          completedAt: new Date().toISOString(),
          errorMessage: 'OCR processing took too long. Please upload a clearer or smaller invoice document.',
        });
        job.onFailure?.(new Error(`OCR job timed out after ${Math.round(OCR_JOB_TIMEOUT_MS / 1000)} seconds.`))
          .catch((error) => {
            console.error('[Invoice OCR] Failed to persist timeout state:', {
              jobId: job.jobId,
              message: error?.message,
            });
          });
      }, OCR_JOB_TIMEOUT_MS);

      const result = await job.task();
      if (!timedOut) {
        this.updateJob(job.jobId, {
          status: result?.success === false ? 'FAILED' : 'COMPLETED',
          stage: 'COMPLETED',
          progress: 100,
          completedAt: new Date().toISOString(),
          errorMessage: result?.success === false ? result?.message || 'OCR processing failed.' : null,
        });
        await job.onSuccess?.(result);
      }
    } catch (error) {
      if (!timedOut) {
        this.updateJob(job.jobId, {
          status: 'FAILED',
          stage: 'FAILED',
          progress: 100,
          completedAt: new Date().toISOString(),
          errorMessage: error?.message || 'OCR processing failed.',
        });
        await job.onFailure?.(error);
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      this.activeCount = Math.max(0, this.activeCount - 1);
      setImmediate(() => this.drain());
    }
  }
}

export default new InvoiceOcrJobService();
