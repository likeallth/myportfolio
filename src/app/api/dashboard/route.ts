import { NextResponse } from 'next/server';
import { readDashboardDataFromGAS } from '@/lib/google-sheets';
import { getSetting, savePortfolioCache, CachedAsset } from '@/lib/db';

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
  
  // If it was parsed as a ratio (e.g. 0.37209) and didn't have a %, convert to percentage
  if (!hasPercent && Math.abs(num) <= 1.0 && num !== 0) {
    num = num * 100;
  }
  return num;
}

export async function GET() {
  try {
    const gasUrl = await getSetting('google_apps_script_url');
    if (!gasUrl) {
      return NextResponse.json({ isConnected: false, error: '구글 앱스 스크립트 웹 앱 URL이 등록되어 있지 않습니다.' });
    }

    // Fetch raw sheet arrays from GAS Web App
    const gasData = await readDashboardDataFromGAS(gasUrl);
    if (!gasData.success) {
      return NextResponse.json({ isConnected: true, error: gasData.error || '시트 데이터를 가져오는데 실패했습니다.' }, { status: 400 });
    }

    const balanceRows = gasData.balanceData || [];

    // Parse assets and summary from 종합잔고조회
    const assets: any[] = [];
    const accountSummaries: any[] = [];
    let totalSummary: any = null;

    const validAccounts = ['180', '660', 'IRP'];

    for (let i = 2; i < balanceRows.length; i++) {
      const row = balanceRows[i];
      if (!row || row.length === 0) continue;

      const col0 = String(row[0] || '').trim();
      const col6 = String(row[6] || '').trim();

      // Parse individual assets (left side: Col 0-10)
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

      // Parse account total (bottom left)
      if (col6 === '계좌 total 금액') {
        totalSummary = {
          purchaseAmount: parseNumber(row[7]),
          evalAmount: parseNumber(row[8]),
          profitLoss: parseNumber(row[9]),
          yieldPct: parsePercent(row[10]),
          principal: parseNumber(row[12]),
          yieldOnPrincipalPct: parsePercent(row[13]),
        };
      } else if (validAccounts.includes(col6)) {
        accountSummaries.push({
          account: col6 === 'IRP' ? '828개인IRP' : col6 === '180' ? '180개인연금저축' : '660개인연금저축',
          purchaseAmount: parseNumber(row[7]),
          evalAmount: parseNumber(row[8]),
          profitLoss: parseNumber(row[9]),
          yieldPct: parsePercent(row[10]),
          principal: parseNumber(row[12]),
          yieldOnPrincipalPct: parsePercent(row[13]),
        });
      }
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
      const acc = asset.account; // '180개인연금저축', '660개인연금저축', or '828개인IRP'
      const cat = asset.category; // '주식', '채권', 'gold', '현금'
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

    const portfolioKeys = ['전체', '180개인연금저축', '660개인연금저축', '828개인IRP'];
    for (const key of portfolioKeys) {
      const actuals = categoryAllocations[key];
      const totalAmount = actuals.합계;

      allocations[key] = [
        {
          category: '주식',
          amount: actuals.주식,
          ratio: totalAmount > 0 ? (actuals.주식 / totalAmount) * 100 : 0,
          targetRatio: targetStock,
          targetAmount: (totalAmount * targetStock) / 100,
          requiredAmount: ((totalAmount * targetStock) / 100) - actuals.주식,
        },
        {
          category: '채권',
          amount: actuals.채권,
          ratio: totalAmount > 0 ? (actuals.채권 / totalAmount) * 100 : 0,
          targetRatio: targetBond,
          targetAmount: (totalAmount * targetBond) / 100,
          requiredAmount: ((totalAmount * targetBond) / 100) - actuals.채권,
        },
        {
          category: '금(Gold)',
          amount: actuals['금(Gold)'],
          ratio: totalAmount > 0 ? (actuals['금(Gold)'] / totalAmount) * 100 : 0,
          targetRatio: targetGold,
          targetAmount: (totalAmount * targetGold) / 100,
          requiredAmount: ((totalAmount * targetGold) / 100) - actuals['금(Gold)'],
        },
        {
          category: '현금성 자산',
          amount: actuals['현금성 자산'],
          ratio: totalAmount > 0 ? (actuals['현금성 자산'] / totalAmount) * 100 : 0,
          targetRatio: targetCash,
          targetAmount: (totalAmount * targetCash) / 100,
          requiredAmount: ((totalAmount * targetCash) / 100) - actuals['현금성 자산'],
        },
      ];
    }

    // Parse dividends data
    const dividendSummaryRows = gasData.dividendSummaryData || [];
    const dividendSummary: any[] = [];
    // Skip header (i = 0)
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

    const dividendDetailRows = gasData.dividendsDetailData || [];
    const dividendDetails: any[] = [];
    // Skip header (i = 0)
    for (let i = 1; i < dividendDetailRows.length; i++) {
      const row = dividendDetailRows[i];
      if (!row || row.length < 2) continue;
      const dateStr = String(row[0] || '').trim();
      if (!dateStr || dateStr === 'nan' || dateStr === 'NaN' || !dateStr) continue;
      
      // Try to format date object if it comes as Google Apps Script Date serial
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

    return NextResponse.json({
      isConnected: true,
      summary: totalSummary,
      accounts: accountSummaries,
      assets,
      allocations,
      categoryAllocations,
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
