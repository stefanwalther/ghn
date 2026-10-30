/**
 * Human-readable rendering of a database size in bytes. Pure and
 * client-safe: the settings page imports this directly.
 */
export function formatDatabaseSize(sizeBytes: number | null): string {
  if (sizeBytes === null) return "Not created yet";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unit = units[0];
  for (let i = 0; i < units.length; i++) {
    unit = units[i];
    if (value < 1024 || i === units.length - 1) break;
    value /= 1024;
  }
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("en-US")} ${unit} (${sizeBytes.toLocaleString("en-US")} bytes)`;
}
