import { redis } from '../configs/db';
import { Logger } from './logger';

const logger = new Logger('DistributedLock');

export class DistributedLock {
  private lockKey: string;
  private timeout: number;
  private acquired: boolean = false;

  constructor(lockKey: string, timeout: number = 30) {
    this.lockKey = `lock:${lockKey}`;
    this.timeout = timeout;
  }

  async acquire(): Promise<boolean> {
    try {
      const result = await redis.set(
        this.lockKey,
        'locked',
        'EX',
        this.timeout,
        'NX'
      );
      
      this.acquired = result === 'OK';
      
      if (!this.acquired) {
        logger.warn(`Failed to acquire lock: ${this.lockKey}`);
      }
      
      return this.acquired;
    } catch (error) {
      logger.error(`Error acquiring lock ${this.lockKey}:`, error);
      return false;
    }
  }

  async release(): Promise<void> {
    if (this.acquired) {
      try {
        await redis.del(this.lockKey);
        this.acquired = false;
      } catch (error) {
        logger.error(`Error releasing lock ${this.lockKey}:`, error);
      }
    }
  }

  async withLock<T>(callback: () => Promise<T>): Promise<T> {
    const acquired = await this.acquire();
    if (!acquired) {
      throw new Error(`Could not acquire lock for ${this.lockKey}`);
    }

    try {
      return await callback();
    } finally {
      await this.release();
    }
  }
}
