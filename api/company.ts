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
    return res.status(400).json({ error: '請提供合法的 8 位數字統一編號', found: false });
  }

  try {
    // 轉送至經濟部商業發展署商工登記公開資料 API
    const gcisUrl = `https://data.gcis.nat.gov.tw/od/data/api/5F64D864-61CB-4D0D-8AD9-492047CC1EA6?$format=json&$filter=Business_Accounting_NO%20eq%20${taxId}`;
    
    const response = await fetch(gcisUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: '政府商工登記服務連線異常', found: false });
    }

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0 && data[0].Company_Name) {
      const companyName = data[0].Company_Name.trim();
      return res.status(200).json({
        found: true,
        taxId,
        companyName
      });
    }

    // 查無資料
    return res.status(200).json({
      found: false,
      taxId
    });
  } catch (error: any) {
    return res.status(500).json({
      error: '伺服器查詢失敗：' + (error.message || error),
      found: false
    });
  }
}
