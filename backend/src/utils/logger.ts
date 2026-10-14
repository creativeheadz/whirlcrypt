/**
 * Minimal structured logging for the server: every line carries an ISO
 * timestamp, a level, and a scope (`ISO LEVEL [scope] message ...`), warn
 * and error go to stderr, and LOG_LEVEL (debug/info/warn/error, default
 * info) gates verbosity at runtime. Console-shaped (...args) so call sites
 * read the same as before. CLI tools keep raw console output: that text is
 * human-facing command output, not logs.
 */
export interface Logger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Level[] = ['debug', 'info', 'warn', 'error'];

function minLevel(): number {
  const raw = (process.env.LOG_LEVEL || 'info').toLowerCase();
  const idx = ORDER.indexOf(raw as Level);
  return idx === -1 ? ORDER.indexOf('info') : idx;
}

function format(arg: unknown): string {
  if (typeof arg === 'string') {
    return arg;
  }
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`;
  }
  try {
    const json = JSON.stringify(arg);
    return json === undefined ? String(arg) : json;
  } catch {
    return String(arg);
  }
}

export function createLogger(scope: string): Logger {
  const emit = (level: Level, args: unknown[]): void => {
    if (ORDER.indexOf(level) < minLevel()) {
      return;
    }
    const line = `${new Date().toISOString()} ${level.toUpperCase()} [${scope}] ${args.map(format).join(' ')}\n`;
    if (level === 'warn' || level === 'error') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  };

  return {
    debug: (...args: unknown[]) => emit('debug', args),
    info: (...args: unknown[]) => emit('info', args),
    warn: (...args: unknown[]) => emit('warn', args),
    error: (...args: unknown[]) => emit('error', args),
  };
}
