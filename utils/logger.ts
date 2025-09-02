type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export class Logger {
  private scope: string;
  private context?: Record<string, any>;

  constructor(scope?: string) {
    this.scope = scope || 'Unknown';
  }

  private formatMessage(level: LogLevel, message: string, meta?: any): string {
    const timestamp = new Date().toISOString();
    const metaString = meta ? ` | meta: ${JSON.stringify(meta)}` : '';
    const context = this.context ? ` | context: ${JSON.stringify(this.context)}` : '';
    return `[${timestamp}][${level.toUpperCase()}][scope: ${this.scope}] ${message}${metaString}${context}`;
  }

  withContext(key: string, value: any) {
    if (!this.context) {
      this.context = {};
    }
    this.context[key] = value;
  }

  info(message: string, meta?: any) {
    console.info(this.formatMessage('info', message, meta));
  }

  warn(message: string, meta?: any) {
    console.warn(this.formatMessage('warn', message, meta));
  }

  error(message: string, meta?: any) {
    console.error(this.formatMessage('error', message, meta));
  }

  debug(message: string, meta?: any) {
    console.debug(this.formatMessage('debug', message, meta));
  }

  getRequestId() {
    return this.scope;
  }
}