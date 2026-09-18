import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { attachmentEnvironment } from './attachment-environment.js';
const h = attachmentEnvironment(), c = h.context, record = h.addRecord();
const sessions = new Map(), completed = new Map(); let maxBytes = 0, lost = false, puts = 0, cancelled = 0;
const response = (code, body = {}, headers = {}) => ({ getResponseCode: () => code, getContentText: () => JSON.stringify(body), getAllHeaders: () => headers });
c.ScriptApp = { getOAuthToken: () => 'server-token' };
const fileProto = Object.getPrototypeOf(h.env.DriveApp.getFolderById('root').createFile(c.Utilities.newBlob('{}', 'application/json', 'test')));
fileProto.setContent = function(text) { this.blob = c.Utilities.newBlob(text, this.mimeType, this.name); return this; };
c.UrlFetchApp = { fetch(url, options) {
  assert.equal(h.events.at(-1)?.startsWith('lock'), false, 'UrlFetch must be outside global lock');
  assert.equal(options.headers.Authorization, 'Bearer server-token');
  if (url.includes('generateIds')) return response(200, { ids: [randomUUID()] });
  if (url.includes('uploadType=resumable')) {
    const metadata = JSON.parse(options.payload), session = 'https://www.googleapis.com/session/' + metadata.id;
    sessions.set(session, { metadata, size: Number(options.headers['X-Upload-Content-Length']), offset: 0 });
    return response(200, {}, { Location: session });
  }
  if (url.includes('/drive/v3/files/')) {
    const id = url.split('/files/')[1].split('?')[0];
    return completed.has(id) ? response(200, completed.get(id)) : response(404);
  }
  const state = sessions.get(url); assert.ok(state);
  if (options.method === 'delete') { cancelled++; sessions.delete(url); return response(204); }
  if (options.payload === '') return state.offset === state.size ? response(200, { size: String(state.size) }) : response(308, {}, state.offset ? { Range: 'bytes=0-' + (state.offset - 1) } : {});
  const bytes = options.payload.getBytes(); maxBytes = Math.max(maxBytes, bytes.length);
  const match = options.headers['Content-Range'].match(/bytes (\d+)-(\d+)\/(\d+)/);
  assert.equal(Number(match[1]), state.offset); assert.equal(Number(match[2]) + 1 - state.offset, bytes.length);
  state.offset += bytes.length; puts++;
  if (state.offset === state.size) {
    const folder = h.env.DriveApp.getFolderById(state.metadata.parents[0]);
    const file = folder.createFile(c.Utilities.newBlob([], state.metadata.mimeType, state.metadata.name));
    const oldId = file.id; file.id = state.metadata.id; file.getSize = () => state.size;
    h.env._internal.files.delete(oldId); h.env._internal.files.set(file.id, file);
    completed.set(file.id, { id: file.id, size: String(state.size) });
  }
  if (lost) { lost = false; throw new Error('lost response after Drive accepted bytes'); }
  return state.offset === state.size ? response(200, { size: String(state.size) }) : response(308, {}, { Range: 'bytes=0-' + (state.offset - 1) });
} };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function upload(size) {
  const p = { formId: record.formId, expectedVersion: 1, attachmentId: 'ATT-' + randomUUID(), type: 'general', displayName: 'test.pdf', metadata: null,
    files: [{ key: 'primary', fileName: 'test.pdf', mimeType: 'application/pdf', size, sha256: 'a'.repeat(64) }] };
  if (size > 10 * 1024 * 1024) {
    p.type = 'construction';
    p.files.push({ key:'photo-1',fileName:'001.jpg',mimeType:'image/jpeg',size:4,sha256:'b'.repeat(64) });
    p.metadata = { projectName:'test',constructionDate:'2026-09-18',location:'',workDescription:'',photoCount:1,photos:[{sequence:1,description:'',orientation:'portrait',rotation:0,archivedFileName:'001.jpg'}] };
  }
  c.handleBeginFormAttachmentUpload(p);
  for (let index = 0; index < size / c.ATT_CHUNK_SIZE; index++) {
    const bytes = Buffer.alloc(Math.min(c.ATT_CHUNK_SIZE, size - index * c.ATT_CHUNK_SIZE), 12); if (!index) bytes.write('%PDF-1.7');
    const q = { ...p, fileKey:'primary',index,base64:bytes.toString('base64'),chunkSha256:sha(bytes) };
    assert.throws(() => c.handleUploadFormAttachmentChunk({ ...q,chunkSha256:'0'.repeat(64) }), e => e.code === 'VALIDATION_ERROR');
    if (!index) { lost = true; assert.throws(() => c.handleUploadFormAttachmentChunk(q), /lost response/); }
    c.handleUploadFormAttachmentChunk(q); const before = puts; c.handleUploadFormAttachmentChunk(q); assert.equal(puts,before);
  }
  c.handleFinalizeFormAttachmentFile({ ...p,fileKey:'primary' });
  const pending = c.attPending(c.attRoot(record,false),p); const state = c.attSessionState(pending.folder,'primary');
  completed.get(state.fileId).size = '1';
  assert.throws(() => c.handleFinalizeFormAttachmentFile({ ...p,fileKey:'primary' }), e => e.code === 'VALIDATION_ERROR');
  completed.get(state.fileId).size = String(size);
  return p;
}
const general = upload(10 * 1024 * 1024); c.handleFinalizeFormAttachment(general);
const construction = upload(40 * 1024 * 1024);
const jpg = Buffer.from([255,216,255,224]);
c.handleUploadFormAttachmentChunk({ ...construction,fileKey:'photo-1',index:0,base64:jpg.toString('base64'),chunkSha256:sha(jpg) });
c.handleFinalizeFormAttachmentFile({ ...construction,fileKey:'photo-1' });
// Update only after assembly-free completion, at the final publish CAS lock.
h.onNextLock(() => h.onNextLock(() => { record.version = 2; }));
assert.throws(() => c.handleFinalizeFormAttachment(construction), e => e.code === 'VERSION_CONFLICT');
assert.ok(cancelled > 0); assert.equal(c.findChildFolderByName(c.attRoot(record,false),'.pending-' + construction.attachmentId),null);
assert.equal(record.excelFileId,'formal-excel'); assert.equal(record.pdfFileId,'formal-pdf');
assert.ok(maxBytes <= 2 * 1024 * 1024);
const source = fs.readFileSync(new URL('../AttachmentService.gs',import.meta.url),'utf8');
assert.equal(/bytes\s*=\s*bytes\.concat|bytes\.concat\(part\)/.test(source),false);
assert.equal(h.env._internal.spreadsheets.size,0);
console.log('PASS blocker upload: 10/40 MB, <=2MB buffers, chunk SHA mismatch, duplicate retry, lost response accepted offset, final size, conflict cleanup, formal files preserved, no lock across HTTP');
