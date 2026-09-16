import { resolveCascadeFilter, DEFAULT_FILTER_STATE } from '../../src/utils/formRecordsFilter.ts';

let passed = 0;
let failed = 0;

function check(name, ok) {
  if (ok) {
    passed++;
    console.log(`[PASS] ${name}`);
  } else {
    failed++;
    console.error(`[FAIL] ${name}`);
  }
}

console.log('=== Phase 2C-2 Cascade Hardening Targeted Checks ===\n');

// Mock records
const mockRecords = [];

// 1. Company -> Project/SubProject clearing (edge case: SubProject selected without Project)
const state1 = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: 'Company A',
  selectedProjectId: '',
  selectedSubProjectId: 'SUB-A',
  page: 3,
};
const res1 = resolveCascadeFilter(mockRecords, state1, {
  selectedCompany: 'Company B',
});
check(
  '1. Company change clears both Project and SubProject even when Project was empty, resets page to 1',
  res1.selectedCompany === 'Company B' &&
  res1.selectedProjectId === '' &&
  res1.selectedSubProjectId === '' &&
  res1.page === 1
);

// 2. Project -> SubProject clearing (Project cleared to empty)
const state2 = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: 'Company A',
  selectedProjectId: 'PRJ-A',
  selectedSubProjectId: 'SUB-A',
  page: 2,
};
const res2 = resolveCascadeFilter(mockRecords, state2, {
  selectedProjectId: '',
});
check(
  '2. Project cleared to empty clears SubProject, preserves Company, resets page to 1',
  res2.selectedCompany === 'Company A' &&
  res2.selectedProjectId === '' &&
  res2.selectedSubProjectId === '' &&
  res2.page === 1
);

// 3. Project -> SubProject clearing (Project changed to another Project)
const state3 = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: 'Company A',
  selectedProjectId: 'PRJ-A',
  selectedSubProjectId: 'SUB-A',
  page: 4,
};
const res3 = resolveCascadeFilter(mockRecords, state3, {
  selectedProjectId: 'PRJ-B',
});
check(
  '3. Project change to different project clears SubProject, resets page to 1',
  res3.selectedCompany === 'Company A' &&
  res3.selectedProjectId === 'PRJ-B' &&
  res3.selectedSubProjectId === '' &&
  res3.page === 1
);

// 4. Vendor independence on Company change
const state4 = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: 'Company A',
  selectedProjectId: 'PRJ-A',
  selectedSubProjectId: 'SUB-A',
  selectedVendorId: 'VEN-001',
  page: 2,
};
const res4 = resolveCascadeFilter(mockRecords, state4, {
  selectedCompany: 'Company B',
});
check(
  '4. Vendor selection remains independent on Company change',
  res4.selectedCompany === 'Company B' &&
  res4.selectedProjectId === '' &&
  res4.selectedSubProjectId === '' &&
  res4.selectedVendorId === 'VEN-001' &&
  res4.page === 1
);

// 5. Vendor independence on Project change
const state5 = {
  ...DEFAULT_FILTER_STATE,
  selectedCompany: 'Company A',
  selectedProjectId: 'PRJ-A',
  selectedSubProjectId: 'SUB-A',
  selectedVendorId: 'VEN-002',
  page: 3,
};
const res5 = resolveCascadeFilter(mockRecords, state5, {
  selectedProjectId: '',
});
check(
  '5. Vendor selection remains independent on Project clearing',
  res5.selectedProjectId === '' &&
  res5.selectedSubProjectId === '' &&
  res5.selectedVendorId === 'VEN-002' &&
  res5.page === 1
);

console.log(`\n========================================`);
console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
console.log(`========================================`);

if (failed > 0) {
  process.exit(1);
}
