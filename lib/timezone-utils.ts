/**
 * Timezone Utilities for IST (India Standard Time)
 * Client displays in IST, database stores in UTC
 * 
 * IMPORTANT: Only TIME values need timezone conversion.
 * DATE values (YYYY-MM-DD) are timezone-agnostic and stored as-is.
 */

export const IST_OFFSET_MINUTES = 330; // IST is UTC+5:30

/**
 * Convert UTC date to IST date string (YYYY-MM-DD)
 */
export function utcToISTDate(utcDateStr: string | null | undefined): string {
  if (!utcDateStr) return '';
  const date = new Date(utcDateStr);
  if (isNaN(date.getTime())) return '';
  
  // Add IST offset
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Convert UTC time to IST time string (HH:MM)
 */
export function utcToISTTime(utcTimeStr: string | null | undefined): string {
  if (!utcTimeStr) return '09:00';
  
  // Parse time string (HH:MM or HH:MM:SS)
  const parts = utcTimeStr.split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  
  // Create a date object for today with the UTC time
  const date = new Date();
  date.setUTCHours(hours, minutes, 0, 0);
  
  // Add IST offset
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const istHours = String(istDate.getUTCHours()).padStart(2, '0');
  const istMinutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  
  return `${istHours}:${istMinutes}`;
}

/**
 * Convert IST date to UTC date string (YYYY-MM-DD)
 * 
 * ⚠️ WARNING: This function should NOT be used for simple date storage!
 * DATE values (YYYY-MM-DD) are timezone-agnostic and should be stored as-is.
 * This function is only useful when you need to convert a date+time combination
 * and want to handle potential date rollover from the time conversion.
 * 
 * For package deliveries: Store dates as-is, only convert times!
 */
export function istToUTCDate(istDateStr: string | null | undefined): string {
  if (!istDateStr) return '';
  
  const [year, month, day] = istDateStr.split('-').map(Number);
  if (!year || !month || !day) return '';
  
  // Create date in IST (treating input as IST midnight)
  const istDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  
  // Subtract IST offset to get UTC
  const utcDate = new Date(istDate.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
  
  const utcYear = utcDate.getUTCFullYear();
  const utcMonth = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const utcDay = String(utcDate.getUTCDate()).padStart(2, '0');
  
  return `${utcYear}-${utcMonth}-${utcDay}`;
}

/**
 * Convert IST time to UTC time string (HH:MM:SS)
 */
export function istToUTCTime(istTimeStr: string | null | undefined): string {
  if (!istTimeStr) return '03:30:00'; // 09:00 IST = 03:30 UTC
  
  const parts = istTimeStr.split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  
  // Create a date object with IST time
  const date = new Date();
  date.setUTCHours(hours, minutes, 0, 0);
  
  // Subtract IST offset to get UTC
  const utcDate = new Date(date.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
  
  const utcHours = String(utcDate.getUTCHours()).padStart(2, '0');
  const utcMinutes = String(utcDate.getUTCMinutes()).padStart(2, '0');
  const utcSeconds = String(utcDate.getUTCSeconds()).padStart(2, '0');
  
  return `${utcHours}:${utcMinutes}:${utcSeconds}`;
}

/**
 * Convert IST datetime (date + time) to UTC ISO string
 * 
 * Takes a date and time that are in IST and converts the combined datetime to UTC.
 * Example: istToUTCDateTime("2026-02-07", "11:05") 
 *   → IST datetime: Feb 7, 2026 at 11:05 AM IST
 *   → UTC datetime: Feb 7, 2026 at 05:35 AM UTC
 *   → Returns: "2026-02-07T05:35:00.000Z"
 */
export function istToUTCDateTime(istDateStr: string, istTimeStr: string): string {
  const [year, month, day] = istDateStr.split('-').map(Number);
  const [hours, minutes] = istTimeStr.split(':').map(Number);
  
  if (!year || !month || !day) return new Date().toISOString();
  
  // Interpret the date+time as IST by creating milliseconds since epoch
  // We create a UTC date with IST values, then subtract offset
  const istAsUTCDate = Date.UTC(year, month - 1, day, hours || 0, minutes || 0, 0);
  
  // Subtract IST offset to get actual UTC time
  const utcTimestamp = istAsUTCDate - (IST_OFFSET_MINUTES * 60 * 1000);
  
  return new Date(utcTimestamp).toISOString();
}

/**
 * Convert UTC ISO string to IST date and time components
 */
export function utcToISTDateTime(utcISOString: string): {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
} {
  const date = new Date(utcISOString);
  if (isNaN(date.getTime())) {
    return { date: '', time: '09:00' };
  }
  
  // Add IST offset
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const year = istDate.getUTCFullYear();
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const hours = String(istDate.getUTCHours()).padStart(2, '0');
  const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  
  return {
    date: `${year}-${month}-${day}`,
    time: `${hours}:${minutes}`,
  };
}

/**
 * Format UTC date to IST display format
 */
export function formatISTDate(utcDateStr: string | null | undefined): string {
  if (!utcDateStr) return '';
  
  const date = new Date(utcDateStr);
  if (isNaN(date.getTime())) return '';
  
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const day = String(istDate.getUTCDate()).padStart(2, '0');
  const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
  const year = istDate.getUTCFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format UTC time to IST display format
 */
export function formatISTTime(utcTimeStr: string | null | undefined): string {
  if (!utcTimeStr) return '09:00 AM';
  
  const parts = utcTimeStr.split(':');
  const hours = parseInt(parts[0] || '0', 10);
  const minutes = parseInt(parts[1] || '0', 10);
  
  const date = new Date();
  date.setUTCHours(hours, minutes, 0, 0);
  
  const istDate = new Date(date.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const istHours = istDate.getUTCHours();
  const istMinutes = String(istDate.getUTCMinutes()).padStart(2, '0');
  
  const period = istHours >= 12 ? 'PM' : 'AM';
  const displayHours = istHours % 12 || 12;
  
  return `${displayHours}:${istMinutes} ${period}`;
}

/**
 * Get current date in IST (YYYY-MM-DD)
 */
export function getCurrentISTDate(): string {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const year = istNow.getUTCFullYear();
  const month = String(istNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(istNow.getUTCDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get current time in IST (HH:MM)
 */
export function getCurrentISTTime(): string {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MINUTES * 60 * 1000);
  
  const hours = String(istNow.getUTCHours()).padStart(2, '0');
  const minutes = String(istNow.getUTCMinutes()).padStart(2, '0');
  
  return `${hours}:${minutes}`;
}
