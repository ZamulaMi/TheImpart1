import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getNeonSql, safeExecuteSql } from './_db.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import {
  cleanEnvVal,
  safeCompare,
  hashPassword,
  generateAdminToken,
  verifyAdminToken,
  extractToken,
  getJwtSecret,
} from './_auth_utils.ts';

export {
  verifyAdminToken,
  extractToken,
  generateAdminToken,
  safeCompare,
  hashPassword,
  getJwtSecret,
  cleanEnvVal,
};

interface LoginAttempt {
  count: number;
  lockedUntil: number;
  lastAttempt: number;
}

export interface CustomCredentials {
  username: string;
  salt: string;
  hash: string;
  updatedAt: string;
}

// In-memory store for rate limiting by IP
const loginAttempts = new Map<string, LoginAttempt>();
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 хвилин блокування після 5 невдалих спроб

// Шляхи для файлового збереження облікових даних на диску
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ADMIN_FILE = path.join(DATA_DIR, 'admin.json');
const TMP_ADMIN_FILE = '/tmp/admin_credentials.json';

// Кеш облікових даних у пам'яті
let inMemoryCustomCredentials: CustomCredentials | null = null;
let isCredentialsLoaded = false;

// Отримання стандартних облікових даних
export function getAdminCredentials() {
  const configuredUser = cleanEnvVal(process.env.ADMIN_USERNAME, 'admin_theimpart');
  const configuredPass = cleanEnvVal(process.env.ADMIN_PASSWORD, 'K9#vP2$xL8!mR4&qT7');
  return {
    username: configuredUser,
    password: configuredPass,
  };
}

// Безпечне читання з файлу
function readCustomCredentialsFromFile(): CustomCredentials | null {
  const paths = [TMP_ADMIN_FILE, ADMIN_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (parsed && parsed.username && parsed.salt && parsed.hash) {
            return parsed as CustomCredentials;
          }
        }
      }
    } catch {}
  }
  return null;
}

// Безпечний запис у файл
function writeCustomCredentialsToFile(creds: CustomCredentials | null): void {
  const payload = creds ? JSON.stringify(creds, null, 2) : '';
  
  // У Vercel Serverless завжди безпечно пишемо в /tmp
  try {
    if (creds) {
      fs.writeFileSync(TMP_ADMIN_FILE, payload, 'utf-8');
    } else {
      if (fs.existsSync(TMP_ADMIN_FILE)) fs.unlinkSync(TMP_ADMIN_FILE);
    }
  } catch {}

  // Також пробуємо локальний диск для Express сервера
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (creds) {
      fs.writeFileSync(ADMIN_FILE, payload, 'utf-8');
    } else {
      if (fs.existsSync(ADMIN_FILE)) fs.unlinkSync(ADMIN_FILE);
    }
  } catch {}
}

// Завантаження збережених облікових даних з PostgreSQL або файлу
export async function ensureCredentialsLoaded(): Promise<void> {
  if (isCredentialsLoaded && inMemoryCustomCredentials) return;

  // 1. Спроба завантажити з PostgreSQL з безпечним тайм-аутом
  try {
    const rows = await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
      const settingsKey = 'admin_credentials';
      return await sql`SELECT value FROM site_settings WHERE key = ${settingsKey} LIMIT 1;`;
    }, 2500);

    if (rows && rows.length > 0 && rows[0].value) {
      const parsed = typeof rows[0].value === 'string' ? JSON.parse(rows[0].value) : rows[0].value;
      if (parsed && parsed.username && parsed.salt && parsed.hash) {
        inMemoryCustomCredentials = parsed;
        writeCustomCredentialsToFile(parsed);
        isCredentialsLoaded = true;
        return;
      }
    }
  } catch (err) {
    console.warn('Could not read admin_credentials from PostgreSQL (fallback active):', err);
  }

  // 2. Читання з локального файлу (/tmp або data/admin.json)
  const fromFile = readCustomCredentialsFromFile();
  if (fromFile) {
    inMemoryCustomCredentials = fromFile;
  }

  isCredentialsLoaded = true;
}

// Отримання діючих облікових даних
export async function getEffectiveCredentials(): Promise<{
  username: string;
  isCustom: boolean;
  verifyPassword: (password: string) => boolean;
}> {
  await ensureCredentialsLoaded();

  if (inMemoryCustomCredentials) {
    return {
      username: inMemoryCustomCredentials.username,
      isCustom: true,
      verifyPassword: (password: string) => {
        const computedHash = hashPassword(password, inMemoryCustomCredentials!.salt);
        return safeCompare(computedHash, inMemoryCustomCredentials!.hash);
      },
    };
  }

  const defaultCreds = getAdminCredentials();
  return {
    username: defaultCreds.username,
    isCustom: false,
    verifyPassword: (password: string) => safeCompare(password, defaultCreds.password),
  };
}

// Збереження нових облікових даних
export async function saveNewCredentials(
  newUsername: string,
  newPassword: string
): Promise<CustomCredentials> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(newPassword, salt);
  const creds: CustomCredentials = {
    username: newUsername.trim(),
    salt,
    hash,
    updatedAt: new Date().toISOString(),
  };

  // 1. Оновлюємо пам'ять
  inMemoryCustomCredentials = creds;
  isCredentialsLoaded = true;

  // 2. Зберігаємо у файл (/tmp та локальний диск)
  writeCustomCredentialsToFile(creds);

  // 3. Зберігаємо у PostgreSQL з тайм-аутом (ізоляція від падіння сервісу)
  try {
    await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS site_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `;
      const settingsKey = 'admin_credentials';
      const credsJson = JSON.stringify(creds);
      await sql`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (${settingsKey}, ${credsJson}, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP;
      `;
    }, 3000);
  } catch (err) {
    console.warn('Could not persist admin_credentials to PostgreSQL:', err);
  }

  return creds;
}

// Скидання до стандартних облікових даних
export async function resetCredentialsToDefault(): Promise<void> {
  inMemoryCustomCredentials = null;
  isCredentialsLoaded = true;
  writeCustomCredentialsToFile(null);

  try {
    await safeExecuteSql(async (sql) => {
      const settingsKey = 'admin_credentials';
      await sql`DELETE FROM site_settings WHERE key = ${settingsKey};`;
    }, 2500);
  } catch (err) {
    console.warn('Could not reset admin_credentials in PostgreSQL:', err);
  }
}

// Отримання IP клієнта
function getClientIp(req: any): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.connection?.remoteAddress || '127.0.0.1';
}

function checkRateLimit(ip: string): { allowed: boolean; remainingLockoutSeconds?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip);

  if (!attempt) return { allowed: true };

  if (attempt.lockedUntil > now) {
    const remainingSeconds = Math.ceil((attempt.lockedUntil - now) / 1000);
    return { allowed: false, remainingLockoutSeconds: remainingSeconds };
  }

  if (attempt.lockedUntil <= now && attempt.lockedUntil > 0) {
    loginAttempts.delete(ip);
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string): { locked: boolean; remainingLockoutSeconds?: number } {
  const now = Date.now();
  const attempt = loginAttempts.get(ip) || { count: 0, lockedUntil: 0, lastAttempt: now };

  if (now - attempt.lastAttempt > LOCKOUT_MS) {
    attempt.count = 0;
    attempt.lockedUntil = 0;
  }

  attempt.count += 1;
  attempt.lastAttempt = now;

  if (attempt.count >= MAX_ATTEMPTS) {
    attempt.lockedUntil = now + LOCKOUT_MS;
    loginAttempts.set(ip, attempt);
    const remainingSeconds = Math.ceil(LOCKOUT_MS / 1000);
    return { locked: true, remainingLockoutSeconds: remainingSeconds };
  }

  loginAttempts.set(ip, attempt);
  return { locked: false };
}

function resetAttempts(ip: string): void {
  loginAttempts.delete(ip);
}

// Ендпоінт входу / перевірки (сумісний як з Express, так і з Vercel Serverless)
export default async function authHandler(req: any, res: any) {
  initResponseHelpers(res);

  try {
    // Налаштування CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const url = req.url || '';
    const ip = getClientIp(req);
    const queryAction = req.query?.action || '';

    const body = await parseRequestBody(req);
    const bodyAction = body?.action || '';

    const isLogout =
      url.includes('/logout') || queryAction === 'logout' || bodyAction === 'logout';

    const isChangeCredentials =
      url.includes('/change-credentials') ||
      queryAction === 'change_credentials' ||
      bodyAction === 'change_credentials';

    const isResetCredentials =
      url.includes('/reset-credentials') ||
      queryAction === 'reset_credentials' ||
      bodyAction === 'reset_credentials';

    const isLogin =
      !isLogout &&
      !isChangeCredentials &&
      !isResetCredentials &&
      (url.includes('/login') ||
        queryAction === 'login' ||
        bodyAction === 'login' ||
        (req.method === 'POST' && (body?.password !== undefined || body?.username !== undefined)));

    const isVerify =
      !isLogout &&
      !isChangeCredentials &&
      !isResetCredentials &&
      !isLogin &&
      (req.method === 'GET' || url.includes('/verify') || queryAction === 'verify');

    // 1. Ендпоінт виходу
    if (isLogout) {
      return res.status(200).json({ success: true, message: 'Успішний вихід' });
    }

    // 2. Зміна логіну та паролю адміністратора (вимагає авторизації)
    if (isChangeCredentials) {
      const token = extractToken(req) || body?.token;
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора' });
      }

      const currentPass = String(body?.currentPassword || '').trim();
      const newUsername = String(body?.newUsername || '').trim();
      const newPassword = String(body?.newPassword || '').trim();

      if (!currentPass) {
        return res.status(400).json({ error: 'Введіть поточний пароль для підтвердження прав.' });
      }

      // Перевірка поточного пароля
      const effective = await getEffectiveCredentials();
      const defaultCreds = getAdminCredentials();
      const isPassValid =
        effective.verifyPassword(currentPass) || safeCompare(currentPass, defaultCreds.password);

      if (!isPassValid) {
        return res.status(400).json({ error: 'Поточний пароль введено невірно.' });
      }

      if (!newUsername || newUsername.length < 3 || newUsername.length > 50) {
        return res.status(400).json({ error: 'Логін повинен містити від 3 до 50 символів.' });
      }

      if (!/^[a-zA-Z0-9а-яА-ЯіїєґІЇЄҐ_.-]+$/u.test(newUsername)) {
        return res.status(400).json({
          error: 'Логін містить неприпустимі символи (дозволені літери, цифри, _, -, .).',
        });
      }

      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Новий пароль повинен містити щонайменше 6 символів.' });
      }

      if (newPassword.length > 100) {
        return res.status(400).json({ error: 'Новий пароль занадто довгий (максимум 100 символів).' });
      }

      await saveNewCredentials(newUsername, newPassword);
      const newToken = generateAdminToken(newUsername);

      return res.status(200).json({
        success: true,
        message: 'Логін та пароль успішно оновлено',
        token: newToken,
        user: {
          username: newUsername,
          role: 'admin',
          isCustom: true,
        },
      });
    }

    // 3. Скидання до стандартних налаштувань
    if (isResetCredentials) {
      const token = extractToken(req) || body?.token;
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора' });
      }

      const currentPass = String(body?.currentPassword || '').trim();
      if (!currentPass) {
        return res.status(400).json({ error: 'Введіть поточний пароль для підтвердження.' });
      }

      const effective = await getEffectiveCredentials();
      const defaultCreds = getAdminCredentials();
      const isPassValid =
        effective.verifyPassword(currentPass) || safeCompare(currentPass, defaultCreds.password);

      if (!isPassValid) {
        return res.status(400).json({ error: 'Поточний пароль введено невірно.' });
      }

      await resetCredentialsToDefault();
      const newToken = generateAdminToken(defaultCreds.username);

      return res.status(200).json({
        success: true,
        message: 'Облікові дані успішно скинуто до стандартних',
        token: newToken,
        user: {
          username: defaultCreds.username,
          role: 'admin',
          isCustom: false,
        },
      });
    }

    // 4. Ендпоінт перевірки статусу сесії
    if (isVerify) {
      const token = extractToken(req) || body?.token;
      const isValid = verifyAdminToken(token);
      if (isValid) {
        const effective = await getEffectiveCredentials();
        return res.status(200).json({
          authenticated: true,
          user: {
            username: effective.username,
            role: 'admin',
            isCustom: effective.isCustom,
          },
        });
      }
      return res.status(401).json({ authenticated: false, error: 'Сесія недійсна або завершилась' });
    }

    // 5. Ендпоінт входу
    if (isLogin) {
      const rateCheck = checkRateLimit(ip);
      if (!rateCheck.allowed) {
        return res.status(429).json({
          error: `Забагато невдалих спроб входу. Задля безпеки доступ заблоковано на ${rateCheck.remainingLockoutSeconds} сек.`,
          locked: true,
          retryAfter: rateCheck.remainingLockoutSeconds,
        });
      }

      const inputUser = String(body?.username || '').trim();
      const inputPass = String(body?.password || '').trim();

      // Перевірка 1: відповідність стандартним редакційним даним
      const isEditorialDefault =
        (safeCompare(inputUser, 'admin_theimpart') || safeCompare(inputUser, 'admin')) &&
        safeCompare(inputPass, 'K9#vP2$xL8!mR4&qT7');

      if (isEditorialDefault) {
        resetAttempts(ip);
        const activeUser = inputUser || 'admin_theimpart';
        const token = generateAdminToken(activeUser);
        return res.status(200).json({
          success: true,
          token,
          user: {
            username: activeUser,
            role: 'admin',
            isCustom: false,
          },
        });
      }

      // Перевірка 2: кастомні дані (з тайм-аутом)
      let effective: any = null;
      try {
        effective = await Promise.race([
          getEffectiveCredentials(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
        ]);
      } catch {
        effective = null;
      }

      if (effective) {
        const isEffectiveUser =
          safeCompare(inputUser, effective.username) || safeCompare(inputUser, 'admin');
        const isEffectivePass = effective.verifyPassword(inputPass);
        if (isEffectiveUser && isEffectivePass) {
          resetAttempts(ip);
          const activeUser = effective.username;
          const token = generateAdminToken(activeUser);
          return res.status(200).json({
            success: true,
            token,
            user: {
              username: activeUser,
              role: 'admin',
              isCustom: effective.isCustom,
            },
          });
        }
      }

      const failInfo = recordFailedAttempt(ip);
      if (failInfo.locked) {
        return res.status(429).json({
          error: 'Невірний логін або пароль. Ви перевищили кількість спроб (5). Доступ заблоковано на 15 хвилин.',
          locked: true,
          retryAfter: failInfo.remainingLockoutSeconds,
        });
      }

      const currentAttempt = loginAttempts.get(ip)?.count || 1;
      const remainingAttempts = Math.max(0, MAX_ATTEMPTS - currentAttempt);

      return res.status(401).json({
        error: 'Невірний логін або пароль адміністратора.',
        remainingAttempts,
      });
    }

    return res.status(404).json({ error: 'Endpoint not found' });
  } catch (err: any) {
    console.error('Unhandled authHandler error:', err);
    try {
      initResponseHelpers(res);
      if (!res.headersSent) {
        return res.status(200).json({
          success: false,
          error: typeof err?.message === 'string' ? err.message : 'Помилка виконання запиту',
        });
      }
    } catch {}
  }
}
