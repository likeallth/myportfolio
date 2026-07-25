import { readSheetValuesFromGAS, appendSheetValuesToGAS } from './google-sheets';
import { parseMiraeAssetCSV, Transaction, IRPBalance } from './parser';

function parseNumber(val: any): number {
  if (val === undefined || val === null) return 0;
  const str = String(val).trim();
  if (!str || str === 'nan' || str === 'NaN') return 0;
  const cleaned = str.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseOptionalNumber(val: any): number | null {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str || str === 'nan' || str === 'NaN') return null;
  const cleaned = str.replace(/,/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Normalizes date strings (e.g. "2026/03/24" or ISO strings like "2026-03-23T15:00:00.000Z") into "YYYY-MM-DD" KST.
 */
export function normalizeDate(dateStr: string): string {
  if (dateStr.includes('T')) {
    try {
      const date = new Date(dateStr);
      // Shift from UTC to KST (UTC+9)
      const kstDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
      const yyyy = kstDate.getUTCFullYear();
      const mm = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(kstDate.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    } catch {
      // Fallback to basic clean if parsing fails
    }
  }

  const cleaned = dateStr.replace(/[^0-9]/g, ''); // keep only numbers
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  return dateStr;
}

/**
 * Generates a unique transaction key based on date, type, and sequence number (the number in the row below the date).
 */
export function getTxKey(tx: Transaction): string {
  const normDate = normalizeDate(tx.date);
  const cleanType = tx.type.replace(/\s+/g, '');
  const seq = tx.seq;
  return `${normDate}_${cleanType}_${seq}`;
}

/**
 * Parses raw Google Sheet rows (starting at Row 4, Excel 1-based) into Transaction objects.
 * Handles both (Date, Seq) and (Seq, Date) orderings robustly.
 */
export function parseSheetRowsToTransactions(rows: any[][]): Transaction[] {
  const transactions: Transaction[] = [];
  
  // Data rows start at index 3 of the sheet data (Excel Row 4)
  let i = 3;
  while (i < rows.length) {
    const r1 = rows[i];
    const r2 = rows[i + 1];

    if (!r1) break;

    const val1 = String(r1[1] || '').trim();
    const val2 = String(r2 ? r2[1] || '' : '').trim();

    // Check if values represent dates or sequences
    const isVal1Date = val1.includes('/') || val1.includes('-');
    const isVal2Date = val2.includes('/') || val2.includes('-');
    const isVal1Seq = !isVal1Date && /^[0-9]+$/.test(val1) && val1.length < 5;
    const isVal2Seq = !isVal2Date && /^[0-9]+$/.test(val2) && val2.length < 5;

    let dateRow: any[] | null = null;
    let seqRow: any[] | null = null;
    let dateRowIdx = -1;
    let seqRowIdx = -1;

    if (isVal1Date && isVal2Seq) {
      // Standard chronological order: Date row is first
      dateRow = r1;
      seqRow = r2;
      dateRowIdx = i;
      seqRowIdx = i + 1;
      i += 2;
    } else if (isVal1Seq && isVal2Date) {
      // Reverse chronological order (from historical imports): Seq row is first
      dateRow = r2;
      seqRow = r1;
      dateRowIdx = i + 1;
      seqRowIdx = i;
      i += 2;
    } else {
      // Misaligned rows, skip 1 to attempt re-alignment
      i += 1;
      continue;
    }

    if (dateRow && seqRow) {
      const tx: Transaction = {
        date: String(dateRow[1]).trim(),
        type: String(dateRow[2] || '').trim(),
        symbol: String(dateRow[5] || '').trim(),
        amount: parseNumber(dateRow[6]),
        cashBalance: parseNumber(dateRow[7]),
        fee: parseNumber(dateRow[8]),
        receivable: parseNumber(dateRow[9] || 0),

        seq: parseNumber(seqRow[1]),
        originalSeq: String(seqRow[2] || '').trim(),
        quantity: parseOptionalNumber(seqRow[3]),
        price: parseOptionalNumber(seqRow[4]),
        name: String(seqRow[5] || '').trim(),
        netAmount: parseNumber(seqRow[6]),
        stockBalance: parseNumber(seqRow[7]),
        tax: parseNumber(seqRow[8]),
        receivableRepay: parseNumber(seqRow[9] || 0),

        sheetDateRowIndex: dateRowIdx + 1,
        sheetSeqRowIndex: seqRowIdx + 1,
      };
      transactions.push(tx);
    }
  }

  return transactions;
}

/**
 * Syncs the uploaded CSV file with the Google Sheet via Google Apps Script Web App.
 */
export async function syncTransactions(
  gasUrl: string,
  sheetName: string,
  csvBuffer: Buffer
): Promise<{
  allCount: number;
  newCount: number;
  newTransactions: Transaction[];
}> {
  // 1. Parse CSV transactions
  const csvTxs = parseMiraeAssetCSV(csvBuffer);
  if (csvTxs.length === 0) {
    return { allCount: 0, newCount: 0, newTransactions: [] };
  }

  // 2. Read existing transactions from Google Sheet via GAS
  const sheetRows = await readSheetValuesFromGAS(gasUrl, sheetName);
  const sheetTxs = parseSheetRowsToTransactions(sheetRows);

  // 3. Map existing transactions by key for O(1) lookup
  const existingTxMap = new Map<string, Transaction>();
  for (const tx of sheetTxs) {
    existingTxMap.set(getTxKey(tx), tx);
  }

  // 4. Compare CSV transactions with sheet transactions
  const newTxs: Transaction[] = [];

  // Track keys within current CSV to avoid duplicates inside the file itself
  const processedKeys = new Set<string>();

  for (const csvTx of csvTxs) {
    const key = getTxKey(csvTx); // Returns normDate_cleanType_seq
    if (processedKeys.has(key)) {
      continue;
    }
    processedKeys.add(key);

    const existsInSheet = existingTxMap.has(key);
    if (!existsInSheet) {
      // New transaction to append
      newTxs.push(csvTx);
    }
  }

  if (newTxs.length === 0) {
    return { allCount: csvTxs.length, newCount: 0, newTransactions: [] };
  }

  // 5. Format new transactions into Google Sheets 2-row layout (columns A to O)
  const newRows: any[][] = [];
  for (const tx of newTxs) {
    // Row 1: Date Row
    newRows.push([
      null, // Col A: Index (nan)
      normalizeDate(tx.date), // Col B: 거래일자
      tx.type, // Col C: 거래종류
      null, // Col D
      null, // Col E
      tx.symbol || null, // Col F: 종목번호
      tx.amount, // Col G: 거래금액
      tx.cashBalance, // Col H: 예수금
      tx.fee, // Col I: 수수료
      tx.receivable || 0, // Col J: 미수발생금액
      null, null, null, null, null // Col K to O: Summary columns empty
    ]);

    // Row 2: Seq Row
    newRows.push([
      null, // Col A: Index (nan)
      tx.seq, // Col B: 거래번호
      tx.originalSeq || null, // Col C: 원거래번호
      tx.quantity, // Col D: 수량
      tx.price, // Col E: 단가
      tx.name || null, // Col F: 종목명
      tx.netAmount, // Col G: 입출금액
      tx.stockBalance, // Col H: 유가잔고
      tx.tax, // Col I: 제세금합
      tx.receivableRepay || 0, // Col J: 미수변제금액
      null, null, null, null, null // Col K to O: Summary columns empty
    ]);
  }

  // 6. Post new rows to GAS Web App
  const newMaxRow = await appendSheetValuesToGAS(gasUrl, sheetName, newRows);
  console.log(`Successfully synced ${newTxs.length} new transactions to ${sheetName}. Sheet max row is now ${newMaxRow}`);

  return {
    allCount: csvTxs.length,
    newCount: newTxs.length,
    newTransactions: newTxs,
  };
}

/**
 * Calculates current asset balances (quantity, avgPrice) from transaction history.
 */
export function calculateBalancesFromTransactions(transactions: Transaction[]): Record<string, { quantity: number; avgPrice: number; name: string }> {
  // 1. Sort transactions chronologically
  const sorted = [...transactions].sort((a, b) => {
    const da = normalizeDate(a.date);
    const db = normalizeDate(b.date);
    if (da !== db) return da.localeCompare(db);
    return a.seq - b.seq;
  });

  // 2. Match and merge split stock/cash transaction pairs
  for (let i = 0; i < sorted.length; i++) {
    const tx = sorted[i];
    if (!tx.symbol) continue;
    const isBuy = tx.type.includes('매수');
    const isSell = tx.type.includes('매도');
    if ((isBuy || isSell) && (!tx.quantity || tx.quantity === 0)) {
      // Look for a cash transaction to merge
      const match = sorted.find(t => 
        !t.symbol && 
        normalizeDate(t.date) === normalizeDate(tx.date) && 
        t.amount === tx.amount && 
        t.quantity && t.quantity > 0
      );
      if (match) {
        tx.quantity = match.quantity;
        tx.price = match.price;
        tx.name = match.name || tx.name;
        // Mark match to be ignored
        match.symbol = 'IGNORED';
      }
    }
  }

  // Filter out ignored cash transactions
  const cleanSorted = sorted.filter(t => t.symbol && t.symbol !== 'IGNORED');

  // 3. Find the LAST valid transaction for each symbol that contains the true stockBalance from broker
  const lastStockBalanceMap: Record<string, number> = {};
  const lastTxNameMap: Record<string, string> = {};

  for (const tx of cleanSorted) {
    if (!tx.symbol) continue;
    lastTxNameMap[tx.symbol] = tx.name || lastTxNameMap[tx.symbol];
    
    // Check if tx has a valid stock balance recorded from broker
    // Note: Cash dividends have stockBalance = 0, so we filter for valid trade/balance updates
    const isTrade = tx.type.includes('매수') || tx.type.includes('매도') || tx.type.includes('펀드') || (tx.quantity !== null && tx.quantity > 0);
    if (isTrade) {
      if (tx.stockBalance !== undefined && tx.stockBalance !== null) {
        if (tx.stockBalance > 0 || tx.type.includes('매도')) {
          lastStockBalanceMap[tx.symbol] = tx.stockBalance;
        }
      }
    }
  }

  // 4. Chronological calculation for weighted average price
  const balances: Record<string, { quantity: number; avgPrice: number; name: string }> = {};
  for (const tx of cleanSorted) {
    const symbol = tx.symbol;
    if (!balances[symbol]) {
      balances[symbol] = { quantity: 0, avgPrice: 0, name: tx.name };
    }

    const bal = balances[symbol];
    const isFund = !(symbol.startsWith('A') && symbol.length === 7);

    if (tx.type.includes('매수')) {
      if (tx.quantity && tx.quantity > 0) {
        const txQty = tx.quantity;
        const txCost = tx.amount + tx.fee + tx.tax;
        const oldQty = bal.quantity;
        const oldAvg = bal.avgPrice;

        if (isFund) {
          const oldCost = (oldQty * oldAvg) / 1000;
          const newCost = oldCost + txCost;
          const newQty = oldQty + txQty;
          const newAvg = newQty > 0 ? (newCost * 1000) / newQty : 0;

          bal.quantity = newQty;
          bal.avgPrice = Math.round(newAvg * 100) / 100;
        } else {
          const oldCost = oldQty * oldAvg;
          const newCost = oldCost + txCost;
          const newQty = oldQty + txQty;
          const newAvg = newQty > 0 ? newCost / newQty : 0;

          bal.quantity = newQty;
          bal.avgPrice = Math.round(newAvg);
        }
      }
    } else if (tx.type.includes('매도')) {
      if (tx.quantity && tx.quantity > 0) {
        bal.quantity = Math.max(0, bal.quantity - tx.quantity);
        if (bal.quantity === 0) {
          bal.avgPrice = 0;
        }
      }
    }
  }

  // 5. Final Result: Combine exact quantity from broker's lastStockBalanceMap with calculated avgPrice
  const result: Record<string, { quantity: number; avgPrice: number; name: string }> = {};
  for (const symbol in lastTxNameMap) {
    const calcBal = balances[symbol] || { avgPrice: 0, name: lastTxNameMap[symbol] };
    const exactQty = lastStockBalanceMap[symbol] !== undefined ? lastStockBalanceMap[symbol] : calcBal.quantity;

    result[symbol] = {
      quantity: exactQty,
      avgPrice: exactQty > 0 ? calcBal.avgPrice : 0,
      name: lastTxNameMap[symbol] || calcBal.name
    };
  }

  return result;
}

/**
 * Synchronizes the calculated/parsed balances to the "종합잔고조회" sheet on GAS.
 */
export async function syncBalanceSheet(
  gasUrl: string,
  updates180?: Record<string, { quantity: number; avgPrice: number }>,
  updates660?: Record<string, { quantity: number; avgPrice: number }>,
  updatesIRP?: IRPBalance[]
): Promise<void> {
  const sheetRows = await readSheetValuesFromGAS(gasUrl, '종합잔고조회');
  if (sheetRows.length === 0) return;

  const updatesPayload: Array<{ row: number; col: number; values: any[] }> = [];

  let totalRowIdx = -1;
  for (let i = 0; i < sheetRows.length; i++) {
    const row = sheetRows[i];
    if (row && String(row[6] || '').trim() === '계좌 total 금액') {
      totalRowIdx = i + 1;
      break;
    }
  }

  if (totalRowIdx === -1) {
    console.warn('Could not find "계좌 total 금액" row in 종합잔고조회 sheet.');
    return;
  }

  const etfBrands = ['kodex', 'tiger', 'ace', 'rise', 'plus', 'sol', 'kbstar', 'hanaro', 'kosef', 'arirang'];

  for (let r = 4; r <= totalRowIdx - 2; r++) {
    const row = sheetRows[r - 1];
    if (!row) continue;

    const accountType = String(row[0] || '').trim();
    const symbol = String(row[1] || '').trim();
    const name = String(row[2] || '').trim();

    if (accountType === '180' && updates180) {
      if (symbol && symbol !== 'nan' && symbol !== '') {
        const bal = updates180[symbol];
        const qty = bal ? bal.quantity : 0;
        const avg = bal ? bal.avgPrice : 0;
        updatesPayload.push({
          row: r,
          col: 5, // Column E: 보유량
          values: [qty, avg]
        });
      }
    } else if (accountType === '660' && updates660) {
      if (symbol && symbol !== 'nan' && symbol !== '') {
        const bal = updates660[symbol];
        const qty = bal ? bal.quantity : 0;
        const avg = bal ? bal.avgPrice : 0;
        updatesPayload.push({
          row: r,
          col: 5, // Column E: 보유량
          values: [qty, avg]
        });
      }
    } else if (accountType === 'IRP' && updatesIRP) {
      if (name && name !== 'nan' && name !== '') {
        const bal = updatesIRP.find(b => b.name === name);
        const cleanName = name.toLowerCase().replace(/\s+/g, '');
        const isEtf = etfBrands.some(brand => cleanName.startsWith(brand));
        const isCash = name.includes('현금') || name.includes('예수금');

        if (bal) {
          const qty = bal.quantity;
          const purchaseAmount = bal.purchaseAmount;
          const evalAmount = bal.evalAmount;
          const ratio = bal.ratio;

          let avg: number | null = null;
          let current: number | null = null;

          if (!isCash) {
            if (isEtf) {
              avg = qty > 0 ? purchaseAmount / qty : 0;
              current = qty > 0 ? evalAmount / qty : 0;
            } else {
              avg = qty > 0 ? (purchaseAmount * 1000) / qty : 0;
              current = qty > 0 ? (evalAmount * 1000) / qty : 0;
            }
          }

          updatesPayload.push({
            row: r,
            col: 5, // Column E: 보유량, 평균단가, 현재가, 매입금액, 평가금액
            values: [
              qty,
              avg !== null ? Math.round(avg * 100) / 100 : '',
              current !== null ? Math.round(current * 100) / 100 : '',
              purchaseAmount,
              evalAmount
            ]
          });
          updatesPayload.push({
            row: r,
            col: 12, // Column L: 운용비율
            values: [ratio]
          });
        } else {
          // If the asset exists in the sheet but not in the uploaded CSV, set to 0.
          updatesPayload.push({
            row: r,
            col: 5,
            values: [0, '', '', 0, 0]
          });
          updatesPayload.push({
            row: r,
            col: 12,
            values: [0]
          });
        }
      }
    }
  }

  if (updatesPayload.length === 0) return;

  const payload = {
    action: 'updateBalances',
    updates: updatesPayload
  };

  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`종합잔고조회 시트 업데이트 전송 실패 (HTTP ${response.status})`);
  }

  const resData = await response.json();
  if (!resData.success) {
    throw new Error(resData.error || '종합잔고조회 시트 업데이트에 실패했습니다.');
  }
}
