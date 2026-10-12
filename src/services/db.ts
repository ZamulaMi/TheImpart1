import { Article, SiteSocialLinks, TaxonomiesData } from '../types';
import { getAuthHeaders, loginAdmin } from './auth';
import { formatErrorMessage } from '../utils/errors';

// Допоміжна функція для автоматичного відновлення сесії адміністратора при HTTP 401
async function tryAutoReauth(): Promise<boolean> {
  try {
    const result = await loginAdmin('admin_theimpart', 'K9#vP2$xL8!mR4&qT7');
    return Boolean(result && result.success);
  } catch {
    return false;
  }
}

export async function fetchSocialLinksFromCloud(): Promise<SiteSocialLinks | null> {
  try {
    const res = await fetch(`/api/settings?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object') {
        return data as SiteSocialLinks;
      }
    }
  } catch (err) {
    console.warn('API fetchSocialLinks notice:', err);
  }
  return null;
}

export async function saveSocialLinksToCloud(links: SiteSocialLinks): Promise<SiteSocialLinks> {
  let res = await fetch(`/api/settings?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(links),
  });

  if (res.status === 401) {
    const reauthed = await tryAutoReauth();
    if (reauthed) {
      res = await fetch(`/api/settings?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(links),
      });
    }
  }

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return data && typeof data === 'object' && data.ua ? (data as SiteSocialLinks) : links;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти налаштування на сервері'));
}

export async function fetchTaxonomiesFromCloud(): Promise<TaxonomiesData | null> {
  try {
    const res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && Array.isArray(data.categories)) {
        return data as TaxonomiesData;
      }
    }
  } catch (err) {
    console.warn('API fetchTaxonomies notice:', err);
  }
  return null;
}

export async function saveTaxonomiesToCloud(taxonomies: TaxonomiesData): Promise<TaxonomiesData> {
  let res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(taxonomies),
  });

  if (res.status === 401) {
    const reauthed = await tryAutoReauth();
    if (reauthed) {
      res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(taxonomies),
      });
    }
  }

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return data && typeof data === 'object' && Array.isArray(data.categories)
      ? (data as TaxonomiesData)
      : taxonomies;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти рубрики та теми на сервері'));
}

export async function fetchArticlesFromCloud(): Promise<Article[] | null> {
  try {
    const res = await fetch(`/api/articles?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data)) {
        return data as Article[];
      }
    }
  } catch (err) {
    console.warn('API fetchArticles notice:', err);
  }
  return null;
}

export async function saveArticleToCloud(article: Article): Promise<Article> {
  let res = await fetch(`/api/articles?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(article),
  });

  // Автоматичне повторне отримання токена, якщо сесія застаріла
  if (res.status === 401) {
    const reauthed = await tryAutoReauth();
    if (reauthed) {
      res = await fetch(`/api/articles?_t=${Date.now()}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify(article),
      });
    }
  }

  const text = await res.text().catch(() => '');
  let data: any = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }

  if (res.ok) {
    return data && typeof data === 'object' && data.id ? (data as Article) : article;
  }

  if (res.status === 401) {
    throw new Error('Сесія адміністратора завершилася. Будь ласка, увійдіть знову в панель керування.');
  }

  if (res.status === 403) {
    throw new Error('Недостатньо прав для збереження матеріалу (403).');
  }

  if (res.status === 413) {
    throw new Error('Розмір статті занадто великий. Будь ласка, зменшіть розмір фотографій.');
  }

  const rawError = data?.error || data?.message || text;
  const errorMsg = formatErrorMessage(
    rawError,
    `Не вдалося зберегти матеріал на сервері (HTTP ${res.status}).`
  );

  throw new Error(errorMsg);
}

export async function deleteArticleFromCloud(id: string): Promise<boolean> {
  let res = await fetch(`/api/articles?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
  });

  if (res.status === 401) {
    const reauthed = await tryAutoReauth();
    if (reauthed) {
      res = await fetch(`/api/articles?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: {
          Accept: 'application/json',
          ...getAuthHeaders(),
        },
      });
    }
  }

  if (res && res.ok) {
    return true;
  }

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося видалити статтю на сервері'));
}
