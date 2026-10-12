/**
 * Утиліта для безпечного форматування та вилучення рядкових повідомлень про помилки.
 * Запобігає появі сирих порожніх об'єктів на кшталт {"error":""}.
 */

function isInvalidErrorString(str: string): boolean {
  const s = str.trim();
  return (
    !s ||
    s === '{"error":""}' ||
    s === '{"error":{}}' ||
    s === '{"error":null}' ||
    s === '{}' ||
    s === '[object Object]'
  );
}

export function formatErrorMessage(err: unknown, fallback: string = 'Сталася неочікувана помилка при збереженні'): string {
  if (err === null || err === undefined) {
    return fallback;
  }

  if (typeof err === 'string') {
    const trimmed = err.trim();
    if (isInvalidErrorString(trimmed)) return fallback;
    return trimmed;
  }

  if (typeof err === 'number' || typeof err === 'boolean') {
    return String(err);
  }

  if (typeof err === 'object') {
    const rec = err as Record<string, any>;

    // 1. Якщо це стандартний об'єкт Error
    if (typeof rec.message === 'string' && rec.message.trim()) {
      const msg = rec.message.trim();
      if (!isInvalidErrorString(msg)) {
        return msg;
      }
    }

    // 2. Якщо це API-відповідь типу { error: "текст" }
    if (typeof rec.error === 'string' && rec.error.trim()) {
      const errStr = rec.error.trim();
      if (!isInvalidErrorString(errStr)) {
        return errStr;
      }
    }

    // 3. Якщо це відповідь бекенд-сервера або API: { error: { code, message } }
    if (rec.error && typeof rec.error === 'object') {
      const nested = rec.error;
      if (typeof nested.message === 'string' && nested.message.trim()) {
        const msg = nested.message.trim();
        if (!isInvalidErrorString(msg)) return msg;
      }
      if (typeof nested.code === 'string' && nested.code.trim()) {
        return `Помилка сервера (${nested.code})`;
      }
    }

    // 4. Якщо це об'єкт із ключами { code, message }
    if (typeof rec.code === 'string' || typeof rec.code === 'number') {
      if (typeof rec.message === 'string' && rec.message.trim()) {
        const msg = rec.message.trim();
        if (!isInvalidErrorString(msg)) return msg;
      }
      return `Помилка сервера (${rec.code})`;
    }

    // 5. Якщо це детальний опис у полі statusText або status
    if (typeof rec.statusText === 'string' && rec.statusText.trim()) {
      const st = rec.statusText.trim();
      if (!isInvalidErrorString(st)) return st;
    }

    // 6. Спроба серіалізації тільки якщо є змістовні дані
    try {
      const json = JSON.stringify(err);
      if (json && !isInvalidErrorString(json)) {
        return json;
      }
    } catch {}
  }

  return fallback;
}
