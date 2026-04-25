/**
 * Formats a date to a readable datetime string
 * Example output: "Apr 24, 2026, 2:30 PM"
 * 
 * @param date - Date string or Date object to format
 * @returns Formatted datetime string
 */
export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Formats a date to just the date portion (for backwards compatibility)
 * Example output: "Apr 24, 2026"
 * 
 * @param date - Date string or Date object to format
 * @returns Formatted date string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
