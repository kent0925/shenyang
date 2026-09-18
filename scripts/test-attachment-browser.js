import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

// Local synthetic images and mocked API only; never contacts production.
const server = await createServer({ server: { host: '127.0.0.1', port: 5179 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.route('**/api/backend', route => route.fulfill({ json: { ok: true, data: [] } }));
  await page.goto('http://127.0.0.1:5179');
  await page.getByRole('button', { name: '＋ 施工照片紀錄' }).waitFor();
  const result = await page.evaluate(async () => {
    const m = await import('/src/services/constructionPhotos.ts');
    const a = await import('/src/services/formAttachments.ts');
    const make = async (width, height, name) => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#357'; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#f00'; ctx.fillRect(0, 0, 100, 100);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      return new File([blob], name, { type: 'image/png' });
    };
    const originals = [await make(3000, 2000, 'landscape.png'), await make(2000, 3000, 'portrait.png')];
    const photos = await Promise.all(originals.map(m.importPhoto));
    photos[0].description = 'landscape description'; photos[1].description = 'portrait description';
    const rotated = await m.rotatePhoto(photos[0], 90);
    const reordered = m.reorderPhotos(photos, 0, 1);
    const fields = { projectName: '測試工程', constructionDate: '2026-09-18', location: '施工現場', workDescription: '混合橫拍與直拍驗證' };
    const six = await m.buildConstructionAttachment(fields, Array.from({ length: 6 }, (_, i) => photos[i % 2]));
    const seven = await m.buildConstructionAttachment(fields, Array.from({ length: 7 }, (_, i) => photos[i % 2]));
    const pdf = new TextDecoder('latin1').decode(await seven.attachment.files[0].blob.arrayBuffer());
    const failed = { ...a.generalAttachment(new File(['%PDF-1.7'], 'test.pdf', { type: 'application/pdf' })), status: 'failed' };
    const calls = [];
    const realFetch = window.fetch;
    window.fetch = async (_, options) => {
      const body = JSON.parse(options.body); calls.push(body.action);
      return new Response(JSON.stringify({ ok: false, error: { code: 'VERSION_CONFLICT', message: 'conflict' } }), { status: 409 });
    };
    const retry = await a.retryAttachments({ formId: 'FRM-2026-000001', version: 1, attachments: [failed] }, () => {});
    window.fetch = realFetch;
    return {
      orientations: photos.map(p => p.orientation), dimensions: photos.map(p => [p.width, p.height]),
      compressed: photos.every(p => p.blob.type === 'image/jpeg' && p.blob.size <= 1.2 * 1024 * 1024),
      rotated: [rotated.orientation, rotated.rotation, rotated.width, rotated.height],
      description: reordered[0].description, pages: [six.pages.length, seven.pages.length],
      pdfPages: (pdf.match(/\/Type \/Page\b/g) || []).length,
      originalsStored: seven.attachment.files.some(f => originals.includes(f.blob)),
      archivedPhotos: seven.attachment.files.slice(1).every((f, i) => f.blob === photos[i % 2].blob),
      contain: m.contain(100, 200, 0, 0, 100, 100), calls,
      conflict: retry[0].error === a.ATTACHMENT_CONFLICT,
    };
  });
  assert.deepEqual(result.orientations, ['landscape', 'portrait']);
  assert.deepEqual(result.dimensions, [[1800,1200], [1200,1800]]);
  assert.equal(result.compressed, true);
  assert.deepEqual(result.rotated, ['portrait',90,1200,1800]);
  assert.equal(result.description, 'portrait description');
  assert.deepEqual(result.pages, [1,2]); assert.equal(result.pdfPages, 2);
  assert.equal(result.originalsStored, false); assert.equal(result.archivedPhotos, true);
  assert.deepEqual(result.contain, { x:25,y:0,width:50,height:100 });
  assert.deepEqual(result.calls, ['beginFormAttachmentUpload']); assert.equal(result.conflict, true);
  await page.getByRole('button', { name: '＋ 施工照片紀錄' }).click();
  await page.getByRole('dialog').waitFor();
  assert.equal(await page.getByLabel('施工日期', { exact: true }).inputValue() !== '', true);
  console.log('PASS attachment browser: mixed orientation, compression, rotation, reorder/description, 6/7 pagination, PDF, contain, processed-only archive, independent conflict retry, shared UI');
} finally { await browser?.close(); await server.close(); }
