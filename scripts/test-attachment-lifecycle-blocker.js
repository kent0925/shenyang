import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const server = await createServer({ server: { host:'127.0.0.1',port:5181 } }); await server.listen();
let browser;
try {
  browser = await chromium.launch({ channel:'chrome',headless:true });
  const page = await browser.newPage(); const calls = []; let version = 0, fail = true;
  await page.route('**/src/generators/excel/sealApprovalExcel.ts',r => r.fulfill({ contentType:'application/javascript',body:'export async function generateSealApprovalExcel(){return new Blob(["formal excel"])}' }));
  await page.route('**/src/generators/pdf/pdfHelper.ts',r => r.fulfill({ contentType:'application/javascript',body:'export async function generatePdfFromElement(){return new Blob(["formal pdf"])}' }));
  await page.route('**/api/backend',r => {
    const {action,payload} = r.request().postDataJSON(); calls.push(action);
    let data = {};
    if (action === 'saveForm') data = { ...payload,formId:'FRM-2026-000001',version:++version };
    if (action === 'listFormAttachments') data = [];
    if (action === 'beginFormAttachmentUpload') {
      if (fail) return r.fulfill({ status:500,json:{ok:false,error:{code:'UPLOAD_FAILED',message:'mock upload failure'}} });
      data = {published:true};
    }
    return r.fulfill({json:{ok:true,data}});
  });
  const alerts = []; page.on('dialog',d => { alerts.push(d.message()); void d.accept(); });
  await page.goto('http://127.0.0.1:5181');
  await page.getByPlaceholder('例如：紅淡山鑽探工程報價、辦公室租賃合約續約').fill('附件 lifecycle test');
  await page.getByLabel('一般附件',{exact:true}).setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7')});
  await page.getByRole('button',{name:'存檔',exact:true}).click();
  await page.getByRole('button',{name:'重試附件',exact:true}).waitFor();
  assert.equal(version,1);
  const before = calls.length;
  await page.getByRole('button',{name:'存檔',exact:true}).click();
  assert.equal(alerts.at(-1),'尚有附件上傳失敗，請先重試或移除失敗附件。');
  assert.equal(calls.slice(before).includes('saveForm'),false); assert.equal(version,1);
  assert.equal(await page.getByLabel('一般附件',{exact:true}).isDisabled(),true);
  assert.equal(await page.getByRole('button',{name:'＋ 施工照片紀錄'}).isDisabled(),true);
  await page.getByRole('button',{name:'重試附件',exact:true}).click();
  await page.getByText('mock upload failure',{exact:true}).waitFor(); assert.equal(version,1);
  await page.getByRole('button',{name:'移除',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'重試附件',exact:true}).count(),0);
  assert.equal(await page.getByLabel('一般附件',{exact:true}).isEnabled(),true);
  fail = false;
  await page.getByRole('button',{name:'存檔',exact:true}).click();
  await page.waitForFunction(() => document.body.innerText.includes('表單已完成：'));
  assert.equal(version,2);
  console.log('PASS blocker lifecycle: failed save guarded, new attachments disabled, retry no save/version increment, failed discard clears retry, normal save restored');
  const pdfs = await page.evaluate(async () => {
    const m = await import('/src/services/constructionPhotos.ts');
    const photos = [];
    for (let i=0;i<7;i++) {
      const canvas=document.createElement('canvas'); canvas.width=i%2?800:1200; canvas.height=i%2?1200:800;
      const ctx=canvas.getContext('2d');ctx.fillStyle=i%2?'#def':'#fde';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.strokeStyle='#d00';ctx.lineWidth=30;ctx.strokeRect(15,15,canvas.width-30,canvas.height-30);
      ctx.fillStyle='#123';ctx.font='bold 90px sans-serif';ctx.fillText('PHOTO '+(i+1),70,150);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.82));
      const photo=await m.importPhoto(new File([blob],i+'.jpg',{type:'image/jpeg'}));
      photo.description='照片 '+(i+1)+'：'+(i%2?'直拍施工細節':'橫拍施工全景')+'，紅框完整可見。';photos.push(photo);
    }
    const fields={projectName:'神揚建設－施工照片紀錄測試工程',constructionDate:'2026-09-18',location:'施工現場',workDescription:'第一行：鋼筋綁紮與模板組立。\n第二行：同頁混合橫拍與直拍。\n第三行：檢查施工照片與對應說明。'};
    const out=[];
    for(const count of [6,7]) { const result=await m.buildConstructionAttachment(fields,photos.slice(0,count)); const bytes=new Uint8Array(await result.attachment.files[0].blob.arrayBuffer());let text='';for(const b of bytes)text+=String.fromCharCode(b);out.push(btoa(text)); }
    return out;
  });
  fs.mkdirSync('sample-outputs/attachment-review',{recursive:true});
  pdfs.forEach((data,i)=>fs.writeFileSync('sample-outputs/attachment-review/'+[6,7][i]+'.pdf',Buffer.from(data,'base64')));
  console.log('Created local 6/7 photo PDFs for rendered inspection');
} finally { await browser?.close();await server.close(); }
