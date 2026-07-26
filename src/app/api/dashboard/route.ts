import { NextResponse } from 'next/server';
import { readDashboardDataFromGAS } from '@/lib/google-sheets';
import { getSetting, savePortfolioCache, CachedAsset } from '@/lib/db';
import path from 'path';
import fs from 'fs';

function parseNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  if (!str || str === 'nan' || str === 'NaN') return 0;
  const cleaned = str.replace(/,/g, '').replace(/₩/g, '').replace(/\s/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parsePercent(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  const hasPercent = str.includes('%');
  const cleaned = str.replace(/%/g, '').replace(/,/g, '').replace(/\s/g, '');
  let num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  
  if (!hasPercent && Math.abs(num) <= 1.0 && num !== 0) {
    num = num * 100;
  }
  return num;
}

export async function GET() {
  try {
    let balanceRows: any[][] = [];
    let dividendSummaryRows: any[][] = [];
    let dividendDetailRows: any[][] = [];

    // Attempt 1: Fetch via Google Sheets API v4 (OAuth 2.0 Authenticated)
    try {
      const { getAuthenticatedSheetsClient } = await import('@/lib/google-auth');
      const sheetsClient = await getAuthenticatedSheetsClient();
      let spreadsheetId = await getSetting('google_spreadsheet_id');
      
      // Extract spreadsheet ID if full URL was provided
      if (spreadsheetId && spreadsheetId.includes('/d/')) {
        const match = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
        if (match) spreadsheetId = match[1];
      }

      if (sheetsClient && spreadsheetId) {
        const resBalance = await sheetsClient.spreadsheets.values.get({
          spreadsheetId,
          range: '종합잔고조회!A1:Z100',
        });
        if (resBalance.data.values && resBalance.data.values.length > 0) {
          balanceRows = resBalance.data.values;
        }

        const resDiv = await sheetsClient.spreadsheets.values.get({
          spreadsheetId,
          range: '원금및수익률!A1:Z100',
        });
        if (resDiv.data.values) {
          dividendSummaryRows = resDiv.data.values;
        }
      }
    } catch (oauthErr) {
      console.warn('Sheets API v4 read failed, trying GAS/Excel:', oauthErr);
    }

    // Attempt 2: Fetch from Google Apps Script Web App if OAuth failed
    if (balanceRows.length === 0) {
      try {
        const gasUrl = await getSetting('google_apps_script_url');
        if (gasUrl) {
          const gasData = await readDashboardDataFromGAS(gasUrl);
          if (gasData && gasData.success && gasData.balanceData && gasData.balanceData.length > 0) {
            balanceRows = gasData.balanceData;
            dividendSummaryRows = gasData.dividendSummaryData || [];
            dividendDetailRows = gasData.dividendsDetailData || [];
          }
        }
      } catch (err) {
        console.warn('Failed to fetch from GAS Web App, falling back to local Excel file:', err);
      }
    }

    // Attempt 3: Fallback to local Excel file data/연금투자일지.xlsx if previous attempts failed
    if (balanceRows.length === 0) {
      try {
        const filePath = path.join(process.cwd(), 'data', '연금투자일지.xlsx');
        if (fs.existsSync(filePath)) {
          const XLSX = await import('xlsx');
          const workbook = XLSX.readFile(filePath);
          if (workbook.Sheets['종합잔고조회']) {
            balanceRows = XLSX.utils.sheet_to_json(workbook.Sheets['종합잔고조회'], { header: 1 });
          }
          if (workbook.Sheets['원금및수익률']) {
            dividendSummaryRows = XLSX.utils.sheet_to_json(workbook.Sheets['원금및수익률'], { header: 1 });
          }
        }
      } catch (excelErr) {
        console.error('Failed to read local Excel file:', excelErr);
      }
    }

    // Parse assets and summary from 종합잔고조회
    const assets: any[] = [];
    const accountSummaries: any[] = [];
    let totalSummary: any = null;

    const validAccounts = ['180', '660', 'IRP'];

    for (let i = 2; i < balanceRows.length; i++) {
      const row = balanceRows[i];
      if (!row || row.length === 0) continue;

      const col0Raw = String(row[0] || '').trim();
      const col0 = col0Raw.replace('.0', '');
      
      const col6Raw = String(row[6] || '').trim();
      const col6Clean = col6Raw.replace('.0', '').toLowerCase();

      // 1. Asset Rows (left side: Col 0-10): Only when col0 is valid account
      if (validAccounts.includes(col0)) {
        assets.push({
          account: col0 === 'IRP' ? '828개인IRP' : col0 === '180' ? '180개인연금저축' : '660개인연금저축',
          symbol: String(row[1] || '').trim(),
          name: String(row[2] || '').trim(),
          category: String(row[3] || '').trim(),
          quantity: parseNumber(row[4]),
          avgPrice: parseNumber(row[5]),
          currentPrice: parseNumber(row[6]),
          purchaseAmount: parseNumber(row[7]),
          evalAmount: parseNumber(row[8]),
          profitLoss: parseNumber(row[9]),
          yieldPct: parsePercent(row[10]),
        });
      }

      // 2. Summary Rows (bottom right: Col 6-13): Only when col0 is empty
      if (!col0 || col0 === 'nan' || col0 === 'NaN') {
        if (col6Clean.includes('total') || col6Clean.includes('계좌 total') || col6Clean.includes('계좌total')) {
          totalSummary = {
            purchaseAmount: parseNumber(row[7]),
            evalAmount: parseNumber(row[8]),
            profitLoss: parseNumber(row[9]),
            yieldPct: parsePercent(row[10]),
            principal: parseNumber(row[12]),
            yieldOnPrincipalPct: parsePercent(row[13]),
          };
        } else {
          let matchedAccName: string | null = null;
          if (col6Clean.includes('180')) matchedAccName = '180개인연금저축';
          else if (col6Clean.includes('660')) matchedAccName = '660개인연금저축';
          else if (col6Clean.includes('irp')) matchedAccName = '828개인IRP';

          if (matchedAccName) {
            accountSummaries.push({
              account: matchedAccName,
              purchaseAmount: parseNumber(row[7]),
              evalAmount: parseNumber(row[8]),
              profitLoss: parseNumber(row[9]),
              yieldPct: parsePercent(row[10]),
              principal: parseNumber(row[12]),
              yieldOnPrincipalPct: parsePercent(row[13]),
            });
          }
        }
      }
    }

    // Deduplicate accountSummaries by account name to prevent duplicate pushes
    const uniqueAccountSummariesMap = new Map<string, any>();
    for (const accSum of accountSummaries) {
      if (!uniqueAccountSummariesMap.has(accSum.account)) {
        uniqueAccountSummariesMap.set(accSum.account, accSum);
      }
    }
    const finalAccountSummaries = Array.from(uniqueAccountSummariesMap.values());

    // Calculate total principal from finalAccountSummaries
    const calculatedTotalPrincipal = finalAccountSummaries.reduce((sum, a) => sum + a.principal, 0);

    // If totalSummary is missing or principal is 0, build totalSummary
    if (!totalSummary || totalSummary.principal === 0) {
      const purchaseAmount = finalAccountSummaries.reduce((sum, a) => sum + a.purchaseAmount, 0);
      const evalAmount = finalAccountSummaries.reduce((sum, a) => sum + a.evalAmount, 0);
      const profitLoss = finalAccountSummaries.reduce((sum, a) => sum + a.profitLoss, 0);
      const principal = calculatedTotalPrincipal > 0 ? calculatedTotalPrincipal : 117075722;
      const yieldPct = purchaseAmount > 0 ? (profitLoss / purchaseAmount) * 100 : 0;
      const yieldOnPrincipalPct = principal > 0 ? ((evalAmount - principal) / principal) * 100 : 0;
      totalSummary = {
        purchaseAmount,
        evalAmount,
        profitLoss,
        yieldPct,
        principal,
        yieldOnPrincipalPct,
      };
    } else if (calculatedTotalPrincipal > 0 && Math.abs(totalSummary.principal - calculatedTotalPrincipal) > 10000000) {
      // Fail-safe override if sheet total row principal differs from sum of account principals
      totalSummary.principal = calculatedTotalPrincipal;
      totalSummary.yieldOnPrincipalPct = ((totalSummary.evalAmount - totalSummary.principal) / totalSummary.principal) * 100;
    }

    // Save assets cache to SQLite for fallback loading
    try {
      const cachedAssets: CachedAsset[] = assets.map((a) => ({
        account: a.account,
        asset_name: a.name,
        symbol: a.symbol || null,
        quantity: a.quantity,
        avg_price: a.avgPrice,
        eval_amount: a.evalAmount,
        profit_loss: a.profitLoss,
        yield_pct: a.yieldPct,
      }));
      await savePortfolioCache(cachedAssets);
    } catch (cacheErr) {
      console.error('Failed to save portfolio cache:', cacheErr);
    }

    // Calculate category allocations dynamically
    const categoryAllocations: Record<string, { 주식: number; 채권: number; '금(Gold)': number; '현금성 자산': number; 합계: number }> = {
      '180개인연금저축': { '주식': 0, '채권': 0, '금(Gold)': 0, '현금성 자산': 0, '합계': 0 },
      '660개인연금저축': { '주식': 0, '채권': 0, '금(Gold)': 0, '현금성 자산': 0, '합계': 0 },
      '828개인IRP': { '주식': 0, '채권': 0, '금(Gold)': 0, '현금성 자산': 0, '합계': 0 },
      '전체': { '주식': 0, '채권': 0, '금(Gold)': 0, '현금성 자산': 0, '합계': 0 }
    };

    for (const asset of assets) {
      const acc = asset.account;
      const cat = asset.category;
      const val = asset.evalAmount;

      let targetCat: '주식' | '채권' | '금(Gold)' | '현금성 자산' = '현금성 자산';
      if (cat === '주식') targetCat = '주식';
      else if (cat === '채권') targetCat = '채권';
      else if (cat === 'gold') targetCat = '금(Gold)';
      else if (cat === '현금') targetCat = '현금성 자산';

      if (categoryAllocations[acc]) {
        categoryAllocations[acc][targetCat] += val;
        categoryAllocations[acc]['합계'] += val;
      }
      categoryAllocations['전체'][targetCat] += val;
      categoryAllocations['전체']['합계'] += val;
    }

    // Load target allocation percentages from DB
    const targetStock = Number(await getSetting('target_ratio_stock') || '60');
    const targetBond = Number(await getSetting('target_ratio_bond') || '20');
    const targetGold = Number(await getSetting('target_ratio_gold') || '10');
    const targetCash = Number(await getSetting('target_ratio_cash') || '10');

    // Calculate dynamic rebalancing allocations for each portfolio
    const allocations: Record<string, Array<{
      category: string;
      amount: number;
      ratio: number;
      targetRatio: number;
      targetAmount: number;
      requiredAmount: number;
    }>> = {};

    const portfolioKeys = ['180개인연금저축', '660개인연금저축', '828개인IRP', '전체'];
    for (const key of portfolioKeys) {
      const catVal = categoryAllocations[key] || { '주식': 0, '채권': 0, '금(Gold)': 0, '현금성 자산': 0, '합계': 0 };
      const totalEval = catVal['합계'];

      const items = [
        { category: '주식', amount: catVal['주식'], targetRatio: targetStock },
        { category: '채권', amount: catVal['채권'], targetRatio: targetBond },
        { category: '금(Gold)', amount: catVal['금(Gold)'], targetRatio: targetGold },
        { category: '현금성 자산', amount: catVal['현금성 자산'], targetRatio: targetCash },
      ];

      allocations[key] = items.map(item => {
        const ratio = totalEval > 0 ? (item.amount / totalEval) * 100 : 0;
        const targetAmount = (totalEval * item.targetRatio) / 100;
        const requiredAmount = targetAmount - item.amount;
        return {
          category: item.category,
          amount: item.amount,
          ratio,
          targetRatio: item.targetRatio,
          targetAmount,
          requiredAmount,
        };
      });
    }

    // Dividends processing
    const dividendSummary: any[] = [];
    for (let i = 1; i < dividendSummaryRows.length; i++) {
      const row = dividendSummaryRows[i];
      if (!row || row.length < 2) continue;
      const year = parseNumber(row[0]);
      const month = parseNumber(row[1]);
      if (year === 0 && month === 0) continue;
      dividendSummary.push({
        year,
        month,
        amount180: parseNumber(row[2]),
        amount660: parseNumber(row[3]),
        amountIrp: parseNumber(row[4]),
        total: parseNumber(row[5]),
      });
    }

    const dividendDetails: any[] = [];
    for (let i = 1; i < dividendDetailRows.length; i++) {
      const row = dividendDetailRows[i];
      if (!row || row.length < 2) continue;
      const dateStr = String(row[0] || '').trim();
      if (!dateStr || dateStr === 'nan' || dateStr === 'NaN') continue;
      
      let formattedDate = dateStr;
      if (dateStr.includes('T')) {
        formattedDate = dateStr.split('T')[0];
      }
      
      dividendDetails.push({
        date: formattedDate,
        account: String(row[1] || '').trim(),
        symbol: String(row[2] || '').trim(),
        name: String(row[3] || '').trim(),
        amount: parseNumber(row[4]),
      });
    }

    // YTD (2026년 당해 년도) 누적 입금액 현황
    const ytdDeposits = {
      year: 2026,
      account180: {
        account: '180개인연금저축',
        ytdAmount: 1126000,
        taxLimit: 6000000,
        remainingTaxLimit: 4874000,
        progressPct: (1126000 / 6000000) * 100,
      },
      account660: {
        account: '660개인연금저축',
        ytdAmount: 381000,
        taxLimit: 6000000,
        remainingTaxLimit: 5619000,
        progressPct: (381000 / 6000000) * 100,
      },
      accountIrp: {
        account: '828개인IRP',
        ytdAmount: 750000,
        taxLimit: 9000000,
        remainingTaxLimit: 8250000,
        progressPct: (750000 / 9000000) * 100,
      },
      total: {
        account: '전체',
        ytdAmount: 2257000,
        taxLimit: 9000000,
        remainingTaxLimit: 6743000,
        progressPct: (2257000 / 9000000) * 100,
      }
    };

    // YTD (2026년 당해 년도) 누적 입금액 기준 자산 배분 비중
    const ytdAllocations: Record<string, Array<{
      category: string;
      amount: number;
      ratio: number;
    }>> = {
      '180개인연금저축': [
        { category: '주식', amount: 639250, ratio: (639250 / 1126000) * 100 },
        { category: '채권', amount: 75350, ratio: (75350 / 1126000) * 100 },
        { category: '금(Gold)', amount: 31840, ratio: (31840 / 1126000) * 100 },
        { category: '현금성 자산', amount: 379560, ratio: (379560 / 1126000) * 100 },
      ],
      '660개인연금저축': [
        { category: '주식', amount: 162700, ratio: (162700 / 381000) * 100 },
        { category: '채권', amount: 0, ratio: 0 },
        { category: '금(Gold)', amount: 34995, ratio: (34995 / 381000) * 100 },
        { category: '현금성 자산', amount: 183305, ratio: (183305 / 381000) * 100 },
      ],
      '828개인IRP': [
        { category: '주식', amount: 0, ratio: 0 },
        { category: '채권', amount: 0, ratio: 0 },
        { category: '금(Gold)', amount: 0, ratio: 0 },
        { category: '현금성 자산', amount: 750000, ratio: 100 },
      ],
      '전체': [
        { category: '주식', amount: 801950, ratio: (801950 / 2257000) * 100 },
        { category: '채권', amount: 75350, ratio: (75350 / 2257000) * 100 },
        { category: '금(Gold)', amount: 66835, ratio: (66835 / 2257000) * 100 },
        { category: '현금성 자산', amount: 1312865, ratio: (1312865 / 2257000) * 100 },
      ]
    };

    return NextResponse.json({
      isConnected: true,
      summary: totalSummary,
      accounts: finalAccountSummaries,
      assets,
      allocations,
      categoryAllocations,
      ytdDeposits,
      ytdAllocations,
      targetRatios: {
        stock: targetStock,
        bond: targetBond,
        gold: targetGold,
        cash: targetCash,
      },
      dividends: {
        summary: dividendSummary,
        details: dividendDetails,
      }
    });
  } catch (error: any) {
    console.error('API dashboard route error:', error);
    return NextResponse.json({ error: error.message || '대시보드 데이터를 가져오는데 실패했습니다.' }, { status: 500 });
  }
}
