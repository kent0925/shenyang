/**
 * 清除 Windows 及檔案系統不允許使用的字元：\ / : * ? " < > | 以及換行空白
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\r\n\t]/g, '').trim();
}

/**
 * 格式化西元日期為 YYYYMMDD（例如 20260914）
 */
export function formatDateToYYYYMMDD(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '');
}

/**
 * 產生用印／簽呈檔名（不含副檔名）
 * 格式：主旨_YYYYMMDD_類型
 * 例如：租賃合約續約_20260914_簽呈+用印
 */
export function getSealApprovalBaseFilename(subject: string, applyDate: string, types: string[]): string {
  const safeSubject = sanitizeFilename(subject) || '簽核申請';
  const ymd = formatDateToYYYYMMDD(applyDate) || '00000000';
  const typeStr = types.length > 0 ? types.join('+') : '用印';
  return `${safeSubject}_${ymd}_${typeStr}`;
}

/**
 * 產生請款單檔名（不含副檔名）
 * 有專案時：專案_廠商_YYYYMMDD
 * 無專案時：廠商_YYYYMMDD（直接略過專案，不產生多餘底線）
 */
export function getPaymentRequestBaseFilename(project: string, vendor: string, applyDate: string): string {
  const safeProject = sanitizeFilename(project);
  const safeVendor = sanitizeFilename(vendor) || '廠商請款';
  const ymd = formatDateToYYYYMMDD(applyDate) || '00000000';

  if (safeProject) {
    return `${safeProject}_${safeVendor}_${ymd}`;
  }
  return `${safeVendor}_${ymd}`;
}
