import { NextRequest, NextResponse } from 'next/server';
import { getSetting, setSetting } from '@/lib/db';

export async function GET() {
  try {
    const gasUrl = await getSetting('google_apps_script_url') || '';
    const targetStock = Number(await getSetting('target_ratio_stock') || '60');
    const targetBond = Number(await getSetting('target_ratio_bond') || '20');
    const targetGold = Number(await getSetting('target_ratio_gold') || '10');
    const targetCash = Number(await getSetting('target_ratio_cash') || '10');

    return NextResponse.json({
      gasUrl,
      isConnected: !!gasUrl,
      targetStock,
      targetBond,
      targetGold,
      targetCash,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gasUrl, targetStock, targetBond, targetGold, targetCash } = body;

    if (gasUrl !== undefined) {
      const trimmedUrl = gasUrl.trim();
      // Simple validation: must start with https://script.google.com/
      if (trimmedUrl !== '' && !trimmedUrl.startsWith('https://script.google.com/')) {
        return NextResponse.json({ error: '올바른 구글 앱스 스크립트 웹 앱 URL 형식이 아닙니다.' }, { status: 400 });
      }
      await setSetting('google_apps_script_url', trimmedUrl);
    }

    if (targetStock !== undefined && targetBond !== undefined && targetGold !== undefined && targetCash !== undefined) {
      const sum = Number(targetStock) + Number(targetBond) + Number(targetGold) + Number(targetCash);
      if (Math.abs(sum - 100) > 0.01) {
        return NextResponse.json({ error: '목표 자산 비중의 합계는 반드시 100%여야 합니다.' }, { status: 400 });
      }
      await setSetting('target_ratio_stock', String(targetStock));
      await setSetting('target_ratio_bond', String(targetBond));
      await setSetting('target_ratio_gold', String(targetGold));
      await setSetting('target_ratio_cash', String(targetCash));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    await setSetting('google_apps_script_url', '');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
