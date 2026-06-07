import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: Database | null = null;

// Database file path
const DB_PATH = path.join(process.cwd(), 'data', 'portfolio.db');

export async function getDb(): Promise<Database | null> {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure data directory exists locally
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    try {
      fs.mkdirSync(dataDir, { recursive: true });
    } catch (err) {
      console.warn(`Failed to create data directory ${dataDir} (this is normal in read-only environments like Vercel):`, err);
    }
  }

  try {
    // Open database connection
    dbInstance = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });

    // Initialize tables
    await dbInstance.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS auth_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expiry_date INTEGER,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portfolio_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account TEXT NOT NULL,
        asset_name TEXT NOT NULL,
        symbol TEXT,
        quantity REAL NOT NULL,
        avg_price REAL NOT NULL,
        eval_amount REAL NOT NULL,
        profit_loss REAL NOT NULL,
        yield_pct REAL NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    return dbInstance;
  } catch (err) {
    console.warn('SQLite initialization failed (running in environment-variable fallback mode):', err);
    return null;
  }
}

// Helpers for settings table
export async function getSetting(key: string): Promise<string | null> {
  // First check environment variables for Vercel deployment compatibility
  if (key === 'google_apps_script_url' && process.env.GOOGLE_APPS_SCRIPT_URL) {
    return process.env.GOOGLE_APPS_SCRIPT_URL;
  }
  if (key === 'target_ratio_stock' && process.env.TARGET_RATIO_STOCK) {
    return process.env.TARGET_RATIO_STOCK;
  }
  if (key === 'target_ratio_bond' && process.env.TARGET_RATIO_BOND) {
    return process.env.TARGET_RATIO_BOND;
  }
  if (key === 'target_ratio_gold' && process.env.TARGET_RATIO_GOLD) {
    return process.env.TARGET_RATIO_GOLD;
  }
  if (key === 'target_ratio_cash' && process.env.TARGET_RATIO_CASH) {
    return process.env.TARGET_RATIO_CASH;
  }

  try {
    const db = await getDb();
    if (!db) return null;
    const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
    return row ? row.value : null;
  } catch (err) {
    console.warn(`Database read failed for key ${key}:`, err);
    return null;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error('데이터베이스 연결 실패. 클라우드 환경(Vercel)에서는 대시보드의 환경 변수를 사용해 설정해야 합니다.');
  }
  await db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value
  );
}

// Helpers for auth_tokens table
export interface AuthTokens {
  access_token: string;
  refresh_token?: string | null;
  expiry_date?: number | null;
}

export async function getTokens(): Promise<AuthTokens | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    // Get the latest saved token
    const row = await db.get('SELECT access_token, refresh_token, expiry_date FROM auth_tokens ORDER BY id DESC LIMIT 1');
    if (!row) return null;
    return {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expiry_date: row.expiry_date,
    };
  } catch (err) {
    console.warn('Failed to retrieve OAuth tokens:', err);
    return null;
  }
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    
    // We can check if a refresh token already exists in DB to avoid overwriting it with null
    let refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      const existing = await getTokens();
      if (existing && existing.refresh_token) {
        refreshToken = existing.refresh_token;
      }
    }

    // Clear old tokens to avoid build up, then insert
    await db.run('DELETE FROM auth_tokens');
    await db.run(
      'INSERT INTO auth_tokens (access_token, refresh_token, expiry_date, created_at) VALUES (?, ?, ?, ?)',
      tokens.access_token,
      refreshToken || null,
      tokens.expiry_date || null,
      Date.now()
    );
  } catch (err) {
    console.warn('Failed to save OAuth tokens:', err);
  }
}

export async function clearTokens(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db.run('DELETE FROM auth_tokens');
  } catch (err) {
    console.warn('Failed to clear OAuth tokens:', err);
  }
}

// Helpers for portfolio cache
export interface CachedAsset {
  account: string;
  asset_name: string;
  symbol: string | null;
  quantity: number;
  avg_price: number;
  eval_amount: number;
  profit_loss: number;
  yield_pct: number;
}

export async function getCachedPortfolio(account?: string): Promise<CachedAsset[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    let rows;
    if (account) {
      rows = await db.all('SELECT * FROM portfolio_cache WHERE account = ?', account);
    } else {
      rows = await db.all('SELECT * FROM portfolio_cache');
    }
    return rows.map(r => ({
      account: r.account,
      asset_name: r.asset_name,
      symbol: r.symbol,
      quantity: r.quantity,
      avg_price: r.avg_price,
      eval_amount: r.eval_amount,
      profit_loss: r.profit_loss,
      yield_pct: r.yield_pct,
    }));
  } catch (err) {
    console.warn('Failed to load cached portfolio:', err);
    return [];
  }
}

export async function savePortfolioCache(assets: CachedAsset[]): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.warn('Database not initialized. Skipping portfolio cache save.');
    return;
  }
  // Wrap in a transaction for speed and safety
  await db.run('BEGIN TRANSACTION');
  try {
    // If we have new data, we replace the cache for the accounts present in the new list
    const accounts = Array.from(new Set(assets.map(a => a.account)));
    for (const acc of accounts) {
      await db.run('DELETE FROM portfolio_cache WHERE account = ?', acc);
    }
    
    const stmt = await db.prepare(
      'INSERT INTO portfolio_cache (account, asset_name, symbol, quantity, avg_price, eval_amount, profit_loss, yield_pct, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const now = Date.now();
    for (const asset of assets) {
      await stmt.run(
        asset.account,
        asset.asset_name,
        asset.symbol,
        asset.quantity,
        asset.avg_price,
        asset.eval_amount,
        asset.profit_loss,
        asset.yield_pct,
        now
      );
    }
    await stmt.finalize();
    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    console.error('Failed to save portfolio cache:', err);
  }
}
