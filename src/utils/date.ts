/**
 * 解析日期字串為西元年月日及民國年
 */
export interface DateParts {
  year: number;       // 西元
  rocYear: number;    // 民國年（西元 - 1911）
  month: number;
  day: number;
}

export function parseDateParts(dateStr: string): DateParts | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = parseInt(parts[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;

  return {
    year: y,
    rocYear: y - 1911,
    month: m,
    day: d,
  };
}

export function formatDateSlash(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '/');
}
