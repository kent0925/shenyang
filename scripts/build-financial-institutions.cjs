const fs = require('fs');
const path = require('path');

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchFsc6041() {
  console.log('[1/3] 正在下載金管會 6041 官方金融機構基本資料...');
  const res = await fetch('https://stat.fsc.gov.tw/api/v1/public/datasets/6041/export', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) throw new Error(`下載金管會資料失敗: HTTP ${res.status}`);
  const text = await res.text();
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

async function fetchCbcData(bankType) {
  console.log(`[2/3] 正在從中央銀行抓取官方 [${bankType}] 資料...`);
  const url = 'https://www.cbc.gov.tw/tw/sp-bank-qresult-1.html';
  const body = new URLSearchParams({
    CKBCheckBankType: '1',
    DDLBankType: bankType,
    CKBCheckDomestic: '1',
    RBTDomesticType: 'org',
    DDLDomesticType: '總機構別'
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0'
    },
    body: body.toString()
  });

  if (!res.ok) throw new Error(`央行查詢失敗: HTTP ${res.status}`);
  const json = await res.json();
  if (json.Result !== 'success') throw new Error(`央行查詢失敗: ${json.Result}`);
  return json.Content || '';
}

function parseCbcHtml(html, type) {
  const trMatches = html.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  const institutions = new Map();

  for (const tr of trMatches) {
    if (tr.includes('<th>') || !tr.includes('data-title="代號"') || !tr.includes('[總機構]')) continue;
    const codeMatch = tr.match(/(\d{7})/);
    if (!codeMatch) continue;
    const fullCode = codeMatch[1];
    const instCode = fullCode.slice(0, 3);
    const nameMatch = tr.match(/data-title="名稱"[^>]*>([\s\S]*?)<\/td>/);
    let rawName = nameMatch ? stripHtml(nameMatch[1]) : '';
    if (!institutions.has(instCode)) {
      institutions.set(instCode, {
        code: instCode,
        name: rawName,
        type: type,
        branches: []
      });
    }
  }

  for (const tr of trMatches) {
    if (tr.includes('<th>') || !tr.includes('data-title="代號"') || tr.includes('[總機構]')) continue;
    const codeMatch = tr.match(/(\d{7})/);
    if (!codeMatch) continue;
    const fullCode = codeMatch[1];
    const instCode = fullCode.slice(0, 3);
    const branchCode = fullCode.slice(3);

    const nameMatch = tr.match(/data-title="名稱"[^>]*>([\s\S]*?)<\/td>/);
    let rawName = nameMatch ? stripHtml(nameMatch[1]) : '';
    const addrMatch = tr.match(/data-title="地址"[^>]*>([\s\S]*?)<\/td>/);
    const address = addrMatch ? stripHtml(addrMatch[1]) : '';

    const inst = institutions.get(instCode);
    if (inst) {
      let bName = rawName;
      const cleanInstName = inst.name.replace(/信用部|農會|漁會/g, '');
      if (bName.startsWith(inst.name)) {
        bName = bName.slice(inst.name.length).trim();
      } else if (cleanInstName && bName.startsWith(cleanInstName)) {
        bName = bName.slice(cleanInstName.length).trim();
      }
      if (!bName) {
        bName = branchCode.endsWith('1') || branchCode === '0010' ? '信用部本部' : rawName;
      }

      if (!inst.branches.some(b => b.code === branchCode)) {
        inst.branches.push({
          code: branchCode,
          fullCode: fullCode,
          name: bName,
          address: address
        });
      }
    }
  }

  for (const inst of institutions.values()) {
    if (inst.branches.length === 0) {
      inst.branches.push({
        code: '0010',
        fullCode: inst.code + '0010',
        name: '信用部本部',
        address: ''
      });
    }
  }

  return Array.from(institutions.values());
}

async function build() {
  const fetchDate = new Date().toISOString().split('T')[0];
  console.log(`=== 開始建置金融機構資料庫 (抓取日期: ${fetchDate}) ===\n`);

  // 1. 金管會 6041
  const fscLines = await fetchFsc6041();
  const fscRawHeadMap = new Map();
  let fscRawBranchCount = 0;

  for (let i = 1; i < fscLines.length; i++) {
    const parts = fscLines[i].split(',');
    if (parts.length < 6) continue;
    const addr = parts[1] || '';
    const branchFullCode = parts[2] || '';
    const name = parts[3] || '';
    const headCode = parts[5] || '';
    if (!headCode) continue;

    fscRawBranchCount++;
    if (!fscRawHeadMap.has(headCode)) {
      fscRawHeadMap.set(headCode, { code: headCode, headName: '', branches: [] });
    }
    const item = fscRawHeadMap.get(headCode);
    if (!branchFullCode || branchFullCode === headCode) {
      item.headName = name;
    }
    item.branches.push({ branchFullCode, name, addr });
  }

  const rawTotalFscHeads = fscRawHeadMap.size;
  console.log(`金管會原始總機構數: ${rawTotalFscHeads}，原始分支行筆數: ${fscRawBranchCount}`);

  // 過濾金管會中與匯款無關的機構：
  // 排除條件：
  // - 總代號非 3 碼純數字 (排除辦事處 R/L 開頭、證券 S 開頭、8 碼移工公司)
  // - 票券公司 (名稱含 票券)
  // - 信用卡公司 (名稱含 信用卡、卡股份有限公司、聯合信用卡、威士卡、萬事達卡、吉世美、美國運通)
  // - 金融控股公司 (名稱含 金融控股、金控、代號 251~266)
  // - 電子支付/電子票證 (名稱含 支付、悠遊卡、一卡通、愛金卡、橘子支、街口、歐付寶)
  const filteredFscInstitutions = new Map();

  for (const [code, item] of fscRawHeadMap.entries()) {
    if (!/^\d{3}$/.test(code)) continue; // 必須為 3 碼數字

    const headName = item.headName || item.branches[0]?.name || '';
    if (!headName) continue;

    // 排除檢查
    if (headName.includes('票券')) continue;
    if (headName.includes('信用卡') || headName.includes('卡股份有限公司') || headName.includes('聯合信用卡') || headName.includes('威士卡') || headName.includes('萬事達卡') || headName.includes('吉世美') || headName.includes('美國運通')) continue;
    if (headName.includes('金融控股') || (parseInt(code, 10) >= 251 && parseInt(code, 10) <= 266)) continue;
    if (headName.includes('支付') || headName.includes('悠遊卡') || headName.includes('一卡通') || headName.includes('愛金卡') || headName.includes('橘子支') || headName.includes('街口') || headName.includes('歐付寶')) continue;
    if (headName.includes('證券') || headName.includes('期貨') || headName.includes('人壽') || headName.includes('產物保險') || headName.includes('再保險')) continue;

    // 判斷機構類型
    let type = 'bank';
    if (headName.includes('信用合作社')) {
      type = 'credit_coop';
    } else if (headName.includes('美商') || headName.includes('日商') || headName.includes('法商') || headName.includes('新加坡') || headName.includes('香港') || headName.includes('大陸') || headName.includes('瑞士') || headName.includes('英商') || headName.includes('德商') || headName.includes('澳商') || headName.includes('加拿大') || headName.includes('泰國') || headName.includes('菲律賓') || headName.includes('印尼') || headName.includes('西班牙') || headName.includes('荷蘭') || headName.includes('韓商')) {
      type = 'foreign_bank';
    }

    const cleanInst = {
      code,
      name: headName,
      type,
      branches: []
    };

    const cleanHeadName = headName.replace(/股份有限公司|有限公司|有限責任/g, '').trim();

    for (const b of item.branches) {
      if (!b.branchFullCode || b.branchFullCode === code) continue; // 總行本身不作分行

      let bCode = b.branchFullCode.slice(3);
      let bName = b.name;
      if (cleanHeadName && bName.startsWith(cleanHeadName)) {
        bName = bName.slice(cleanHeadName.length).trim();
      }

      cleanInst.branches.push({
        code: bCode,
        fullCode: b.branchFullCode,
        name: bName || b.name,
        address: b.addr
      });
    }

    // 若分行列表為空（如部分外銀僅有台北分行），補其代表分行
    if (cleanInst.branches.length === 0) {
      cleanInst.branches.push({
        code: '0010',
        fullCode: code + '0010',
        name: headName.includes('分行') ? headName : '台北分行',
        address: item.branches[0]?.addr || ''
      });
    }

    filteredFscInstitutions.set(code, cleanInst);
  }

  console.log(`金管會過濾後匯款總機構數: ${filteredFscInstitutions.size}`);

  // 2. 央行農會與漁會
  const agHtml = await fetchCbcData('05農會信用部');
  const agList = parseCbcHtml(agHtml, 'agricultural_association');

  const fishHtml = await fetchCbcData('06漁會信用部');
  const fishList = parseCbcHtml(fishHtml, 'fishery_association');

  // 3. 中華郵政
  const postInstitution = {
    code: '700',
    name: '中華郵政股份有限公司',
    type: 'post',
    branches: [
      {
        code: '0021',
        fullCode: '7000021',
        name: '郵政存簿儲金',
        address: '台北市大安區金山南路二段55號'
      },
      {
        code: '0010',
        fullCode: '7000010',
        name: '郵政劃撥儲金',
        address: '台北市大安區金山南路二段55號'
      }
    ]
  };

  // 4. 跨來源合併與去重
  const beforeMergeCount = filteredFscInstitutions.size + agList.length + fishList.length + 1;
  const mergedMap = new Map();

  for (const [code, inst] of filteredFscInstitutions.entries()) {
    mergedMap.set(code, inst);
  }
  for (const inst of agList) {
    mergedMap.set(inst.code, inst);
  }
  for (const inst of fishList) {
    mergedMap.set(inst.code, inst);
  }
  mergedMap.set('700', postInstitution);

  const allInstitutions = Array.from(mergedMap.values()).sort((a, b) => a.code.localeCompare(b.code));

  // 統計
  const stats = {
    fetchDate,
    sources: [
      '金融監督管理委員會 (FSC 6041 金融機構基本資料)',
      '中央銀行 (CBC 全國金融機構查詢系統：05農會信用部、06漁會信用部)',
      '中華郵政跨行通匯連線代碼 (7000021 存簿 / 7000010 劃撥)'
    ],
    beforeDeduplication: {
      institutions: beforeMergeCount,
      fscRawInstitutions: rawTotalFscHeads,
      fscFilteredInstitutions: filteredFscInstitutions.size,
      agInstitutions: agList.length,
      fishInstitutions: fishList.length,
      postInstitutions: 1
    },
    afterDeduplication: {
      totalInstitutions: allInstitutions.length,
      totalBranches: 0,
      byType: {
        bank: 0,
        foreign_bank: 0,
        credit_coop: 0,
        agricultural_association: 0,
        fishery_association: 0,
        post: 0,
        other: 0
      }
    }
  };

  for (const inst of allInstitutions) {
    stats.afterDeduplication.totalBranches += inst.branches.length;
    stats.afterDeduplication.byType[inst.type] = (stats.afterDeduplication.byType[inst.type] || 0) + 1;
  }

  console.log('\n=== 金融機構完整資料統計 ===');
  console.log('資料抓取日期:', stats.fetchDate);
  console.log('各資料來源:', stats.sources);
  console.log('去重前總機構數 (各來源加總):', stats.beforeDeduplication.institutions);
  console.log('去重後總機構數:', stats.afterDeduplication.totalInstitutions);
  console.log('去重後總分支機構數:', stats.afterDeduplication.totalBranches);
  console.log('各類型統計:', JSON.stringify(stats.afterDeduplication.byType, null, 2));

  // 寫入專案 public/data/banks.json
  const targetDir = 'C:/Users/user/Desktop/網頁用/公司/public/data';
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  const outputPath = path.join(targetDir, 'banks.json');
  fs.writeFileSync(outputPath, JSON.stringify(allInstitutions, null, 2), 'utf8');
  console.log(`\n已更新檔案: ${outputPath}`);

  const statsPath = 'C:/Users/user/.gemini/antigravity/brain/2e2cc9e1-1e0c-46a5-8c39-804b88f07125/scratch/financial_stats.json';
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2), 'utf8');

  // 同步腳本至專案 scripts/
  const projectScript = 'C:/Users/user/Desktop/網頁用/公司/scripts/build-financial-institutions.cjs';
  fs.copyFileSync(__filename, projectScript);
  console.log(`已同步腳本至: ${projectScript}`);
}

build().catch(err => {
  console.error('建置金融機構資料失敗:', err);
  process.exit(1);
});
