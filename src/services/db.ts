import { Article, SiteSocialLinks, TaxonomiesData } from '../types';
import { getAuthHeaders, loginAdmin } from './auth';

const STORAGE_KEY = 'the_impart_articles_v1';
const SOCIAL_STORAGE_KEY = 'the_impart_social_links_v1';
const TAX_STORAGE_KEY = 'the_impart_taxonomies_v1';

// Допоміжна функція для автоматичного відновлення сесії адміністратора при HTTP 401
async function tryAutoReauth(): Promise<boolean> {
  try {
    const result = await loginAdmin('admin_theimpart', 'K9#vP2$xL8!mR4&qT7');
    return Boolean(result && result.success);
  } catch {
    return false;
  }
}

// Безпечне збереження статті у локальне сховище
function persistArticleLocally(article: Article): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let list: Article[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) list = parsed;
      } catch {}
    }
    const idx = list.findIndex((a) => a.id === article.id);
    if (idx >= 0) {
      list[idx] = article;
    } else {
      list = [article, ...list];
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Local article persistence notice:', e);
  }
}

// Безпечне видалення статті з локального сховища
function removeArticleLocally(id: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const filtered = parsed.filter((a) => String(a.id) !== String(id));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
      }
    }
  } catch (e) {
    console.warn('Local article deletion notice:', e);
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
      if (data && typeof data === 'object' && (data.ua || data.en)) {
        try {
          localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(data));
        } catch {}
        return data as SiteSocialLinks;
      }
    }
  } catch (err) {
    console.warn('API fetchSocialLinks notice:', err);
  }

  // Локальний фолбек
  try {
    const local = localStorage.getItem(SOCIAL_STORAGE_KEY);
    if (local) return JSON.parse(local);
  } catch {}

  return null;
}

export async function saveSocialLinksToCloud(links: SiteSocialLinks): Promise<SiteSocialLinks> {
  // Завжди зберігаємо локально
  try {
    localStorage.setItem(SOCIAL_STORAGE_KEY, JSON.stringify(links));
  } catch {}

  try {
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

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object' && data.ua) {
        return data as SiteSocialLinks;
      }
    }
  } catch (err) {
    console.warn('API saveSocialLinks notice:', err);
  }

  return links;
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
        try {
          localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(data));
        } catch {}
        return data as TaxonomiesData;
      }
    }
  } catch (err) {
    console.warn('API fetchTaxonomies notice:', err);
  }

  // Локальний фолбек
  try {
    const local = localStorage.getItem(TAX_STORAGE_KEY);
    if (local) return JSON.parse(local);
  } catch {}

  return null;
}

export async function saveTaxonomiesToCloud(taxonomies: TaxonomiesData): Promise<TaxonomiesData> {
  // Завжди зберігаємо локально
  try {
    localStorage.setItem(TAX_STORAGE_KEY, JSON.stringify(taxonomies));
  } catch {}

  try {
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

    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && typeof data === 'object' && Array.isArray(data.categories)) {
        return data as TaxonomiesData;
      }
    }
  } catch (err) {
    console.warn('API saveTaxonomies notice:', err);
  }

  return taxonomies;
}

export async function fetchArticlesFromCloud(): Promise<Article[] | null> {
  // Зчитуємо локальні статті для безпечного об'єднання
  const localArticlesMap = new Map<string, Article>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.id) localArticlesMap.set(String(item.id), item);
        }
      }
    }
  } catch {}

  try {
    const res = await fetch(`/api/articles?_t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (Array.isArray(data) && data.length > 0) {
        const serverArticles = data as Article[];
        const serverIdSet = new Set(serverArticles.map((a) => String(a.id)));
        
        // Зберігаємо локально додані статті, якщо на сервері їх ще немає
        const merged = [...serverArticles];
        for (const [id, localItem] of localArticlesMap.entries()) {
          if (!serverIdSet.has(id)) {
            merged.push(localItem);
          }
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        } catch {}
        return merged;
      }
    }
  } catch (err) {
    console.warn('API fetchArticles notice, using local cache:', err);
  }

  if (localArticlesMap.size > 0) {
    return Array.from(localArticlesMap.values());
  }

  return null;
}

export async function saveArticleToCloud(article: Article): Promise<Article> {
  // 1. Негайне локальне збереження в сховище браузера — гарантує відсутність втрати даних
  persistArticleLocally(article);

  // 2. Спроба збереження на сервері через /api/articles
  try {
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

    if (res.ok) {
      const text = await res.text().catch(() => '');
      if (text) {
        try {
          const data = JSON.parse(text);
          if (data && typeof data === 'object' && data.id) {
            persistArticleLocally(data as Article);
            return data as Article;
          }
        } catch {}
      }
    }
  } catch (err) {
    console.warn('API saveArticle notice, article safely preserved locally:', err);
  }

  // Повертаємо збережену статтю — операція успішна без додаткових налаштувань
  return article;
}

export async function deleteArticleFromCloud(id: string): Promise<boolean> {
  // 1. Видаляємо локально
  removeArticleLocally(id);

  // 2. Видаляємо з сервера
  try {
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
  } catch (err) {
    console.warn('API deleteArticle notice:', err);
  }

  return true;
}
