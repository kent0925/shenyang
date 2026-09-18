import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, randomUUID } from 'node:crypto';
import { createGasEnvironment } from './gas-mock.js';

// Attachment-only harness: no initializeSystem, no external API or Sheet writes.
export function attachmentEnvironment() {
  const env = createGasEnvironment({ DRIVE_ROOT_FOLDER_ID: 'root' });
  let locked = false, onLock = null;
  const events = [];
  env.LockService.getScriptLock = () => ({
    waitLock() { if (locked) throw new Error('nested lock'); locked = true; events.push('lock'); if (onLock) { const f = onLock; onLock = null; f(); } },
    releaseLock() { locked = false; events.push('unlock'); },
  });
  const props = env.PropertiesService.getScriptProperties();
  props.deleteProperty = k => { delete env._internal.properties[k]; };
  env.PropertiesService.getScriptProperties = () => props;
  const newBlob = env.Utilities.newBlob;
  env.Utilities.newBlob = (bytes, mime, name) => {
    const blob = newBlob(typeof bytes === 'string' ? Array.from(Buffer.from(bytes)) : bytes, mime, name);
    blob.getDataAsString = () => Buffer.from(blob.getBytes()).toString('utf8');
    return blob;
  };
  env.Utilities.getUuid = randomUUID;
  env.Utilities.DigestAlgorithm = { SHA_256: 'SHA-256' };
  env.Utilities.computeDigest = (_, bytes) => Array.from(createHash('sha256').update(Buffer.from(bytes)).digest());
  const folderPrototype = Object.getPrototypeOf(env.DriveApp.getFolderById('root'));
  // Patch only once; hooks are attached per environment through driveContext.
  if (!folderPrototype._attachmentPatched) {
    const createFile = folderPrototype.createFile;
    folderPrototype.createFile = function(blob) {
      this.driveContext.beforeAttachmentFile?.(blob);
      const file = createFile.call(this, blob);
      file.getSize = () => file.getBlob().getBytes().length;
      return file;
    };
    folderPrototype.setName = function(name) { this.name = name; return this; };
    folderPrototype._attachmentPatched = true;
  }
  env.DriveApp.getFolderById('root').driveContext.beforeAttachmentFile = blob => {
    if (locked) throw new Error('binary/file write under global ScriptLock');
    events.push('file:' + blob.getName());
  };
  const context = vm.createContext({ ...env, Date, console });
  for (const name of ['ApiService.gs', 'AttachmentService.gs', 'Code.gs']) {
    vm.runInContext(fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8'), context, { filename: name });
  }
  const records = new Map();
  context.getDriveRootFolderId = () => 'root';
  context.getApiSharedSecret = () => 'local-test-secret';
  context.handleGetForm = ({ formId }) => {
    if (!records.has(formId)) throw context.createApiError('NOT_FOUND', '找不到表單');
    return { ...records.get(formId) };
  };
  const addRecord = (id = 'FRM-2026-000001', version = 1) => {
    const record = { formId: id, formType: 'seal_approval', version, excelFileId: 'formal-excel', pdfFileId: 'formal-pdf' };
    records.set(id, record); return record;
  };
  const dispatch = (action, payload) => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({ secret: 'local-test-secret', action, payload }) } }).getContent());
  return { env, context, events, records, addRecord, dispatch, onNextLock(fn) { onLock = fn; } };
}
