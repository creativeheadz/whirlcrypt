/**
 * Build a valid node-cron expression from a cleanup interval in minutes.
 *
 * cron minute/hour fields only accept 0-59 / 0-23, so arbitrary minute
 * counts cannot be expressed exactly. Exact schedules win; anything else
 * falls back to hourly (cleanup happening more often than configured is
 * the safe direction).
 */
export function buildCleanupCron(minutes: number): string {
  const m = Math.floor(Number(minutes));
  if (!Number.isFinite(m) || m <= 0) {
    return '0 * * * *';
  }
  if (m < 60 && 60 % m === 0) {
    return `*/${m} * * * *`;
  }
  if (m % 60 === 0 && m / 60 <= 23) {
    return `0 */${m / 60} * * *`;
  }
  return '0 * * * *';
}
