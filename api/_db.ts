/**
 * Cloudflare D1 (SQL Database) & Cloudflare R2 (Object Storage) Client
 * Робота суто через Cloudflare API Tokens (Bearer Authorization).
 */

import dotenv from 'dotenv';
dotenv.config({ override: true });

// Стан тимчасового блокування запитів при невірних облікових даних (запобігає спаму 401)
let authDisabledUntil = 0;
let lastReportedAuthMsg = '';

function isAuthThrottled(): boolean {
  return Date.now() < authDisabledUntil;
}

export function markAuthFailed(errorMsg: string): void {
  authDisabledUntil = Date.now() + 60000; // 60 секунд паузи перед наступною спробою
  if (lastReportedAuthMsg !== errorMsg) {
    lastReportedAuthMsg = errorMsg;
    console.warn(`[Cloudflare D1] ${errorMsg}`);
  }
}

function cleanEnv(val: string | undefined): string {
  if (!val) return '';
  let str = val.trim();
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

// 1. Конфігурація Cloudflare D1
export interface CloudflareD1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export function getCloudflareD1Config(): CloudflareD1Config | null {
  const accountId = cleanEnv(
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID
  );

  const databaseId = cleanEnv(
    process.env.CLOUDFLARE_DATABASE_ID ||
      process.env.CLOUDFLARE_D1_DATABASE_ID ||
      process.env.D1_DATABASE_ID
  );

  const apiToken = cleanEnv(
    process.env.CLOUDFLARE_D1_TOKEN ||
      process.env.CLOUDFLARE_API_TOKEN ||
      process.env.CF_API_TOKEN
  );

  if (accountId && databaseId && apiToken) {
    return { accountId, databaseId, apiToken };
  }

  return null;
}

export function isCloudflareD1Configured(): boolean {
  return getCloudflareD1Config() !== null && !isAuthThrottled();
}

function getCloudflareAuthHeaders(apiToken: string): Record<string, string> {
  const cleanToken = apiToken.replace(/^Bearer\s+/i, '').trim();
  return {
    Authorization: `Bearer ${cleanToken}`,
  };
}

// 2. Виконання SQL-запитів до Cloudflare D1 через REST API
export async function queryCloudflareD1(
  config: CloudflareD1Config,
  sqlText: string,
  params: any[] = []
): Promise<any[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  const sanitizedParams = params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });

  const authHeaders = getCloudflareAuthHeaders(config.apiToken);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql: sqlText.trim(),
      params: sanitizedParams,
    }),
  });

  if (response.status === 401) {
    markAuthFailed('Помилка автентифікації Cloudflare D1 (HTTP 401). Перевірте правильність токена CLOUDFLARE_API_TOKEN.');
    return [];
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Cloudflare D1 HTTP ${response.status}: ${errorText}`);
  }

  const json: any = await response.json();
  if (!json.success && json.errors && json.errors.length > 0) {
    const msg = json.errors.map((e: any) => e.message || JSON.stringify(e)).join(', ');
    throw new Error(`Cloudflare D1 query error: ${msg}`);
  }

  const resultObj = json.result?.[0];
  if (resultObj && Array.isArray(resultObj.results)) {
    return resultObj.results;
  }

  return [];
}

// 3. Універсальний клієнт бази даних Cloudflare D1
export function getDbClient(): any | null {
  if (isAuthThrottled()) {
    return null;
  }

  const d1Config = getCloudflareD1Config();
  if (!d1Config) {
    return null;
  }

  const d1Sql = async (
    stringsOrQuery: TemplateStringsArray | string,
    ...values: any[]
  ) => {
    let sqlText = '';
    let params: any[] = [];

    if (typeof stringsOrQuery === 'string') {
      sqlText = stringsOrQuery;
      params = values[0] && Array.isArray(values[0]) ? values[0] : values;
    } else if (Array.isArray(stringsOrQuery) && (stringsOrQuery as any).raw) {
      for (let i = 0; i < stringsOrQuery.length; i++) {
        sqlText += stringsOrQuery[i];
        if (i < values.length) {
          sqlText += '?';
          params.push(values[i]);
        }
      }
    } else {
      throw new Error('Invalid SQL input');
    }

    return await queryCloudflareD1(d1Config, sqlText, params);
  };

  return d1Sql;
}

// 4. Безпечне виконання SQL-запиту з тайм-аутом
export async function safeExecuteSql<T = any>(
  sqlFn: (sql: any) => Promise<T>,
  timeoutMs: number = 5000
): Promise<T | null> {
  const sql = getDbClient();
  if (!sql) return null;

  try {
    const result = await Promise.race([
      sqlFn(sql),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Cloudflare D1 SQL timeout')), timeoutMs)
      ),
    ]);
    return result;
  } catch (err: any) {
    if (err?.message?.includes('401') || err?.message?.includes('Authentication error')) {
      markAuthFailed(err.message);
    } else {
      console.warn('Cloudflare D1 query notice:', err?.message || err);
    }
    return null;
  }
}

// 5. Конфігурація Cloudflare R2 (Сховище медіафайлів / зображень)
export interface CloudflareR2Config {
  accountId: string;
  apiToken: string;
  bucketName: string;
  publicUrl?: string;
}

export function getCloudflareR2Config(): CloudflareR2Config | null {
  const accountId = cleanEnv(
    process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID
  );

  const apiToken = cleanEnv(
    process.env.CLOUDFLARE_R2_TOKEN ||
      process.env.CLOUDFLARE_API_TOKEN ||
      process.env.CF_API_TOKEN
  );

  const bucketName = cleanEnv(
    process.env.CLOUDFLARE_R2_BUCKET_NAME ||
      process.env.CLOUDFLARE_R2_BUCKET ||
      process.env.R2_BUCKET_NAME
  );

  const publicUrl = cleanEnv(
    process.env.CLOUDFLARE_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL
  ).replace(/\/+$/, '');

  if (accountId && apiToken && bucketName) {
    return {
      accountId,
      apiToken,
      bucketName,
      publicUrl: publicUrl || undefined,
    };
  }

  return null;
}

export function isCloudflareR2Configured(): boolean {
  return getCloudflareR2Config() !== null;
}

// 6. Завантаження файлу в Cloudflare R2 через офіційний REST API
export async function uploadToCloudflareR2(
  objectKey: string,
  buffer: Buffer,
  mimeType: string = 'image/jpeg'
): Promise<{ success: boolean; url: string; key: string } | null> {
  const config = getCloudflareR2Config();
  if (!config) return null;

  const cleanKey = objectKey.replace(/^\/+/, '');
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucketName}/objects/${encodeURIComponent(cleanKey)}`;
  const authHeaders = getCloudflareAuthHeaders(config.apiToken);

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...authHeaders,
        'Content-Type': mimeType,
      },
      body: buffer as any,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Cloudflare R2 upload error (${response.status}): ${errText}`);
    }

    if (config.publicUrl) {
      return {
        success: true,
        url: `${config.publicUrl}/${cleanKey}`,
        key: cleanKey,
      };
    }

    return {
      success: true,
      url: `/api/media/${cleanKey}`,
      key: cleanKey,
    };
  } catch (err) {
    console.warn('Cloudflare R2 upload fallback active:', err);
    return null;
  }
}

// 7. Отримання файлу з Cloudflare R2
export async function getFromCloudflareR2(
  objectKey: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const config = getCloudflareR2Config();
  if (!config) return null;

  const cleanKey = objectKey.replace(/^\/+/, '');
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/r2/buckets/${config.bucketName}/objects/${encodeURIComponent(cleanKey)}`;
  const authHeaders = getCloudflareAuthHeaders(config.apiToken);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: authHeaders,
    });

    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'application/octet-stream';

    return {
      buffer: Buffer.from(arrayBuffer),
      contentType,
    };
  } catch (err) {
    return null;
  }
}
