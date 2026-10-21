export default async function handler(req: any, res: any) {
  // 設定 CORS 標頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const taxId = (req.query?.taxId as string || '').trim();

  // 僅接受 8 碼純數字統一編號
  if (!taxId || !/^\d{8}$/.test(taxId)) {
    return res.status(200).json({ error: '請提供合法的 8 位數字統一編號', found: false });
  }

  try {
    // 設定 6 秒超時控制器，防止政府 API 延遲卡死
    const fetchWithTimeout = async (url: string, timeoutMs = 6000) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Accept': 'application/json'
          }
        });
        clearTimeout(timer);
        return response;
      } catch (err) {
        clearTimeout(timer);
        return null;
      }
    };

    // 1. 先呼叫經濟部官方分類 API (統編查是否為公司、分公司及商業)
    const typeUrl = `https://data.gcis.nat.gov.tw/od/data/api/673F0FC0-B3A7-429F-9041-E9866836B66D?$format=json&$filter=Business_Accounting_NO%20eq%20${taxId}`;
    const typeRes = await fetchWithTimeout(typeUrl, 6000);

    if (!typeRes || !typeRes.ok) {
      // 官方商工伺服器異常或超時，安全降級回傳 200 found: false，不噴 502
      return res.status(200).json({
        found: false,
        taxId,
        error: '政府商工登記服務暫時連線異常或超時，請手動輸入廠商名稱。'
      });
    }

    const typeList = await typeRes.json().catch(() => null);
    let entityType: 'company' | 'branch' | 'business' | 'unknown' = 'unknown';

    if (Array.isArray(typeList)) {
      const match = typeList.find((item: any) => item.exist === 'Y');
      if (match) {
        if (match.TYPE === '公司') entityType = 'company';
        else if (match.TYPE === '商業') entityType = 'business';
        else if (match.TYPE === '分公司') entityType = 'branch';
      }
    }

    // 2. 依分類結果呼叫對應的官方資料來源
    if (entityType === 'company') {
      // 公司登記基本資料 API
      const companyUrl = `https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6?$format=json&$filter=Business_Accounting_NO%20eq%20${taxId}`;
      const cRes = await fetchWithTimeout(companyUrl, 6000);
      if (cRes && cRes.ok) {
        const cData = await cRes.json().catch(() => null);
        if (Array.isArray(cData) && cData.length > 0 && cData[0].Company_Name) {
          const name = cData[0].Company_Name.trim();
          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
          return res.status(200).json({
            found: true,
            taxId,
            entityType: 'company',
            name,
            companyName: name // 相容既有欄位
          });
        }
      }
    } else if (entityType === 'business') {
      // 商業登記基本資料-應用三 API
      const businessUrl = `https://data.gcis.nat.gov.tw/od/data/api/426D5542-5F05-43EB-83F9-F1300F14E1F1?$format=json&$filter=President_No%20eq%20${taxId}`;
      const bRes = await fetchWithTimeout(businessUrl, 6000);
      if (bRes && bRes.ok) {
        const bData = await bRes.json().catch(() => null);
        if (Array.isArray(bData) && bData.length > 0 && bData[0].Business_Name) {
          const name = bData[0].Business_Name.trim();
          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
          return res.status(200).json({
            found: true,
            taxId,
            entityType: 'business',
            name,
            companyName: name // 相容既有欄位
          });
        }
      }
    } else if (entityType === 'branch') {
      // 分公司登記 API
      const branchUrl = `https://data.gcis.nat.gov.tw/od/data/api/DC9AC6C1-38CC-479A-A492-088BD8C3328E?$format=json&$filter=Branch_Office_Business_Accounting_NO%20eq%20${taxId}`;
      const brRes = await fetchWithTimeout(branchUrl, 6000);
      if (brRes && brRes.ok) {
        const brData = await brRes.json().catch(() => null);
        if (Array.isArray(brData) && brData.length > 0 && brData[0].Branch_Office_Name) {
          const name = brData[0].Branch_Office_Name.trim();
          res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
          return res.status(200).json({
            found: true,
            taxId,
            entityType: 'branch',
            name,
            companyName: name
          });
        }
      }

      return res.status(200).json({
        found: false,
        taxId,
        entityType: 'branch'
      });
    }

    // 查無資料
    return res.status(200).json({
      found: false,
      taxId,
      entityType: 'unknown'
    });
  } catch (error: any) {
    // 伺服器捕捉所有例外，一律回傳 200，絕不在瀏覽器噴 502 / 500
    return res.status(200).json({
      found: false,
      taxId,
      error: '伺服器查詢服務暫時繁忙，請手動輸入廠商名稱。'
    });
  }
}
