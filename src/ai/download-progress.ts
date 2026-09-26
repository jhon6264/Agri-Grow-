/** Truncate incomplete transfers so rounding never announces completion early. */
export function formatDownloadPercentage(bytes: number, total: number): string {
  if (!Number.isFinite(bytes) || !Number.isFinite(total) || total <= 0 || bytes <= 0) return '0.0%';
  if (bytes >= total) return '100.0%';
  return `${(Math.min(999, Math.floor(bytes / total * 1000)) / 10).toFixed(1)}%`;
}
