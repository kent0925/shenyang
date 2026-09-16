/**
 * src/services/backendStorage.ts - 前端後端資料服務層
 *
 * 任務：
 * 提供強型別之資料庫操作 API 方法，全面透過共用 backendClient 與 /api/backend 溝通。
 * Feature layer 僅接觸此層介面，絕無 GAS 或底層代理細節。
 */

import { backendClient } from './backendClient';
import type {
  Project,
  SaveProjectPayload,
  SubProject,
  SaveSubProjectPayload,
  ListSubProjectsPayload,
  Vendor,
  SaveVendorPayload,
  BudgetItem,
  ListBudgetItemsPayload,
  SaveBudgetItemPayload,
  FormRecord,
  ListFormsPayload,
  GetFormPayload,
  SaveFormPayload,
  BackendHealthData,
  ArchiveFormFilesPayload,
  ArchiveFormFilesResult,
  GetArchivedFormFilePayload,
  ArchivedFormFileResult,
  ArchivedVersionItem,
  ListArchivedFormVersionsPayload,
} from '../models/backend';

export class BackendStorageService {
  /**
   * 系統健康狀態檢查
   */
  async health(): Promise<BackendHealthData> {
    return backendClient.request<BackendHealthData>('health');
  }

  /**
   * 取得專案主檔列表
   */
  async listProjects(): Promise<Project[]> {
    return backendClient.request<Project[]>('listProjects');
  }

  /**
   * 新增或更新專案主檔
   */
  async saveProject(payload: SaveProjectPayload): Promise<Project> {
    return backendClient.request<Project, SaveProjectPayload>('saveProject', payload);
  }

  async listSubProjects(filter?: ListSubProjectsPayload): Promise<SubProject[]> {
    return backendClient.request<SubProject[], ListSubProjectsPayload>('listSubProjects', filter || {});
  }

  async saveSubProject(payload: SaveSubProjectPayload): Promise<SubProject> {
    return backendClient.request<SubProject, SaveSubProjectPayload>('saveSubProject', payload);
  }

  /**
   * 取得廠商主檔列表
   */
  async listVendors(): Promise<Vendor[]> {
    return backendClient.request<Vendor[]>('listVendors');
  }

  /**
   * 新增或更新廠商主檔
   */
  async saveVendor(payload: SaveVendorPayload): Promise<Vendor> {
    return backendClient.request<Vendor, SaveVendorPayload>('saveVendor', payload);
  }

  /**
   * 取得特定年度與專案之預算項目列表
   */
  async listBudgetItems(filter?: ListBudgetItemsPayload): Promise<BudgetItem[]> {
    return backendClient.request<BudgetItem[], ListBudgetItemsPayload>('listBudgetItems', filter || {});
  }

  /**
   * 新增或更新預算項目
   */
  async saveBudgetItem(payload: SaveBudgetItemPayload): Promise<BudgetItem> {
    return backendClient.request<BudgetItem, SaveBudgetItemPayload>('saveBudgetItem', payload);
  }

  /**
   * 取得表單紀錄清單（可按年度、類型、專案、廠商篩選）
   */
  async listForms(filter?: ListFormsPayload): Promise<FormRecord[]> {
    return backendClient.request<FormRecord[], ListFormsPayload>('listForms', filter || {});
  }

  /**
   * 依據表單編號與年度取得單筆表單紀錄
   */
  async getForm(query: GetFormPayload): Promise<FormRecord> {
    return backendClient.request<FormRecord, GetFormPayload>('getForm', query);
  }

  /**
   * 新增或更新表單紀錄（純表單紀錄，不自動建立請款紀錄）
   */
  async saveForm(payload: SaveFormPayload): Promise<FormRecord> {
    return backendClient.request<FormRecord, SaveFormPayload>('saveForm', payload);
  }

  /**
   * 雲端歸檔表單產出之 Excel/XLSM 與 PDF 檔案（原子性一組操作）
   */
  async archiveFormFiles(payload: ArchiveFormFilesPayload): Promise<ArchiveFormFilesResult> {
    return backendClient.request<ArchiveFormFilesResult, ArchiveFormFilesPayload>('archiveFormFiles', payload);
  }

  /**
   * 依據表單編號與檔案類型安全取得已歸檔檔案之 Base64 資料
   */
  async getArchivedFormFile(query: GetArchivedFormFilePayload): Promise<ArchivedFormFileResult> {
    return backendClient.request<ArchivedFormFileResult, GetArchivedFormFilePayload>('getArchivedFormFile', query);
  }

  /**
   * 查詢指定表單在 Google Drive 的歷史歸檔版本列表（純唯讀）
   */
  async listArchivedFormVersions(query: ListArchivedFormVersionsPayload): Promise<ArchivedVersionItem[]> {
    return backendClient.request<ArchivedVersionItem[], ListArchivedFormVersionsPayload>('listArchivedFormVersions', query);
  }
}

export const backendStorageService = new BackendStorageService();
