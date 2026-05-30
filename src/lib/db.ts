import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let dbInstance: Database | null = null;

// Database file path
const DB_PATH = path.join(process.cwd(), 'data', 'portfolio.db');

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

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
}

// Helpers for settings table
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
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
  const db = await getDb();
  // Get the latest saved token
  const row = await db.get('SELECT access_token, refresh_token, expiry_date FROM auth_tokens ORDER BY id DESC LIMIT 1');
  if (!row) return null;
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.expiry_date,
  };
}

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  const db = await getDb();
  
  // We can check if a refresh token already exists in DB to avoid overwriting it with null
  // (Google OAuth only returns refresh_token on the first authorization flow)
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
}

export async function clearTokens(): Promise<void> {
  const db = await getDb();
  await db.run('DELETE FROM auth_tokens');
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
  const db = await getDb();
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
}

export async function savePortfolioCache(assets: CachedAsset[]): Promise<void> {
  const db = await getDb();
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
    throw err;
  }
}
