import { serializePaymentRequest, deserializePaymentRequest } from '../src/services/formAdapters';
import { INITIAL_PAYMENT_REQUEST_DATA } from '../src/models/paymentRequest';
import type { FormRecord } from '../src/models/backend';

let passed = 0; let failed = 0;
const check = (ok: boolean, name: string) => { if (ok) { passed++; console.log(`[PASS] ${name}`); } else { failed++; console.error(`[FAIL] ${name}`); } };
const data = { ...INITIAL_PAYMENT_REQUEST_DATA, company: '[E2E-2B-FINAL] 公司', project: '[E2E-2B-FINAL] 主專案', projectId: 'PRJ-1', subProjectId: 'SUB-1', subProjectName: '[E2E-2B-FINAL] 分案', budgetType: 'unbudgeted' as const };
const payload = serializePaymentRequest(data);
check(payload.subProjectId === 'SUB-1' && payload.subProjectName?.includes('分案'), 'Adapter persists SubProject linkage');
const record: FormRecord = { formId: 'FRM-1', formType: 'payment_request', status: 'submitted', createdAt: '', updatedAt: '', createdBy: '', company: data.company, projectId: 'PRJ-1', projectName: data.project, subProjectId: 'SUB-1', subProjectName: data.subProjectName, vendorId: '', vendorName: '', vendorTaxId: '', budgetType: 'unbudgeted', budgetItemId: '', amount: 0, payloadJson: payload.payloadJson as string, excelFileId: '', pdfFileId: '', version: 1 };
const restored = deserializePaymentRequest(record);
check(restored.subProjectId === 'SUB-1' && restored.subProjectName === data.subProjectName, 'Adapter hydrates SubProject linkage');
const legacy = deserializePaymentRequest({ ...record, subProjectId: undefined, subProjectName: undefined, payloadJson: JSON.stringify({ ...data, subProjectId: undefined, subProjectName: undefined }) });
check(legacy.subProjectId === '' && legacy.subProjectName === '', 'Legacy form missing SubProject safe hydration');
console.log(`\nPhase 2B-4 adapter tests: ${passed}/${passed + failed} PASS`);
if (failed) process.exitCode = 1;
