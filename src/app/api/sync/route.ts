import { NextRequest, NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { syncTransactions } from '@/lib/sync';

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

    for (const file of files) {
      const filename = file.name;
      let sheetName = '';

      // Match filename to Google Sheet tab
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

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('API sync route error:', error);
    return NextResponse.json({ error: error.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
export const maxDuration = 60;
