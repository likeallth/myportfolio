import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import {
  syncTransactions,
  calculateBalancesFromTransactions,
  syncBalanceSheet,
  parseSheetRowsToTransactions
} from '@/lib/sync';
import { parseIRPBalanceCSV, IRPBalance } from '@/lib/parser';
import { readSheetValuesFromGAS } from '@/lib/google-sheets';

export async function POST(request: NextRequest) {
  try {
    const gasUrl = await getSetting('google_apps_script_url');
    if (!gasUrl) {
      return NextResponse.json({ error: '구글 앱스 스크립트 웹 앱 URL이 설정되어 있지 않습니다. 설정 페이지에서 연동해 주세요.' }, { status: 400 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: '업로드된 파일이 없습니다.' }, { status: 400 });
    }

    const results: Array<{
      filename: string;
      sheetName: string;
      allCount: number;
      newCount: number;
      newTransactions: any[];
      success: boolean;
      error?: string;
    }> = [];

    let irpBalances: IRPBalance[] | undefined = undefined;
    let didSyncTransactions = false;

    // First, scan for balance files (like 828종합잔고.csv)
    for (const file of files) {
      const filename = file.name;
      const isBalanceFile = filename.includes('828') && (filename.includes('잔고') || filename.includes('balance'));
      
      if (isBalanceFile) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          irpBalances = parseIRPBalanceCSV(buffer);
          
          results.push({
            filename,
            sheetName: '종합잔고조회',
            allCount: irpBalances.length,
            newCount: irpBalances.length,
            newTransactions: irpBalances,
            success: true
          });
        } catch (err: any) {
          console.error(`Error parsing IRP balance file ${filename}:`, err);
          results.push({
            filename,
            sheetName: '종합잔고조회',
            allCount: 0,
            newCount: 0,
            newTransactions: [],
            success: false,
            error: err.message || '잔고 파일 파싱 중 에러가 발생했습니다.'
          });
        }
      }
    }

    // Next, process transaction files
    for (const file of files) {
      const filename = file.name;
      const isBalanceFile = filename.includes('828') && (filename.includes('잔고') || filename.includes('balance'));
      if (isBalanceFile) continue;

      let sheetName = '';
      if (filename.includes('180')) {
        sheetName = '180개인연금저축';
      } else if (filename.includes('660')) {
        sheetName = '660개인연금저축';
      } else if (filename.includes('828')) {
        sheetName = '828개인IRP';
      } else {
        results.push({
          filename,
          sheetName: '알 수 없음',
          allCount: 0,
          newCount: 0,
          newTransactions: [],
          success: false,
          error: "파일명에 계좌 종류('180', '660', '828')가 포함되어야 합니다. 예: 180개인연금저축.csv",
        });
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const syncResult = await syncTransactions(gasUrl, sheetName, buffer);

        results.push({
          filename,
          sheetName,
          allCount: syncResult.allCount,
          newCount: syncResult.newCount,
          newTransactions: syncResult.newTransactions,
          success: true,
        });

        didSyncTransactions = true;
      } catch (err: any) {
        console.error(`Error syncing file ${filename} to GAS:`, err);
        results.push({
          filename,
          sheetName,
          allCount: 0,
          newCount: 0,
          newTransactions: [],
          success: false,
          error: err.message || '동기화 중 에러가 발생했습니다.',
        });
      }
    }

    // Now, update "종합잔고조회" balance sheet
    // We do this if any transaction was successfully synced OR IRP balance CSV was uploaded
    if (didSyncTransactions || irpBalances !== undefined) {
      try {
        console.log('Starting balance sheet update in 종합잔고조회...');
        
        // 1. Fetch and calculate 180 balances
        const rows180 = await readSheetValuesFromGAS(gasUrl, '180개인연금저축');
        const txs180 = parseSheetRowsToTransactions(rows180);
        const bal180 = calculateBalancesFromTransactions(txs180);

        // 2. Fetch and calculate 660 balances
        const rows660 = await readSheetValuesFromGAS(gasUrl, '660개인연금저축');
        const txs660 = parseSheetRowsToTransactions(rows660);
        const bal660 = calculateBalancesFromTransactions(txs660);

        // 3. Sync to Google Sheet
        await syncBalanceSheet(gasUrl, bal180, bal660, irpBalances);
        console.log('Balance sheet updated successfully in GAS.');
      } catch (err: any) {
        console.error('Failed to update balance sheet after sync:', err);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('API sync route error:', error);
    return NextResponse.json({ error: error.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
export const maxDuration = 60;
