const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Token bucket: `rps` tokens per second, at most `capacity` stored. Waiters are served FIFO.
 */
export class TokenBucket {
  private readonly rps: number;
  private readonly capacity: number;
  private readonly now: () => number;
  private tokens: number;
  private last: number;
  private queue: Promise<void> = Promise.resolve();

  constructor(rps: number, capacity = 1, now: () => number = () => performance.now()) {
    if (!(rps > 0)) throw new Error(`TokenBucket: rps must be > 0, got ${rps}`);
    this.rps = rps;
    this.capacity = Math.max(1, capacity);
    this.now = now;
    this.tokens = this.capacity;
    this.last = now();
  }

  take(): Promise<void> {
    const turn = this.queue.then(() => this.takeOne());
    this.queue = turn;
    return turn;
  }

  private refill(): void {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.rps);
    this.last = t;
  }

  private async takeOne(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      await sleep(Math.ceil(((1 - this.tokens) / this.rps) * 1000));
      this.refill();
    }
    this.tokens -= 1;
  }
}

/** Counting semaphore limiting in-flight work. */
export class Semaphore {
  private available: number;
  private readonly waiters: (() => void)[] = [];

  constructor(permits: number) {
    this.available = Math.max(1, permits);
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.available++;
  }
}
