import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { attachmentEnvironment } from './attachment-environment.js';

const h = attachmentEnvironment(), c = h.context;
const record = h.addRecord();
const file = Buffer.alloc(5 * 1024 * 1024 + 13, 42); file.write('%PDF-1.7');
const descriptor = (key, fileName, mimeType, bytes) => ({ key, fileName, mimeType, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
function payload(version = 1) {
  return { formId: record.formId, expectedVersion: version, attachmentId: `ATT-${randomUUID()}`, type: 'general',
    displayName: 'report.pdf', metadata: null, files: [descriptor('primary', 'report.pdf', 'application/pdf', file)] };
}
function upload(p, bytes = file) {
  c.handleBeginFormAttachmentUpload(p);
  for (let offset = 0, index = 0; offset < bytes.length; offset += c.ATT_CHUNK_SIZE, index++) {
    const part = { ...p, fileKey: 'primary', index, base64: bytes.subarray(offset, offset + c.ATT_CHUNK_SIZE).toString('base64') };
    c.handleUploadFormAttachmentChunk(part); c.handleUploadFormAttachmentChunk(part);
  }
  c.handleFinalizeFormAttachmentFile({ ...p, fileKey: 'primary' });
  c.handleFinalizeFormAttachmentFile({ ...p, fileKey: 'primary' });
}
const visible = version => c.handleListFormAttachments({ formId: record.formId, version });
const code = (fn, expected) => assert.throws(fn, e => e.code === expected);
let tests = 0;
function test(name, fn) { fn(); tests++; console.log('PASS ' + name); }
const p = payload();
test('pending is hidden; >4.5 MB upload and chunk retry assemble one final file outside lock', () => {
  upload(p); assert.equal(visible(1).length, 0);
  const finals = [...h.env._internal.files.values()].filter(f => f.getName() === 'file' && !f.isTrashed());
  assert.equal(finals.length, 1); assert.deepEqual(Buffer.from(finals[0].getBlob().getBytes()), file);
});
test('publish + response-loss retry is idempotent, leaves only manifest and final file', () => {
  c.handleFinalizeFormAttachment(p); c.handleFinalizeFormAttachment(p);
  assert.equal(c.handleBeginFormAttachmentUpload(p).published, true); assert.equal(visible(1).length, 1);
  const root = c.attRoot(record, false), folder = c.findChildFolderByName(root, p.attachmentId);
  const names = []; const it = folder.getFiles(); while (it.hasNext()) names.push(it.next().getName());
  assert.deepEqual(names.sort(), ['file', 'manifest.json']);
  assert.equal(c.findChildFolderByName(folder, '.chunks'), null);
});
test('chunk download reconstructs identical bytes and disallows arbitrary Drive IDs', () => {
  const query = { formId: record.formId, attachmentId: p.attachmentId, version: 1 };
  const info = c.handleGetFormAttachmentFileInfo(query); assert.equal(info.chunkCount, 3);
  const parts = Array.from({ length: info.chunkCount }, (_, index) => Buffer.from(c.handleGetFormAttachmentFileChunk({ ...query, index }).base64, 'base64'));
  assert.deepEqual(Buffer.concat(parts), file);
  code(() => c.handleGetFormAttachmentFileInfo({ ...query, fileId: 'formal-excel' }), 'VALIDATION_ERROR');
  code(() => c.handleGetFormAttachmentFileChunk({ ...query, index: 3 }), 'VALIDATION_ERROR');
  const other = h.addRecord('FRM-2026-000002');
  code(() => c.handleGetFormAttachmentFileInfo({ ...query, formId: other.formId }), 'NOT_FOUND');
});
test('metadata, types, size, index and checksum validation; no executable renamed PDF', () => {
  code(() => c.handleBeginFormAttachmentUpload({ ...payload(), displayName: 'a.js', files: [{ ...p.files[0], fileName: 'a.js' }] }), 'VALIDATION_ERROR');
  code(() => c.handleBeginFormAttachmentUpload({ ...payload(), files: [{ ...p.files[0], size: 11 * 1024 * 1024 }] }), 'VALIDATION_ERROR');
  const q = payload(); c.handleBeginFormAttachmentUpload(q);
  code(() => c.handleUploadFormAttachmentChunk({ ...q, fileKey: 'primary', index: -1, base64: 'AAAA' }), 'VALIDATION_ERROR');
  code(() => c.handleFinalizeFormAttachmentFile({ ...q, fileKey: 'primary' }), 'NOT_FOUND');
  const script = Buffer.from('alert("renamed script")'); const bad = payload();
  bad.files = [descriptor('primary', 'report.pdf', 'application/pdf', script)];
  code(() => upload(bad, script), 'VALIDATION_ERROR');
  const mismatch = payload(); mismatch.files[0].sha256 = '0'.repeat(64);
  code(() => upload(mismatch), 'VALIDATION_ERROR');
});
test('same UUID cannot change immutable content and concurrent lease is rejected', () => {
  const q = payload(); c.handleBeginFormAttachmentUpload(q);
  code(() => c.handleBeginFormAttachmentUpload({ ...q, files: [{ ...q.files[0], sha256: '0'.repeat(64) }] }), 'VALIDATION_ERROR');
  h.env._internal.properties['ATT_LEASE_' + q.formId + '_' + q.attachmentId] = JSON.stringify({ token: 'other', expires: Date.now() + 600000 });
  code(() => c.handleBeginFormAttachmentUpload(q), 'UPLOAD_BUSY');
  delete h.env._internal.properties['ATT_LEASE_' + q.formId + '_' + q.attachmentId];
});
test('final authoritative CAS catches update during upload, cleans pending, preserves formal docs', () => {
  const q = payload(); upload(q);
  // On lease acquisition no change; on the final CAS lock inject concurrent save.
  h.onNextLock(() => h.onNextLock(() => { record.version = 2; }));
  code(() => c.handleFinalizeFormAttachment(q), 'VERSION_CONFLICT');
  assert.equal(c.findChildFolderByName(c.attRoot(record, false), '.pending-' + q.attachmentId), null);
  assert.equal(record.excelFileId, 'formal-excel'); assert.equal(record.pdfFileId, 'formal-pdf');
  assert.equal(record.version, 2); assert.equal(visible(1).length, 1);
});
test('inheritance and historical filtering also protect direct download', () => {
  record.version = 3; const q = payload(3); upload(q); c.handleFinalizeFormAttachment(q);
  assert.equal(visible(1).length, 1); assert.equal(visible(2).length, 1); assert.equal(visible(3).length, 2);
  code(() => c.handleGetFormAttachmentFileInfo({ formId: record.formId, attachmentId: q.attachmentId, version: 2 }), 'NOT_FOUND');
  code(() => c.handleBeginFormAttachmentUpload(p), 'VERSION_CONFLICT');
  assert.equal(visible(3).length, 2); assert.equal(record.version, 3);
});
test('photo PDF and compressed JPEGs publish as one logical package', () => {
  const q = payload(3), jpg = Buffer.from([255,216,255,224,1,2,3]);
  q.type = 'construction'; q.displayName = '施工照片紀錄_20260918.pdf';
  q.files = [descriptor('primary', q.displayName, 'application/pdf', file), descriptor('photo-1', '001.jpg', 'image/jpeg', jpg)];
  q.metadata = { projectName: '測試工程', constructionDate: '2026-09-18', location: '現場', workDescription: '施工', photoCount: 1,
    photos: [{ sequence: 1, description: '鋼筋', orientation: 'portrait', rotation: 90, archivedFileName: '001.jpg' }] };
  upload(q);
  code(() => c.handleFinalizeFormAttachment(q), 'VALIDATION_ERROR');
  c.handleUploadFormAttachmentChunk({ ...q, fileKey: 'photo-1', index: 0, base64: jpg.toString('base64') });
  c.handleFinalizeFormAttachmentFile({ ...q, fileKey: 'photo-1' }); c.handleFinalizeFormAttachment(q);
  const m = visible(3).filter(a => a.attachmentId === q.attachmentId); assert.equal(m.length, 1); assert.equal(m[0].metadata.photoCount, 1);
  const folder = c.findChildFolderByName(c.attRoot(record, false), q.attachmentId);
  assert.deepEqual(Buffer.from(c.attFile(c.findChildFolderByName(folder, 'photos'), '001.jpg').getBlob().getBytes()), jpg);
});
test('router exposes only intended attachment operations', () => {
  assert.equal(h.dispatch('listFormAttachments', { formId: record.formId, version: 3 }).ok, true);
  assert.equal(h.dispatch('deleteFormAttachment', p).error.code, 'UNKNOWN_ACTION');
  assert.equal(h.env._internal.spreadsheets.size, 0);
});
console.log(`Attachment backend: ${tests} targeted checks passed; no Sheet initialized or written.`);
