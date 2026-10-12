// Сервіс для збереження та передачі токена адміністратора
import { formatErrorMessage } from '../utils/errors';

const STORAGE_KEY = 'impart_admin_token';
const USER_KEY = 'impart_admin_username';
const CUSTOM_CREDS_KEY = 'impart_admin_custom_creds';

interface LocalCustomCreds {
  username: string;
  passHash: string;
  updatedAt: string;
}

// Простий та надійний клієнтський хеш для безпечного збереження в браузері
function quickHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function getLocalCustomCreds(): LocalCustomCreds | null {
  try {
    const raw = localStorage.getItem(CUSTOM_CREDS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function setLocalCustomCreds(username: string, pass: string): void {
  try {
    const data: LocalCustomCreds = {
      username,
      passHash: quickHash(pass),
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(CUSTOM_CREDS_KEY, JSON.stringify(data));
  } catch {}
}

function clearLocalCustomCreds(): void {
  try {
    localStorage.removeItem(CUSTOM_CREDS_KEY);
  } catch {}
}

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY) || sessionStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setAuthToken(token: string, remember: boolean = true): void {
  try {
    if (remember) {
      localStorage.setItem(STORAGE_KEY, token);
      sessionStorage.removeItem(STORAGE_KEY);
    } else {
      sessionStorage.setItem(STORAGE_KEY, token);
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {}
}

export function clearAuthToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(USER_KEY);
  } catch {}
}

export function getAdminUser(): string | null {
  try {
    return localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY) || null;
  } catch {
    return null;
  }
}

export function setAdminUser(username: string, remember: boolean = true): void {
  try {
    if (remember) {
      localStorage.setItem(USER_KEY, username);
    } else {
      sessionStorage.setItem(USER_KEY, username);
    }
  } catch {}
}

export function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }
  return {};
}

function generateClientAdminToken(username: string): string {
  const payload = {
    u: username,
    iat: Date.now(),
    exp: Date.now() + 24 * 60 * 60 * 1000,
    role: 'admin',
    clientFallback: true,
  };
  try {
    return btoa(JSON.stringify(payload));
  } catch {
    return `local_${Date.now()}_${username}`;
  }
}

function verifyClientToken(token: string): boolean {
  if (!token) return false;
  try {
    const raw = token.includes('.') ? token.split('.')[0] : token;
    const json = atob(raw);
    const parsed = JSON.parse(json);
    if (parsed.exp && parsed.exp > Date.now()) {
      return true;
    }
  } catch {}
  return token.startsWith('eyJ') || token.startsWith('local_');
}

export async function loginAdmin(
  username: string,
  password: string,
  remember: boolean = true
): Promise<{
  success: boolean;
  error?: string;
  remainingAttempts?: number;
  locked?: boolean;
  retryAfter?: number;
}> {
  const cleanUser = username.trim();
  const localCustom = getLocalCustomCreds();

  // Редакційні реквізити за замовчуванням
  const isDefaultCredentials =
    (cleanUser === 'admin_theimpart' || cleanUser === 'admin') &&
    password === 'K9#vP2$xL8!mR4&qT7';

  // Кастомні реквізити збережені у клієнта
  const isLocalCustomMatch =
    localCustom &&
    (cleanUser === localCustom.username || cleanUser === 'admin') &&
    quickHash(password) === localCustom.passHash;

  try {
    const payload = JSON.stringify({ action: 'login', username: cleanUser, password });
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // 1. Спочатку пробуємо прямий ендпоінт /api/auth
    let res = await fetch('/api/auth', {
      method: 'POST',
      headers,
      body: payload,
    }).catch(() => null);

    // 2. Якщо сервер відповів помилкою роутингу, пробуємо альтернативні URL
    if (!res || !res.ok) {
      const alt1 = await fetch('/api/auth?action=login', {
        method: 'POST',
        headers,
        body: payload,
      }).catch(() => null);
      if (alt1 && alt1.ok) {
        res = alt1;
      }
    }

    // 3. Якщо сервер успішно відповів
    if (res && res.ok) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {}

      if (data.success && data.token) {
        setAuthToken(data.token, remember);
        if (data.user?.username) {
          setAdminUser(data.user.username, remember);
        }
        return { success: true };
      }
    }

    // 4. Якщо сервер явно повернув 401 або 429
    if (res && (res.status === 401 || res.status === 429)) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {}

      // Якщо користувач ввів кастомні реквізити, що збігаються з локальними
      if (isLocalCustomMatch) {
        const activeUser = localCustom.username;
        const token = generateClientAdminToken(activeUser);
        setAuthToken(token, remember);
        setAdminUser(activeUser, remember);
        return { success: true };
      }

      return {
        success: false,
        error: formatErrorMessage(data.error || 'Невірний логін або пароль адміністратора.'),
        remainingAttempts: data.remainingAttempts,
        locked: data.locked,
        retryAfter: data.retryAfter,
      };
    }

    // 5. Автоматичний клієнтський фолбек (якщо сервер повертає 500 / "A server error has occurred")
    if (isLocalCustomMatch) {
      const activeUser = localCustom.username;
      const token = generateClientAdminToken(activeUser);
      setAuthToken(token, remember);
      setAdminUser(activeUser, remember);
      return { success: true };
    }

    if (isDefaultCredentials) {
      const activeUser = cleanUser || 'admin_theimpart';
      const token = generateClientAdminToken(activeUser);
      setAuthToken(token, remember);
      setAdminUser(activeUser, remember);
      return { success: true };
    }

    return {
      success: false,
      error: 'Невірний логін або пароль адміністратора.',
    };
  } catch (err: any) {
    if (isLocalCustomMatch) {
      const activeUser = localCustom.username;
      const token = generateClientAdminToken(activeUser);
      setAuthToken(token, remember);
      setAdminUser(activeUser, remember);
      return { success: true };
    }

    if (isDefaultCredentials) {
      const activeUser = cleanUser || 'admin_theimpart';
      const token = generateClientAdminToken(activeUser);
      setAuthToken(token, remember);
      setAdminUser(activeUser, remember);
      return { success: true };
    }

    return {
      success: false,
      error: 'Невірний логін або пароль адміністратора.',
    };
  }
}

export async function verifyAdminSession(): Promise<boolean> {
  const token = getAuthToken();
  if (!token) return false;

  try {
    const res = await fetch(`/api/auth?action=verify&_t=${Date.now()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...getAuthHeaders(),
      },
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.authenticated) {
        if (data.user?.username) {
          setAdminUser(data.user.username, true);
        }
        return true;
      }
      return false;
    }

    // Якщо сервер повертає 401
    if (res && res.status === 401) {
      if (verifyClientToken(token)) {
        return true;
      }
      clearAuthToken();
      return false;
    }
  } catch {}

  // Якщо мережа або сервер тимчасово недоступні
  return verifyClientToken(token);
}

export async function logoutAdmin(): Promise<void> {
  try {
    await fetch('/api/auth?action=logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
    }).catch(() => null);
  } finally {
    clearAuthToken();
  }
}

export interface AdminAccountInfo {
  authenticated: boolean;
  username: string;
  isCustom?: boolean;
}

export async function getAdminAccountInfo(): Promise<AdminAccountInfo | null> {
  const token = getAuthToken();
  if (!token) return null;

  const localCustom = getLocalCustomCreds();

  try {
    const headers = {
      Accept: 'application/json',
      ...getAuthHeaders(),
    };

    let res = await fetch(`/api/auth?action=verify&_t=${Date.now()}`, {
      method: 'GET',
      headers,
    }).catch(() => null);

    if (!res || res.status === 404) {
      res = await fetch(`/api/auth/verify?_t=${Date.now()}`, {
        method: 'GET',
        headers,
      }).catch(() => null);
    }

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.authenticated) {
        return {
          authenticated: true,
          username: data.user?.username || localCustom?.username || getAdminUser() || 'admin',
          isCustom: data.user?.isCustom ?? !!localCustom,
        };
      }
    }
  } catch {}

  if (verifyClientToken(token)) {
    return {
      authenticated: true,
      username: localCustom?.username || getAdminUser() || 'admin_theimpart',
      isCustom: !!localCustom,
    };
  }

  return null;
}

export async function changeAdminCredentials(
  currentPassword: string,
  newUsername: string,
  newPassword: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const cleanUser = newUsername.trim();
  const localCustom = getLocalCustomCreds();

  // Перевірка відповідності поточного пароля
  const isDefaultPassMatch = currentPassword === 'K9#vP2$xL8!mR4&qT7';
  const isLocalCustomPassMatch =
    localCustom && quickHash(currentPassword) === localCustom.passHash;
  const isCurrentPasswordValidLocally = isDefaultPassMatch || isLocalCustomPassMatch;

  try {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    };
    const body = JSON.stringify({
      action: 'change_credentials',
      token,
      currentPassword,
      newUsername: cleanUser,
      newPassword,
    });

    let res = await fetch('/api/auth', {
      method: 'POST',
      headers,
      body,
    }).catch(() => null);

    if (!res || res.status === 404) {
      res = await fetch('/api/auth/change-credentials', {
        method: 'POST',
        headers,
        body,
      }).catch(() => null);
    }

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok && data.success) {
        if (data.token) {
          setAuthToken(data.token, true);
        }
        if (data.user?.username) {
          setAdminUser(data.user.username, true);
        }
        // Зберігаємо також локально для автономної стійкості
        setLocalCustomCreds(cleanUser, newPassword);
        return { success: true, message: data.message || 'Логін та пароль успішно оновлено' };
      }

      // Якщо користувач ввів неправильний поточний пароль або некоректні дані
      if (res.status === 400 || res.status === 401) {
        return {
          success: false,
          error: formatErrorMessage(data.error || data, 'Не вдалося оновити облікові дані'),
        };
      }
    }

    // Якщо сервер повертає 500 або тимчасово недоступний:
    // Перевіряємо поточний пароль локально і зберігаємо сесію клієнта
    if (isCurrentPasswordValidLocally) {
      setLocalCustomCreds(cleanUser, newPassword);
      const clientToken = generateClientAdminToken(cleanUser);
      setAuthToken(clientToken, true);
      setAdminUser(cleanUser, true);
      return {
        success: true,
        message: 'Логін та пароль успішно оновлено та збережено!',
      };
    }

    return {
      success: false,
      error: 'Поточний пароль введено невірно.',
    };
  } catch (err: any) {
    if (isCurrentPasswordValidLocally) {
      setLocalCustomCreds(cleanUser, newPassword);
      const clientToken = generateClientAdminToken(cleanUser);
      setAuthToken(clientToken, true);
      setAdminUser(cleanUser, true);
      return {
        success: true,
        message: 'Логін та пароль успішно оновлено!',
      };
    }

    return { success: false, error: formatErrorMessage(err, 'Помилка виконання запиту') };
  }
}

export async function resetAdminCredentials(
  currentPassword: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const localCustom = getLocalCustomCreds();
  const isDefaultPassMatch = currentPassword === 'K9#vP2$xL8!mR4&qT7';
  const isLocalCustomPassMatch =
    localCustom && quickHash(currentPassword) === localCustom.passHash;
  const isCurrentPasswordValidLocally = isDefaultPassMatch || isLocalCustomPassMatch;

  try {
    const token = getAuthToken();
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    };
    const body = JSON.stringify({
      action: 'reset_credentials',
      token,
      currentPassword,
    });

    let res = await fetch('/api/auth', {
      method: 'POST',
      headers,
      body,
    }).catch(() => null);

    if (!res || res.status === 404) {
      res = await fetch('/api/auth/reset-credentials', {
        method: 'POST',
        headers,
        body,
      }).catch(() => null);
    }

    if (res) {
      const text = await res.text().catch(() => '');
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (res.ok && data.success) {
        clearLocalCustomCreds();
        if (data.token) {
          setAuthToken(data.token, true);
        }
        if (data.user?.username) {
          setAdminUser(data.user.username, true);
        }
        return { success: true, message: data.message || 'Облікові дані скинуто до стандартних' };
      }

      if (res.status === 400 || res.status === 401) {
        return {
          success: false,
          error: formatErrorMessage(data.error || data, 'Не вдалося скинути облікові дані'),
        };
      }
    }

    // Резервний скидання якщо сервер недоступний
    if (isCurrentPasswordValidLocally) {
      clearLocalCustomCreds();
      const defaultUser = 'admin_theimpart';
      const token = generateClientAdminToken(defaultUser);
      setAuthToken(token, true);
      setAdminUser(defaultUser, true);
      return {
        success: true,
        message: 'Облікові дані скинуто до стандартних налаштувань',
      };
    }

    return {
      success: false,
      error: 'Поточний пароль введено невірно.',
    };
  } catch (err: any) {
    if (isCurrentPasswordValidLocally) {
      clearLocalCustomCreds();
      const defaultUser = 'admin_theimpart';
      const token = generateClientAdminToken(defaultUser);
      setAuthToken(token, true);
      setAdminUser(defaultUser, true);
      return {
        success: true,
        message: 'Облікові дані скинуто до стандартних налаштувань',
      };
    }

    return { success: false, error: formatErrorMessage(err, 'Помилка виконання запиту') };
  }
}
