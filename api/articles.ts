import fs from 'fs';
import path from 'path';
import { safeExecuteSql, isCloudflareD1Configured } from './_db.ts';
import { verifyAdminToken, extractToken } from './_auth_utils.ts';
import { SEED_ARTICLES } from '../src/data/seedArticles.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';

export interface Article {
  id: string;
  // Українська версія (основна)
  title: string;
  excerpt: string;
  content: string;
  category: string;
  categories?: string[];
  topics?: string[];
  author: string;
  coverImage?: string;
  date: string;
  readTime?: string;
  createdAt?: string;
  published: boolean;

  // Англійська версія
  titleEn?: string;
  excerptEn?: string;
  contentEn?: string;
  categoryEn?: string;
  categoriesEn?: string[];
  topicsEn?: string[];
  publishedEn?: boolean;
}

// Початкові статті за замовчуванням
export const DEFAULT_ARTICLES: Article[] = SEED_ARTICLES;

// Локальне кешування на диску сервера для резервного доступу та офлайн-режиму
const DATA_DIR = path.resolve(process.cwd(), 'data');
const ARTICLES_FILE = path.join(DATA_DIR, 'articles.json');
const ARTICLES_TMP_FILE = '/tmp/impart_articles.json';

function readArticlesFromFile(): Article[] | null {
  const paths = [ARTICLES_TMP_FILE, ARTICLES_FILE];
  for (const p of paths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf-8');
        if (content && content.trim()) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        }
      }
    } catch {}
  }
  return null;
}

function writeArticlesToFile(articles: Article[]): void {
  const payload = JSON.stringify(articles, null, 2);

  try {
    fs.writeFileSync(ARTICLES_TMP_FILE, payload, 'utf-8');
  } catch {}

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(ARTICLES_FILE, payload, 'utf-8');
  } catch {}
}

// Ініціалізація пам'яті
const initialArticlesFromFile = readArticlesFromFile();
let inMemoryArticles: Article[] = initialArticlesFromFile || [...DEFAULT_ARTICLES];
if (!initialArticlesFromFile) {
  writeArticlesToFile(inMemoryArticles);
}

let isTableInitialized = false;

export async function initDb() {
  if (isTableInitialized || !isCloudflareD1Configured()) return;

  try {
    await safeExecuteSql(async (sql) => {
      await sql`
        CREATE TABLE IF NOT EXISTS articles (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          excerpt TEXT,
          content TEXT NOT NULL,
          category TEXT DEFAULT 'Загальне',
          categories_json TEXT,
          topics_json TEXT,
          author TEXT DEFAULT 'Редакція The Impart',
          cover_image TEXT,
          date TEXT,
          read_time TEXT,
          published INTEGER DEFAULT 1,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          title_en TEXT,
          excerpt_en TEXT,
          content_en TEXT,
          category_en TEXT,
          categories_en_json TEXT,
          topics_en_json TEXT,
          published_en INTEGER DEFAULT 0
        );
      `;
    }, 4000);

    isTableInitialized = true;
  } catch (error) {
    console.warn('Cloudflare D1 initDb notice:', error);
  }
}

function safeParseJsonList(raw: any, fallback: string[] = []): string[] {
  if (!raw) return fallback;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {}
  return fallback;
}

export async function saveArticleToD1(article: Article): Promise<boolean> {
  if (!isCloudflareD1Configured()) return false;
  const isPub = article.published !== false && String(article.published) !== 'false';
  const isPubEn =
    article.publishedEn === true ||
    String(article.publishedEn) === 'true' ||
    (article.publishedEn as any) === 1;

  const id = String(article.id);
  const title = String(article.title || article.titleEn || '').trim();
  const excerpt = String(article.excerpt || '').trim();
  const content = String(article.content || '').trim();
  const author = String(article.author || 'Редакція The Impart').trim();
  const coverImage = article.coverImage ? String(article.coverImage).trim() : null;
  const date = String(article.date || '');
  const readTime = article.readTime ? String(article.readTime) : null;
  const createdAt = article.createdAt || new Date().toISOString();

  const titleEn = article.titleEn ? String(article.titleEn).trim() : null;
  const excerptEn = article.excerptEn ? String(article.excerptEn).trim() : null;
  const contentEn = article.contentEn ? String(article.contentEn).trim() : null;
  const categoryEn = article.categoryEn ? String(article.categoryEn).trim() : null;

  const categories =
    Array.isArray(article.categories) && article.categories.length > 0
      ? article.categories.map((c) => String(c).trim()).filter(Boolean)
      : (article.category ? article.category.split(',').map((c) => c.trim()).filter(Boolean) : ['Загальне']);
  const category = categories.join(', ') || 'Загальне';

  const categoriesEn =
    Array.isArray(article.categoriesEn) && article.categoriesEn.length > 0
      ? article.categoriesEn.map((c) => String(c).trim()).filter(Boolean)
      : (categoryEn ? categoryEn.split(',').map((c) => c.trim()).filter(Boolean) : []);

  const topics = Array.isArray(article.topics)
    ? article.topics.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const topicsEn = Array.isArray(article.topicsEn)
    ? article.topicsEn.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const catsJson = JSON.stringify(categories);
  const topsJson = JSON.stringify(topics);
  const catsEnJson = JSON.stringify(categoriesEn);
  const topsEnJson = JSON.stringify(topicsEn);

  try {
    await initDb();
    const res = await safeExecuteSql(async (sql) => {
      return await sql`
        INSERT INTO articles (
          id, title, excerpt, content, category, categories_json, topics_json,
          author, cover_image, date, read_time, published, created_at,
          title_en, excerpt_en, content_en, category_en, categories_en_json, topics_en_json, published_en
        )
        VALUES (
          ${id}, 
          ${title}, 
          ${excerpt}, 
          ${content}, 
          ${category},
          ${catsJson},
          ${topsJson},
          ${author}, 
          ${coverImage}, 
          ${date}, 
          ${readTime}, 
          ${isPub ? 1 : 0},
          ${createdAt},
          ${titleEn}, 
          ${excerptEn}, 
          ${contentEn}, 
          ${categoryEn},
          ${catsEnJson},
          ${topsEnJson},
          ${isPubEn ? 1 : 0}
        )
        ON CONFLICT (id) DO UPDATE SET
          title = excluded.title,
          excerpt = excluded.excerpt,
          content = excluded.content,
          category = excluded.category,
          categories_json = excluded.categories_json,
          topics_json = excluded.topics_json,
          author = excluded.author,
          cover_image = excluded.cover_image,
          date = excluded.date,
          read_time = excluded.read_time,
          published = excluded.published,
          title_en = excluded.title_en,
          excerpt_en = excluded.excerpt_en,
          content_en = excluded.content_en,
          category_en = excluded.category_en,
          categories_en_json = excluded.categories_en_json,
          topics_en_json = excluded.topics_en_json,
          published_en = excluded.published_en;
      `;
    }, 15000);
    return res !== null;
  } catch (err) {
    console.warn('Cloudflare D1 save notice:', err);
    return false;
  }
}

export async function getArticles(): Promise<Article[]> {
  // Збираємо локально відомі статті, щоб ніколи не втратити новостворені статті
  const localMap = new Map<string, Article>();
  for (const a of inMemoryArticles) {
    if (a?.id) localMap.set(String(a.id), a);
  }
  const fromFile = readArticlesFromFile();
  if (fromFile && Array.isArray(fromFile)) {
    for (const a of fromFile) {
      if (a?.id) localMap.set(String(a.id), a);
    }
  }

  if (isCloudflareD1Configured()) {
    try {
      await initDb();
    const rows = await safeExecuteSql(async (sql) => {
      return await sql`
        SELECT 
          id, 
          title, 
          excerpt, 
          content, 
          category,
          categories_json as "categoriesJson",
          topics_json as "topicsJson",
          author, 
          cover_image as "coverImage", 
          date, 
          read_time as "readTime", 
          created_at as "createdAt",
          published,
          title_en as "titleEn",
          excerpt_en as "excerptEn",
          content_en as "contentEn",
          category_en as "categoryEn",
          categories_en_json as "categoriesEnJson",
          topics_en_json as "topicsEnJson",
          published_en as "publishedEn"
        FROM articles 
        ORDER BY created_at DESC;
      `;
    }, 15000);

    if (rows && rows.length > 0) {
      const mapped: Article[] = rows.map((r: any) => {
        const cat = String(r.category || 'Загальне');
        const categories = safeParseJsonList(r.categoriesJson, cat ? cat.split(',').map((s) => s.trim()) : ['Загальне']);
        const topics = safeParseJsonList(r.topicsJson, []);
        const catEn = r.categoryEn ? String(r.categoryEn) : undefined;
        const categoriesEn = safeParseJsonList(r.categoriesEnJson, catEn ? catEn.split(',').map((s) => s.trim()) : []);
        const topicsEn = safeParseJsonList(r.topicsEnJson, []);

        return {
          id: String(r.id),
          title: String(r.title || ''),
          excerpt: String(r.excerpt || ''),
          content: String(r.content || ''),
          category: categories.join(', ') || cat,
          categories,
          topics,
          author: String(r.author || 'Редакція The Impart'),
          coverImage: r.coverImage || undefined,
          date: String(r.date || ''),
          readTime: r.readTime ? String(r.readTime) : undefined,
          createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
          published: r.published === 1 || r.published === true || String(r.published) === 'true',
          titleEn: r.titleEn ? String(r.titleEn) : undefined,
          excerptEn: r.excerptEn ? String(r.excerptEn) : undefined,
          contentEn: r.contentEn ? String(r.contentEn) : undefined,
          categoryEn: categoriesEn.length > 0 ? categoriesEn.join(', ') : catEn,
          categoriesEn,
          topicsEn,
          publishedEn: r.publishedEn === 1 || r.publishedEn === true || String(r.publishedEn) === 'true',
        };
      });

      const d1IdSet = new Set(mapped.map((m) => m.id));
      const mergedList = [...mapped];

      // Якщо є статті, збережені локально, яких ще немає в базі D1 — зберігаємо їх та синхронізуємо
      for (const [id, localArticle] of localMap.entries()) {
        if (!d1IdSet.has(id)) {
          mergedList.push(localArticle);
          saveArticleToD1(localArticle).catch((e) =>
            console.warn('Background sync to Cloudflare D1 notice:', e)
          );
        }
      }

      inMemoryArticles = mergedList;
      writeArticlesToFile(mergedList);
      return mergedList;
    }
  } catch (error) {
    console.warn('Cloudflare D1 query notice in getArticles, loading from local cache:', error);
  }
}

  if (localMap.size > 0) {
    const list = Array.from(localMap.values());
    inMemoryArticles = list;
    return list;
  }

  return inMemoryArticles;
}

export async function saveArticle(article: Article): Promise<Article> {
  const isPub = article.published !== false && String(article.published) !== 'false';
  const isPubEn = article.publishedEn === true || String(article.publishedEn) === 'true' || (article.publishedEn as any) === 1;

  const id = String(article.id || Date.now().toString());
  const title = String(article.title || article.titleEn || '').trim();
  const excerpt = String(article.excerpt || '').trim();
  const content = String(article.content || '').trim();
  const author = String(article.author || 'Редакція The Impart').trim();
  const coverImage = article.coverImage ? String(article.coverImage).trim() : undefined;
  const date = String(article.date || new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }));
  const readTime = article.readTime ? String(article.readTime) : undefined;
  const createdAt = article.createdAt || new Date().toISOString();

  const titleEn = article.titleEn ? String(article.titleEn).trim() : undefined;
  const excerptEn = article.excerptEn ? String(article.excerptEn).trim() : undefined;
  const contentEn = article.contentEn ? String(article.contentEn).trim() : undefined;

  const categories = Array.isArray(article.categories) && article.categories.length > 0
    ? article.categories.map((c) => String(c).trim()).filter(Boolean)
    : (article.category ? article.category.split(',').map((c) => c.trim()).filter(Boolean) : ['Загальне']);
  const category = categories.join(', ') || 'Загальне';

  const categoriesEn = Array.isArray(article.categoriesEn) && article.categoriesEn.length > 0
    ? article.categoriesEn.map((c) => String(c).trim()).filter(Boolean)
    : (article.categoryEn ? article.categoryEn.split(',').map((c) => c.trim()).filter(Boolean) : []);
  const categoryEn = categoriesEn.join(', ') || undefined;

  const topics = Array.isArray(article.topics)
    ? article.topics.map((t) => String(t).trim()).filter(Boolean)
    : [];
  const topicsEn = Array.isArray(article.topicsEn)
    ? article.topicsEn.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const fullArticle: Article = {
    id,
    title,
    excerpt,
    content,
    category,
    categories,
    topics,
    author,
    coverImage,
    date,
    readTime,
    createdAt,
    published: isPub,
    titleEn,
    excerptEn,
    contentEn,
    categoryEn,
    categoriesEn,
    topicsEn,
    publishedEn: isPubEn,
  };

  // 1. Оновлення в оперативній пам'яті сервера
  const existingIdx = inMemoryArticles.findIndex((a) => a.id === id);
  if (existingIdx >= 0) {
    inMemoryArticles[existingIdx] = fullArticle;
  } else {
    inMemoryArticles = [fullArticle, ...inMemoryArticles];
  }

  // 2. Резервний запис на диск
  writeArticlesToFile(inMemoryArticles);

  // 3. Збереження на серверах Cloudflare D1 (тільки якщо налаштовано, у фоновому режимі)
  if (isCloudflareD1Configured()) {
    saveArticleToD1(fullArticle).catch((error: any) => {
      console.warn('Cloudflare D1 save notice in saveArticle:', error);
    });
  }

  return fullArticle;
}

export async function deleteArticle(id: string): Promise<boolean> {
  const targetId = String(id);

  // 1. Видаляємо з пам'яті
  inMemoryArticles = inMemoryArticles.filter((a) => a.id !== targetId);

  // 2. Оновлюємо файл на диску
  writeArticlesToFile(inMemoryArticles);

  // 3. Видаляємо з сервера Cloudflare D1 (тільки якщо налаштовано, у фоновому режимі)
  if (isCloudflareD1Configured()) {
    safeExecuteSql(async (sql) => {
      await sql`DELETE FROM articles WHERE id = ${targetId};`;
    }, 4000).catch((error) => {
      console.warn('Cloudflare D1 delete notice:', error);
    });
  }

  return true;
}

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const articles = await getArticles();
      return res.status(200).json(articles);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const token = extractToken(req);
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора для збереження статей' });
      }

      let body = await parseRequestBody(req);

      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (e: any) {
          return res.status(400).json({ error: 'Помилка валідації JSON: ' + e.message });
        }
      }

      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Тіло запиту повинно бути об\'єктом' });
      }

      const title = String(body.title || body.titleEn || '').trim();
      if (!title) {
        return res.status(400).json({ error: 'Заголовок статті обов\'язковий (українською або англійською)' });
      }

      const saved = await saveArticle({
        id: body.id ? String(body.id) : Date.now().toString(),
        title: String(body.title || body.titleEn || '').trim(),
        excerpt: body.excerpt ? String(body.excerpt).trim() : '',
        content: body.content ? String(body.content).trim() : '',
        category: body.category ? String(body.category).trim() : 'Загальне',
        categories: Array.isArray(body.categories) ? body.categories : undefined,
        topics: Array.isArray(body.topics) ? body.topics : undefined,
        author: body.author ? String(body.author).trim() : 'Редакція The Impart',
        coverImage: body.coverImage ? String(body.coverImage).trim() : undefined,
        date: body.date ? String(body.date) : new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }),
        readTime: body.readTime ? String(body.readTime) : undefined,
        createdAt: body.createdAt ? String(body.createdAt) : undefined,
        published: body.published !== false && String(body.published) !== 'false',
        // Англійські поля
        titleEn: body.titleEn ? String(body.titleEn).trim() : undefined,
        excerptEn: body.excerptEn ? String(body.excerptEn).trim() : undefined,
        contentEn: body.contentEn ? String(body.contentEn).trim() : undefined,
        categoryEn: body.categoryEn ? String(body.categoryEn).trim() : undefined,
        categoriesEn: Array.isArray(body.categoriesEn) ? body.categoriesEn : undefined,
        topicsEn: Array.isArray(body.topicsEn) ? body.topicsEn : undefined,
        publishedEn: body.publishedEn === true || String(body.publishedEn) === 'true',
      });

      return res.status(200).json(saved);
    }

    if (req.method === 'DELETE') {
      const token = extractToken(req);
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора для видалення статей' });
      }

      const id = req.query?.id || req.body?.id;
      if (!id) {
        return res.status(400).json({ error: 'Параметр ID є обов\'язковим' });
      }
      await deleteArticle(id.toString());
      return res.status(200).json({ success: true, id: id.toString() });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error: any) {
    console.error('API /api/articles error:', error);
    return res.status(500).json({ error: 'Помилка сервера при збереженні статті: ' + (error?.message || 'невідома помилка') });
  }
}
