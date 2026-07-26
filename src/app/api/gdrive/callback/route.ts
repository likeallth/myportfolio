import { NextResponse } from 'next/server';
import { getOAuth2Client } from '@/lib/google-auth';
import { saveTokens } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    console.error('Google OAuth Callback Error:', error);
    return NextResponse.redirect(new URL('/settings?auth_error=' + encodeURIComponent(error), request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL('/settings?auth_error=no_code', request.url));
  }

  try {
    const oauth2Client = getOAuth2Client('http://localhost:3000/api/gdrive/callback');
    const { tokens } = await oauth2Client.getToken(code);

    if (tokens.access_token) {
      await saveTokens({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        expiry_date: tokens.expiry_date || null,
      });
    }

    return NextResponse.redirect(new URL('/settings?auth=success', request.url));
  } catch (err: any) {
    console.error('Failed to exchange code for tokens:', err);
    return NextResponse.redirect(new URL('/settings?auth_error=' + encodeURIComponent(err.message || 'token_exchange_failed'), request.url));
  }
}
