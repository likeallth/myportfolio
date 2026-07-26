import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/google-auth';

export async function GET() {
  try {
    const oauth2Client = getOAuth2Client();

    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });

    return NextResponse.redirect(authUrl);
  } catch (error: any) {
    console.error('Google OAuth Login Route Error:', error);
    return NextResponse.json({ error: error.message || 'Google OAuth URL 생성에 실패했습니다.' }, { status: 500 });
  }
}
