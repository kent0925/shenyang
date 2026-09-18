import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const input = fs.readFileSync('tmp/attachments/example.heic').toString('base64');
const server = await createServer({ server: { host: '127.0.0.1', port: 5180 } });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  await page.route('**/api/backend', r => r.fulfill({ json: { ok: true, data: [] } }));
  await page.goto('http://127.0.0.1:5180');
  const results = await page.evaluate(async data => {
    const { importPhoto } = await import('/src/services/constructionPhotos.ts');
    const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
    const out = [];
    for (const extension of ['heic','heif']) {
      const photo = await importPhoto(new File([bytes], `test.${extension}`, { type: `image/${extension}` }));
      out.push({ mime: photo.blob.type, width: photo.width, height: photo.height, size: photo.blob.size });
    }
    return out;
  }, input);
  for (const r of results) { assert.equal(r.mime, 'image/jpeg'); assert.ok(r.width > 0 && r.height > 0 && r.size <= 1.2 * 1024 * 1024); }
  console.log('PASS HEIC/HEIF local conversion: ' + JSON.stringify(results));
} finally { await browser?.close(); await server.close(); }
