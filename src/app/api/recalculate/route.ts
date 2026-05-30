import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';

export async function POST() {
  try {
    const gasUrl = await getSetting('google_apps_script_url');
    if (!gasUrl) {
      return NextResponse.json({ error: '구글 앱스 스크립트 웹 앱 URL이 설정되어 있지 않습니다.' }, { status: 400 });
    }

    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ action: 'recalculate' }),
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`Google Apps Script 연결 실패 (HTTP ${response.status})`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || '구글 시트 재계산 중 에러가 발생했습니다.');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('API recalculate route error:', error);
    return NextResponse.json({ error: error.message || '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
