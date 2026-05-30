import Papa from 'papaparse';

export interface Transaction {
  // Date Row (첫 번째 줄)
  date: string;          // 거래일자 (YYYY/MM/DD)
  type: string;          // 거래종류 (예: 주식매수입고)
  symbol: string;        // 종목번호 (예: A360750)
  amount: number;        // 거래금액
  cashBalance: number;   // 예수금
  fee: number;           // 수수료
  receivable: number;    // 미수발생금액

  // Seq Row (두 번째 줄)
  seq: number;           // 거래번호
  originalSeq: string;   // 원거래번호
  quantity: number | null;  // 수량
  price: number | null;     // 단가
  name: string;          // 종목명
  netAmount: number;     // 입출금액
  stockBalance: number;  // 유가잔고
  tax: number;           // 제세금합
  receivableRepay: number; // 미수변제금액

  // 구글 시트 행 추적 인덱스 (1-based)
  sheetDateRowIndex?: number;
  sheetSeqRowIndex?: number;
}

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
 * Parses a Mirae Asset HTS CSV file buffer (encoded in CP949 / EUC-KR)
 * into an array of Transaction objects.
 */
export function parseMiraeAssetCSV(buffer: Buffer): Transaction[] {
  // Decode CP949/EUC-KR buffer to string
  const decoder = new TextDecoder('euc-kr');
  const csvText = decoder.decode(buffer);

  // Parse CSV text using PapaParse
  const parsed = Papa.parse<string[]>(csvText, {
    skipEmptyLines: true,
  });

  const rows = parsed.data;
  if (rows.length < 3) {
    return [];
  }

  const transactions: Transaction[] = [];

  // Data starts at index 2 (row 3 of CSV, after 2 header rows)
  for (let i = 2; i < rows.length; i += 2) {
    const row1 = rows[i];
    const row2 = rows[i + 1];

    if (!row1) continue;

    // Check if it looks like a valid date row (e.g. contains slashes in column 0)
    const dateStr = String(row1[0]).trim();
    if (!dateStr || dateStr === 'nan' || !dateStr.includes('/')) {
      // If row1 is not a valid date row, we might have misaligned rows.
      // Try to recover by shifting by 1 row.
      i -= 1;
      continue;
    }

    if (!row2) {
      // Missing the matching sequence row at the end of the file
      break;
    }

    const seqVal = parseNumber(row2[0]);
    if (seqVal === 0 && String(row2[0]).trim() !== '0' && String(row2[0]).trim() !== '') {
      // If row2's first column is not a sequence number, they are misaligned.
      // Recover by treating row2 as a new date row on next loop.
      i -= 1;
      continue;
    }

    // Map columns
    const tx: Transaction = {
      // Date row
      date: dateStr,
      type: String(row1[1]).trim(),
      symbol: row1[4] ? String(row1[4]).trim() : '',
      amount: parseNumber(row1[5]),
      cashBalance: parseNumber(row1[6]),
      fee: parseNumber(row1[7]),
      receivable: parseNumber(row1[8]),

      // Seq row
      seq: seqVal,
      originalSeq: row2[1] ? String(row2[1]).trim() : '',
      quantity: parseOptionalNumber(row2[2]),
      price: parseOptionalNumber(row2[3]),
      name: row2[4] ? String(row2[4]).trim() : '',
      netAmount: parseNumber(row2[5]),
      stockBalance: parseNumber(row2[6]),
      tax: parseNumber(row2[7]),
      receivableRepay: parseNumber(row2[8]),
    };

    transactions.push(tx);
  }

  return transactions;
}
