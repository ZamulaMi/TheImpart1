import { neon } from '@neondatabase/serverless';

// 1. Конфігурація Cloudflare D1
export interface CloudflareD1Config {
  accountId: string;
  databaseId: string;
  apiToken: string;
}

export function getCloudflareD1Config(): CloudflareD1Config | null {
  const accountId =
    process.env.CLOUDFLARE_ACCOUNT_ID ||
    process.env.CF_ACCOUNT_ID;

  const databaseId =
    process.env.CLOUDFLARE_DATABASE_ID ||
    process.env.CLOUDFLARE_D1_DATABASE_ID ||
    process.env.D1_DATABASE_ID;

  const apiToken =
    process.env.CLOUDFLARE_API_TOKEN ||
    process.env.CLOUDFLARE_D1_TOKEN ||
    process.env.CF_API_TOKEN;

  if (accountId && databaseId && apiToken) {
    return {
      accountId: accountId.trim(),
      databaseId: databaseId.trim(),
      apiToken: apiToken.trim(),
    };
  }

  return null;
}

// 2. Виконання запитів до Cloudflare D1 через офіційний REST API
async function queryCloudflareD1(
  config: CloudflareD1Config,
  sqlText: string,
  params: any[] = []
): Promise<any[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database/${config.databaseId}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql: sqlText.trim(),
      params: params.map((p) => (p === undefined ? null : p)),
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

// 3. Очищення рядка підключення: автоматично витягує чистий postgresql://...
export function cleanConnectionString(raw?: string): string | undefined {
  if (!raw) return undefined;
  const str = raw.trim();

  const match = str.match(/postgres(?:ql)?:\/\/[^\s"'`]+/i);
  if (match) {
    let extracted = match[0].trim();
    extracted = extracted.replace(/[;"'`\\]+$/, '').trim();
    return extracted;
  }

  return undefined;
}

// 4. Отримання клієнта PostgreSQL / Cloudflare Hyperdrive
export function getNeonSql(): any | null {
  const candidateKeys = [
    'CLOUDFLARE_HYPERDRIVE_URL',
    'DATABASE_URL',
    'POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'DATABASE_URL_UNPOOLED',
    'POSTGRES_URL_NON_POOLING',
    'POSTGRES_URL_NO_SSL',
  ] as const;

  let connectionString: string | undefined;

  for (const k of candidateKeys) {
    const val = cleanConnectionString(process.env[k]);
    if (val) {
      connectionString = val;
      break;
    }
  }

  // Якщо рядок передано через окремі змінні PGHOST / PGUSER
  if (!connectionString && process.env.PGUSER && process.env.PGHOST && process.env.PGDATABASE) {
    const user = process.env.PGUSER;
    const pass = process.env.PGPASSWORD || '';
    const host = process.env.PGHOST;
    const db = process.env.PGDATABASE;
    connectionString = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/${db}?sslmode=require`;
  }

  if (!connectionString) {
    return null;
  }

  try {
    return neon(connectionString);
  } catch (err) {
    console.warn('Hyperdrive/Postgres client initialization error:', err);
    return null;
  }
}

// 5. Отримання універсального клієнта бази даних (пріоритет: Cloudflare D1 -> Hyperdrive/Postgres)
export function getDbClient(): any | null {
  const d1Config = getCloudflareD1Config();
  if (d1Config) {
    // Повертаємо клієнт з підтримкою tagged template literals
    const d1TaggedSql = async (
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

    return d1TaggedSql;
  }

  return getNeonSql();
}

// 6. Безпечне виконання SQL-запиту з тайм-аутом (запобігає зависанню сервера)
export async function safeExecuteSql<T = any>(
  sqlFn: (sql: any) => Promise<T>,
  timeoutMs: number = 4000
): Promise<T | null> {
  const sql = getDbClient();
  if (!sql) return null;

  try {
    const result = await Promise.race([
      sqlFn(sql),
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('SQL query timeout')), timeoutMs)
      ),
    ]);
    return result;
  } catch (err) {
    console.warn('Safe SQL query execution warning:', err);
    return null;
  }
}

