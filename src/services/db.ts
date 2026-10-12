import { Article, SiteSocialLinks, TaxonomiesData } from '../types';
import { getAuthHeaders } from './auth';
import { formatErrorMessage } from '../utils/errors';

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
  const res = await fetch(`/api/settings?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(links),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return (data && typeof data === 'object' && data.ua) ? (data as SiteSocialLinks) : links;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти налаштування на сервері Cloudflare'));
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
  const res = await fetch(`/api/taxonomies?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(taxonomies),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return (data && typeof data === 'object' && Array.isArray(data.categories)) ? (data as TaxonomiesData) : taxonomies;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти рубрики та теми на сервері Cloudflare'));
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
  const res = await fetch(`/api/articles?_t=${Date.now()}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(article),
  });

  const text = await res.text().catch(() => '');
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text };
  }

  if (res.ok) {
    return (data && typeof data === 'object' && data.id) ? (data as Article) : article;
  }

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося зберегти статтю на сервері Cloudflare'));
}

export async function deleteArticleFromCloud(id: string): Promise<boolean> {
  const res = await fetch(`/api/articles?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: {
      Accept: 'application/json',
      ...getAuthHeaders(),
    },
  });

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

  throw new Error(formatErrorMessage(data?.error || data, 'Не вдалося видалити статтю на сервері Cloudflare'));
}
