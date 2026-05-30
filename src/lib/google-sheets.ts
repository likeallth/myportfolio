/**
 * Interface representing the dashboard data returned by the Google Apps Script Web App.
 */
export interface GASDashboardData {
  success: boolean;
  error?: string;
  balanceData?: any[][];
  portfolioData?: any[][];
  dividendSummaryData?: any[][];
  dividendsDetailData?: any[][];
}

/**
 * Interface representing the values response from a specific sheet.
 */
export interface GASSheetValuesResponse {
  success: boolean;
  error?: string;
  values?: any[][];
}

/**
 * Interface representing the response of a sync/append request.
 */
export interface GASSyncResponse {
  success: boolean;
  error?: string;
  newMaxRow?: number;
}

/**
 * Fetches dashboard summary datasets (종합잔고조회 & 연금투자_portfolio) from the GAS Web App.
 */
export async function readDashboardDataFromGAS(gasUrl: string): Promise<GASDashboardData> {
  const response = await fetch(gasUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store', // Avoid caching outdated sheet values
  });

  if (!response.ok) {
    throw new Error(`Google Apps Script 연결 실패 (HTTP ${response.status})`);
  }

  return response.json();
}

/**
 * Fetches all row values of a specific sheet via the GAS Web App (used for deduplication).
 */
export async function readSheetValuesFromGAS(gasUrl: string, sheetName: string): Promise<any[][]> {
  const url = `${gasUrl}?sheetName=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`구글 시트 데이터 로드 실패 (HTTP ${response.status})`);
  }

  const data: GASSheetValuesResponse = await response.json();
  if (!data.success) {
    throw new Error(data.error || `${sheetName} 시트 데이터를 읽어오는데 실패했습니다.`);
  }

  return data.values || [];
}

/**
 * Sends new transaction rows to be appended to a specific sheet, and updates K2:O2 formulas.
 * Sends a POST request to the GAS Web App.
 */
export async function appendSheetValuesToGAS(
  gasUrl: string,
  sheetName: string,
  rows: any[][],
  updates?: Array<{ rowIndex: number; values: any[] }>
): Promise<number> {
  const payload = {
    action: 'sync',
    sheetName,
    rows,
    updates: updates || [],
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
    throw new Error(`구글 시트 동기화 전송 실패 (HTTP ${response.status})`);
  }

  const data: GASSyncResponse = await response.json();
  if (!data.success) {
    throw new Error(data.error || `${sheetName} 시트 데이터 동기화에 실패했습니다.`);
  }

  if (data.newMaxRow === undefined) {
    throw new Error('구글 시트 동기화는 완료되었으나, 업데이트된 최종 행 정보를 받지 못했습니다.');
  }

  return data.newMaxRow;
}
