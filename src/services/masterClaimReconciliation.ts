/**
 * src/services/masterClaimReconciliation.ts
 * 每月及年度請款總表（母表）與系統資料庫校正服務
 */

import { RAW_MASTER_CLAIM_CSV, parseCsvRows } from '../data/masterClaimData';
import { backendStorageService } from './backendStorage';
import type { Project, BudgetItem, Vendor, FormRecord } from '../models/backend';

export interface MasterClaimItem {
  company: string;
  projectName: string;
  itemName: string;
  vendorName: string;
  totalBudget: number | string;
  contractBudget: number | string;
  paidHistorical: number; // 截至2025 12月已付
  paidStatus: string; // 1, 0.8, 結案 等
  unpaidAmount: number | string; // 待付
  // 歷月金額 (2024/12, 2025/01~12, 2026/01~06)
  monthlyPayments: Record<string, number>;
  monthlyNotes: Record<string, string>;
  rawRowIndex: number;
}

export interface ReconciliationStatus {
  item: MasterClaimItem;
  // 系統主檔匹配
  matchedProject?: Project;
  matchedBudgetItem?: BudgetItem;
  matchedVendor?: Vendor;
  isProjectInSystem: boolean;
  isBudgetItemInSystem: boolean;
  isVendorInSystem: boolean;
  // 系統實際請款單紀錄
  systemRecords: FormRecord[];
  systemTotalPaid: number;
  systemTotalClaimed: number;
  // 差額與狀態
  variance: number; // systemTotalPaid - item.paidHistorical
  status: 'MATCH' | 'DISCREPANCY' | 'PENDING_ENTRY' | 'UNREGISTERED';
  statusLabel: string;
}

export interface ReconciliationReport {
  timestamp: string;
  totalItems: number;
  projectCount: number;
  vendorCount: number;
  // 主檔對齊指標
  projectsInSystemCount: number;
  budgetItemsInSystemCount: number;
  vendorsInSystemCount: number;
  // 金額指標
  masterTotalBudget: number;
  masterTotalPaid: number;
  systemTotalPaid: number;
  totalVariance: number;
  matchCount: number;
  discrepancyCount: number;
  pendingCount: number;
  // 明細
  items: ReconciliationStatus[];
}

/**
 * 解析母表第一大表（歷月請款明細總表）為結構化物件清單
 */
export function extractMasterClaimItems(): MasterClaimItem[] {
  const rows = parseCsvRows(RAW_MASTER_CLAIM_CSV);
  const items: MasterClaimItem[] = [];

  let currentCompany = '';
  let currentProject = '';

  for (let i = 3; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    const firstCell = (row[0] || '').trim();
    const secondCell = (row[1] || '').trim();

    // 遇到合計或第二大表結束
    if (firstCell.includes('合計') || secondCell.includes('合計')) break;
    if (firstCell.includes('2025年專案及付款總結') || secondCell.includes('2025年專案及付款總結')) break;
    if (firstCell.includes('＊藍色=本月新增項目')) break;

    if (firstCell !== '') currentCompany = firstCell;
    if (secondCell !== '') currentProject = secondCell.replace(/\r?\n/g, ' ');

    const itemName = (row[2] || '').trim();
    const vendorName = (row[3] || '').trim();
    if (!itemName && !vendorName) continue;

    const parseNum = (val: string | undefined): number => {
      if (!val) return 0;
      const clean = val.replace(/,/g, '').trim();
      const n = Number(clean);
      return isNaN(n) ? 0 : n;
    };

    const monthlyPayments: Record<string, number> = {
      '2024-12': parseNum(row[9]),
      '2025-01': parseNum(row[10]),
      '2025-02': parseNum(row[11]),
      '2025-03': parseNum(row[12]),
      '2025-04': parseNum(row[13]),
      '2025-05': parseNum(row[14]),
      '2025-06': parseNum(row[15]),
      '2025-07': parseNum(row[16]),
      '2025-08': parseNum(row[18]),
      '2025-09': parseNum(row[20]),
      '2025-10': parseNum(row[22]),
      '2025-11': parseNum(row[23]),
      '2025-12': parseNum(row[24]),
      '2026-01': parseNum(row[25]),
      '2026-02': parseNum(row[26]),
      '2026-03': parseNum(row[27]),
      '2026-04': parseNum(row[28]),
      '2026-05': parseNum(row[29]),
      '2026-06': parseNum(row[30]),
    };

    const monthlyNotes: Record<string, string> = {
      '2025-07': (row[17] || '').trim(),
      '2025-08': (row[19] || '').trim(),
      '2025-09': (row[21] || '').trim(),
    };

    items.push({
      company: currentCompany,
      projectName: currentProject,
      itemName,
      vendorName,
      totalBudget: row[4] || '',
      contractBudget: row[5] || '',
      paidHistorical: parseNum(row[6]),
      paidStatus: (row[7] || '').trim(),
      unpaidAmount: row[8] || '',
      monthlyPayments,
      monthlyNotes,
      rawRowIndex: i,
    });
  }

  return items;
}

/**
 * 執行母表與系統資料庫完整校正比對
 */
export async function runMasterClaimReconciliation(): Promise<ReconciliationReport> {
  const masterItems = extractMasterClaimItems();

  // 平行取得系統主檔與請款單
  const [projects, budgetItems, vendors, forms] = await Promise.all([
    backendStorageService.listProjects().catch(() => [] as Project[]),
    backendStorageService.listBudgetItems().catch(() => [] as BudgetItem[]),
    backendStorageService.listVendors().catch(() => [] as Vendor[]),
    backendStorageService.listForms({ formType: 'payment_request' }).catch(() => [] as FormRecord[]),
  ]);

  const uniqueProjects = new Set<string>();
  const uniqueVendors = new Set<string>();
  masterItems.forEach((it) => {
    if (it.projectName) uniqueProjects.add(it.projectName);
    if (it.vendorName) uniqueVendors.add(it.vendorName);
  });

  let matchCount = 0;
  let discrepancyCount = 0;
  let pendingCount = 0;

  let masterTotalBudget = 0;
  let masterTotalPaid = 0;
  let systemTotalPaid = 0;

  const items: ReconciliationStatus[] = masterItems.map((item) => {
    // 預算與付款累加
    const tb = Number(String(item.totalBudget).replace(/,/g, ''));
    if (!isNaN(tb)) masterTotalBudget += tb;
    masterTotalPaid += item.paidHistorical;

    // 1. 匹配專案主檔 (名稱包含或完全一致)
    const matchedProject = projects.find((p) => {
      const pName = p.projectName.trim();
      const iName = item.projectName.trim();
      return (
        pName === iName ||
        pName.includes(iName) ||
        iName.includes(pName) ||
        (item.company && p.company.includes(item.company) && (pName.includes(iName) || iName.includes(pName)))
      );
    });

    // 2. 匹配廠商主檔
    const matchedVendor = vendors.find((v) => {
      const vName = v.vendorName.trim();
      const iVend = item.vendorName.trim();
      return vName === iVend || vName.includes(iVend) || iVend.includes(vName);
    });

    // 3. 匹配預算項目
    const matchedBudgetItem = budgetItems.find((b) => {
      const bItem = b.itemName.trim();
      const iItem = item.itemName.trim();
      return (
        (bItem === iItem || bItem.includes(iItem) || iItem.includes(bItem)) &&
        (!matchedProject || b.projectId === matchedProject.projectId)
      );
    });

    // 4. 統計系統請款單紀錄 (符合專案或廠商或項目者)
    const relatedForms = forms.filter((f) => {
      const formProj = (f.projectName || '').trim();
      const formVend = (f.vendorName || '').trim();

      const projMatch =
        matchedProject && f.projectId === matchedProject.projectId
          ? true
          : formProj && item.projectName && (formProj.includes(item.projectName) || item.projectName.includes(formProj));

      const vendMatch =
        matchedVendor && f.vendorId === matchedVendor.vendorId
          ? true
          : formVend && item.vendorName && (formVend.includes(item.vendorName) || item.vendorName.includes(formVend));

      return projMatch && vendMatch;
    });

    // 計算系統已付金額 (狀態為 paid) 與已請款總額
    const sysPaid = relatedForms
      .filter((f) => f.status === 'paid')
      .reduce((sum, f) => sum + (Number(f.amount) || 0), 0);

    const sysClaimed = relatedForms.reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
    systemTotalPaid += sysPaid;

    const variance = sysPaid - item.paidHistorical;

    // 校正狀態判定
    let status: ReconciliationStatus['status'] = 'PENDING_ENTRY';
    let statusLabel = '系統尚無請款單';

    if (relatedForms.length === 0) {
      if (item.paidHistorical > 0) {
        status = 'PENDING_ENTRY';
        statusLabel = '母表有款・系統待補單';
        pendingCount++;
      } else {
        status = 'MATCH';
        statusLabel = '無請款・已吻合';
        matchCount++;
      }
    } else {
      if (Math.abs(variance) < 1) {
        status = 'MATCH';
        statusLabel = '完全吻合';
        matchCount++;
      } else {
        status = 'DISCREPANCY';
        statusLabel = `差額 ${variance > 0 ? '+' : ''}${variance.toLocaleString()}`;
        discrepancyCount++;
      }
    }

    return {
      item,
      matchedProject,
      matchedBudgetItem,
      matchedVendor,
      isProjectInSystem: !!matchedProject,
      isBudgetItemInSystem: !!matchedBudgetItem,
      isVendorInSystem: !!matchedVendor,
      systemRecords: relatedForms,
      systemTotalPaid: sysPaid,
      systemTotalClaimed: sysClaimed,
      variance,
      status,
      statusLabel,
    };
  });

  const projectsInSys = items.filter((i) => i.isProjectInSystem).length;
  const budgetsInSys = items.filter((i) => i.isBudgetItemInSystem).length;
  const vendorsInSys = items.filter((i) => i.isVendorInSystem).length;

  return {
    timestamp: new Date().toISOString(),
    totalItems: masterItems.length,
    projectCount: uniqueProjects.size,
    vendorCount: uniqueVendors.size,
    projectsInSystemCount: projectsInSys,
    budgetItemsInSystemCount: budgetsInSys,
    vendorsInSystemCount: vendorsInSys,
    masterTotalBudget,
    masterTotalPaid,
    systemTotalPaid,
    totalVariance: systemTotalPaid - masterTotalPaid,
    matchCount,
    discrepancyCount,
    pendingCount,
    items,
  };
}

/**
 * 一鍵將母表中未建檔之專案、廠商與預算項目同步校正至系統主檔
 */
export async function syncMasterDataToSystem(report: ReconciliationReport): Promise<{
  createdProjects: number;
  createdVendors: number;
  createdBudgetItems: number;
}> {
  let createdProjects = 0;
  let createdVendors = 0;
  let createdBudgetItems = 0;

  // 1. 同步專案
  const missingProjects = new Map<string, { company: string; projectName: string }>();
  report.items.forEach((it) => {
    if (!it.isProjectInSystem && it.item.projectName) {
      const key = `${it.item.company}_${it.item.projectName}`;
      if (!missingProjects.has(key)) {
        missingProjects.set(key, { company: it.item.company || '昇陽', projectName: it.item.projectName });
      }
    }
  });

  for (const [, p] of missingProjects.entries()) {
    try {
      await backendStorageService.saveProject({
        company: p.company,
        projectName: p.projectName,
        status: 'active',
      });
      createdProjects++;
    } catch (e) {
      console.warn('建立專案主檔失敗:', p.projectName, e);
    }
  }

  // 2. 同步廠商
  const missingVendors = new Set<string>();
  report.items.forEach((it) => {
    if (!it.isVendorInSystem && it.item.vendorName) {
      missingVendors.add(it.item.vendorName);
    }
  });

  for (const vName of missingVendors) {
    try {
      await backendStorageService.saveVendor({
        vendorName: vName,
        taxId: '',
        isActive: true,
      });
      createdVendors++;
    } catch (e) {
      console.warn('建立廠商主檔失敗:', vName, e);
    }
  }

  // 3. 同步預算項目
  for (const it of report.items) {
    if (!it.isBudgetItemInSystem && it.item.itemName) {
      const numBudget = Number(String(it.item.contractBudget || it.item.totalBudget).replace(/,/g, '')) || 0;
      try {
        await backendStorageService.saveBudgetItem({
          company: it.item.company || '昇陽',
          projectName: it.item.projectName,
          itemName: it.item.itemName,
          vendorName: it.item.vendorName,
          budgetAmount: numBudget,
          status: 'active',
          year: 2025,
        });
        createdBudgetItems++;
      } catch (e) {
        console.warn('建立預算項目失敗:', it.item.itemName, e);
      }
    }
  }

  return { createdProjects, createdVendors, createdBudgetItems };
}
