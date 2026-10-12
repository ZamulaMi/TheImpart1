/**
 * Cloudflare D1 (SQL Database) & Cloudflare R2 (Object Storage) Client
 * Повністю видалено Vercel та Postgres/Neon — робота суто з серверами Cloudflare.
 */

// 1. Конфігурація Cloudflare D1
export interface CloudflareD1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export function getCloudflareD1Config(): CloudflareD1Config | null {
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    ''
  ).trim();

  const databaseId = (
    process.env.CLOUDFLARE_DATABASE_ID ||
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.D1_DATABASE_ID ||
    ''
  ).trim();

  const apiToken = (
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_D1_TOKEN ||
    process.env.CF_API_TOKEN ||
    ''
  ).trim();

  if (accountId && databaseId && apiToken) {
    return { accountId, databaseId, apiToken };
  }

  return null;
}

export function isCloudflareD1Configured(): boolean {
  return getCloudflareD1Config() !== null;
}

// 2. Виконання SQL-запитів до Cloudflare D1 через REST API
export async function queryCloudflareD1(
  config: CloudflareD1Config,
  sqlText: string,
  params: any[] = []
): Promise<any[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  // Нормалізація параметрів для SQLite у Cloudflare D1:
  // booleans -> 1/0, undefined -> null
  const sanitizedParams = params.map((p) => {
    if (p === undefined) return null;
    if (typeof p === 'boolean') return p ? 1 : 0;
    return p;
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql: sqlText.trim(),
      params: sanitizedParams,
    }),
  });

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
  timeoutMs: number = 6000
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
  } catch (err) {
    console.warn('Cloudflare D1 query error/warning:', err);
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
  const accountId = (
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID ||
    ''
  ).trim();

  const apiToken = (
    process.env.CLOUDFLARE_R2_TOKEN ||
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CF_API_TOKEN ||
    ''
  ).trim();

  const bucketName = (
    process.env.CLOUDFLARE_R2_BUCKET_NAME ||
    process.env.CLOUDFLARE_R2_BUCKET ||
    process.env.R2_BUCKET_NAME ||
    ''
  ).trim();

  const publicUrl = (
    process.env.CLOUDFLARE_R2_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    ''
  ).trim().replace(/\/+$/, '');

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

  try {
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        'Content-Type': mimeType,
      },
      body: buffer as any,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`Cloudflare R2 upload error (${response.status}): ${errText}`);
    }

    // Якщо налаштовано публічний домен R2 (custom domain або pub-xxx.r2.dev)
    if (config.publicUrl) {
      return {
        success: true,
        url: `${config.publicUrl}/${cleanKey}`,
        key: cleanKey,
      };
    }

    // Якщо публічний домен не задано — роздаємо через безпечний проксі сервера /api/media/:key
    return {
      success: true,
      url: `/api/media/${cleanKey}`,
      key: cleanKey,
    };
  } catch (err) {
    console.error('Cloudflare R2 upload exception:', err);
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

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
      },
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
    console.error('Cloudflare R2 fetch error:', err);
    return null;
  }
}
