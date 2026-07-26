import { google } from 'googleapis';
import { getTokens, saveTokens } from '@/lib/db';
import fs from 'fs';
import path from 'path';

// Path to local OAuth Client Secret JSON file
const CLIENT_SECRET_FILE = path.join(process.cwd(), '..', 'api', 'ebook-capture', 'client_secret_943048826981-qojunht6lurr54vh5sh01kuah8pv195v.apps.googleusercontent.com.json');

export function getOAuth2Client(redirectUri?: string) {
  let clientId = process.env.GOOGLE_CLIENT_ID || '';
  let clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  let fileRedirectUri: string | null = null;

  if (fs.existsSync(CLIENT_SECRET_FILE)) {
    try {
      const fileContent = fs.readFileSync(CLIENT_SECRET_FILE, 'utf-8');
      const json = JSON.parse(fileContent);
      const web = json.web || json.installed;
      if (web) {
        clientId = web.client_id || clientId;
        clientSecret = web.client_secret || clientSecret;
        if (web.redirect_uris && web.redirect_uris.length > 0) {
          fileRedirectUri = web.redirect_uris[0];
        }
      }
    } catch (e) {
      console.warn('Failed to parse client_secret JSON:', e);
    }
  }

  const finalRedirectUri = redirectUri || fileRedirectUri || 'http://localhost:3000/api/gdrive/callback';

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    finalRedirectUri
  );
}

export async function getAuthenticatedSheetsClient() {
  const tokens = await getTokens();
  if (!tokens || (!tokens.access_token && !tokens.refresh_token)) {
    return null;
  }

  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
  });

  oauth2Client.on('tokens', async (newTokens) => {
    await saveTokens({
      access_token: newTokens.access_token || tokens.access_token,
      refresh_token: newTokens.refresh_token || tokens.refresh_token,
      expiry_date: newTokens.expiry_date || tokens.expiry_date,
    });
  });

  return google.sheets({ version: 'v4', auth: oauth2Client });
}
