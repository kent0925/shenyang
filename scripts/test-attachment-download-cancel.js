import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { attachmentEnvironment } from '../gas/test/attachment-environment.js';

// New bounded-download/cancellation verification only. No production calls.
const h = attachmentEnvironment(), c = h.context;
const record = h.addRecord();
const bytes = Buffer.alloc(40 * 1024 * 1024, 71); bytes.write('%PDF-1.7');
const sha = createHash('sha256').update(bytes).digest('hex');
const attachmentId = 'ATT-' + randomUUID();
const folder = c.attLock(() => c.getOrCreateChildFolder(c.attRoot(record,true),attachmentId));
const file = folder.createFile(c.Utilities.newBlob([], 'application/pdf','large.pdf'));
file.getSize = () => bytes.length;
file.getBlob = () => { throw new Error('FORBIDDEN full attachment getBlob'); };
c.attJson(folder,'manifest.json',{attachmentId,type:'construction',displayName:'large.pdf',addedVersion:1,createdAt:new Date().toISOString(),
  primaryFile:{key:'primary',fileName:'large.pdf',mimeType:'application/pdf',size:bytes.length,sha256:sha},metadata:null});
const ranges = []; let cancelled = 0, maxBuffer = 0, mediaCode = 206, overrideLength = false;
const response = (code, data = {}, headers = {}, raw) => ({getResponseCode:()=>code,getAllHeaders:()=>headers,getContentText:()=>JSON.stringify(data),
  getBlob:() => { assert.ok(raw.length <= c.ATT_CHUNK_SIZE);maxBuffer=Math.max(maxBuffer,raw.length);return c.Utilities.newBlob(Array.from(raw),'application/octet-stream'); }});
c.ScriptApp = { getOAuthToken:()=> 'server-oauth' };
c.UrlFetchApp = { fetch(url,options) {
  assert.equal(options.headers.Authorization,'Bearer server-oauth');
  assert.equal(h.events.filter(e => e === 'lock' || e === 'unlock').at(-1),'unlock','no HTTP inside ScriptLock');
  if (url.endsWith('?alt=media')) {
    assert.ok(url.includes(encodeURIComponent(file.getId())));
    const [start,end] = options.headers.Range.slice(6).split('-').map(Number);
    ranges.push(options.headers.Range);const part=bytes.subarray(start,end+1);
    return response(mediaCode,{}, {'Content-Range':`bytes ${start}-${end}/${bytes.length}`,'Content-Length':overrideLength?'1':String(part.length)},part);
  }
  if (options.method==='delete') { cancelled++;return response(204); }
  if (options.method==='patch') {
    const id=decodeURIComponent(url.split('/files/')[1]);h.env.DriveApp.getFileById(id).setTrashed(true);return response(200);
  }
  throw new Error('Unexpected HTTP request '+url);
} };
const query = {formId:record.formId,version:1,attachmentId};
for (const index of [0,10,19]) {
  const result=c.handleGetFormAttachmentFileChunk({...query,index});assert.equal(Buffer.from(result.base64,'base64').length,c.ATT_CHUNK_SIZE);
}
assert.deepEqual(ranges,['bytes=0-2097151','bytes=20971520-23068671','bytes=39845888-41943039']);
assert.throws(()=>c.handleGetFormAttachmentFileChunk({...query,index:0,fileId:'client-id'}),e=>e.code==='VALIDATION_ERROR');
mediaCode=200;assert.throws(()=>c.handleGetFormAttachmentFileChunk({...query,index:0}),e=>e.code==='DOWNLOAD_FAILED');mediaCode=206;
overrideLength=true;assert.throws(()=>c.handleGetFormAttachmentFileChunk({...query,index:0}),e=>e.code==='VALIDATION_ERROR');overrideLength=false;
// Single-chunk 200 fallback is checked with a separate server-resolved file.
const small=folder.createFile(c.Utilities.newBlob([], 'application/pdf','small.pdf'));small.getSize=()=>7;small.getBlob=()=>{throw Error('full read');};
const originalDownload=c.attDownload;
c.attDownload=()=>({info:{size:7},file:small});const originalFetch=c.UrlFetchApp.fetch;
c.UrlFetchApp.fetch=(_,o)=>{assert.equal(o.headers.Range,'bytes=0-6');return response(200,{}, {'Content-Length':'7'},Buffer.from('%PDF-17'));};
assert.equal(Buffer.from(c.handleGetFormAttachmentFileChunk({index:0}).base64,'base64').length,7);
c.attDownload=originalDownload;c.UrlFetchApp.fetch=originalFetch;

function pendingPackage(formId,expectedVersion,attachmentId) {
  const p={formId,expectedVersion,attachmentId,type:'general',displayName:'pending.pdf',metadata:null,
    files:[{key:'primary',fileName:'pending.pdf',mimeType:'application/pdf',size:100,sha256:'a'.repeat(64)}]};
  c.handleBeginFormAttachmentUpload(p);
  const pending=c.attPending(c.attRoot(h.records.get(formId),false),p).folder;
  const temp=pending.createFile(c.Utilities.newBlob([1,2,3],'application/pdf','file'));
  c.attJson(pending,'.session-primary.json',{fileId:temp.getId(),url:'https://www.googleapis.com/mock-session'});
  return {p,pending,temp};
}
const cancelRecord=h.addRecord('FRM-2026-000002');
const package1=pendingPackage(cancelRecord.formId,1,'ATT-'+randomUUID());cancelRecord.version=2;
assert.equal(c.handleCancelFormAttachmentUpload(package1.p).cancelled,true);
assert.equal(package1.pending.isTrashed(),true);assert.equal(package1.temp.isTrashed(),true);assert.equal(cancelled,1);
assert.equal(c.handleCancelFormAttachmentUpload(package1.p).cancelled,true);
assert.equal(c.handleCancelFormAttachmentUpload({...query,expectedVersion:1}).cancelled,true);assert.equal(folder.isTrashed(),false);
const busy=pendingPackage(cancelRecord.formId,2,'ATT-'+randomUUID());
h.env._internal.properties['ATT_LEASE_'+busy.p.formId+'_'+busy.p.attachmentId]=JSON.stringify({token:'upload',expires:Date.now()+600000});
assert.throws(()=>c.handleCancelFormAttachmentUpload(busy.p),e=>e.code==='UPLOAD_BUSY');assert.equal(busy.pending.isTrashed(),false);
delete h.env._internal.properties['ATT_LEASE_'+busy.p.formId+'_'+busy.p.attachmentId];

const server=await createServer({server:{host:'127.0.0.1',port:5182}});await server.listen();let browser;
try {
  browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
  let failedCancel=true, saved, frontendPackage;const calls=[];const alerts=[];
  page.on('dialog',d=>{alerts.push(d.message());void d.accept();});
  await page.route('**/src/generators/excel/sealApprovalExcel.ts',r=>r.fulfill({contentType:'application/javascript',body:'export async function generateSealApprovalExcel(){return new Blob(["mock excel"])}'}));
  await page.route('**/src/generators/pdf/pdfHelper.ts',r=>r.fulfill({contentType:'application/javascript',body:'export async function generatePdfFromElement(){return new Blob(["mock pdf"])}'}));
  await page.route('**/api/backend',r=>{
    const {action,payload}=r.request().postDataJSON();calls.push(action);let result={ok:true,data:{}};
    if (action==='saveForm') {saved={...payload,formId:'FRM-2026-000003',version:1};h.addRecord(saved.formId);result.data=saved;}
    else if (action==='beginFormAttachmentUpload') {
      frontendPackage=pendingPackage(payload.formId,payload.expectedVersion,payload.attachmentId);
      result={ok:false,error:{code:'UPLOAD_FAILED',message:'mock failure after session created'}};
    } else if (action==='cancelFormAttachmentUpload' && failedCancel) return r.abort('failed');
    else if (action==='listForms') result.data=saved?[{...saved,formId:'FRM-2026-000004',company:'別筆表單'}]:[];
    else if (action==='getForm') result.data={...saved,formId:'FRM-2026-000004'};
    else if (/^(cancelFormAttachmentUpload|getFormAttachmentFileInfo|getFormAttachmentFileChunk)$/.test(action)) result=h.dispatch(action,payload);
    else if (action.startsWith('list')) result.data=[];
    return r.fulfill({json:result});
  });
  await page.goto('http://127.0.0.1:5182');
  const rebuilt=await page.evaluate(async q=>{const {downloadAttachment}=await import('/src/services/formAttachments.ts');const r=await downloadAttachment(q.formId,q.version,q.attachmentId);return {size:r.blob.size,name:r.fileName};},query);
  assert.deepEqual(rebuilt,{size:bytes.length,name:'large.pdf'}); // downloadAttachment verifies SHA + size itself
  await page.getByPlaceholder('例如：紅淡山鑽探工程報價、辦公室租賃合約續約').fill('cancel lifecycle');
  await page.getByLabel('一般附件',{exact:true}).setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7')});
  await page.getByRole('button',{name:'存檔',exact:true}).click();await page.getByRole('button',{name:'重試附件',exact:true}).waitFor();
  await page.getByRole('button',{name:'開新表單',exact:true}).click();assert.equal(alerts.at(-1),'尚有失敗附件，請先重試或移除後再繼續。');
  await page.getByRole('button',{name:'表單紀錄',exact:true}).click();
  await page.getByRole('button',{name:'開啟',exact:true}).first().click();
  await page.waitForTimeout(100);assert.equal(alerts.at(-1),'尚有失敗附件，請先重試或移除後再繼續。');
  await page.getByRole('button',{name:'用印／簽呈',exact:true}).click();
  await page.getByRole('button',{name:'移除',exact:true}).click();await page.getByText('附件暫存清理失敗，請再試一次。',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'重試附件',exact:true}).count(),1);assert.equal(frontendPackage.pending.isTrashed(),false);
  failedCancel=false;h.records.get(saved.formId).version=2; // stale-version cancellation still cleans
  await page.getByRole('button',{name:'移除',exact:true}).click();
  await page.getByRole('button',{name:'重試附件',exact:true}).waitFor({state:'detached'});
  assert.equal(frontendPackage.pending.isTrashed(),true);assert.equal(frontendPackage.temp.isTrashed(),true);
  assert.equal(await page.getByLabel('一般附件',{exact:true}).isEnabled(),true);
  assert.ok(calls.includes('cancelFormAttachmentUpload'));
  assert.equal(maxBuffer,c.ATT_CHUNK_SIZE);
  console.log('PASS new targeted download/cancel: 40MB Range/rebuild SHA, <=2MB, client ID rejected, 206/200 validation, cancel cleanup/idempotence/published protection/lease, network failure retains retry, reset/load guards');
} finally {await browser?.close();await server.close();}
