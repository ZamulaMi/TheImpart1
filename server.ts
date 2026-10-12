import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import articlesHandler, { getArticles } from './api/articles.ts';
import settingsHandler, { getSocialLinks, getTaxonomies } from './api/settings.ts';
import taxonomiesHandler from './api/taxonomies.ts';
import authHandler, { extractToken, verifyAdminToken } from './api/auth.ts';
import {
  uploadToCloudflareR2,
  getFromCloudflareR2,
  isCloudflareR2Configured,
  isCloudflareD1Configured,
} from './api/_db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = 3000;

// CORS та preflight-запити
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// Підтримка великих текстів та зображень (до 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Статус підключення Cloudflare D1 та Cloudflare R2
app.get('/api/status', (_req, res) => {
  return res.status(200).json({
    status: 'ok',
    cloudflare: {
      d1: isCloudflareD1Configured(),
      r2: isCloudflareR2Configured(),
    },
  });
});

// Підключення API ендпоінту статей
app.all(['/api/articles', '/api/articles/*'], async (req, res) => {
  try {
    await articlesHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/articles fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getArticles();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json([]);
      }
    }
  }
});

// Підключення API ендпоінту рубрик та тем (taxonomies)
app.all(['/api/taxonomies', '/api/taxonomies/*'], async (req, res) => {
  try {
    await taxonomiesHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/taxonomies fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getTaxonomies();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json({ categories: [], topics: [] });
      }
    }
  }
});

// Підключення API ендпоінту автентифікації адміністратора
app.all(['/api/auth', '/api/auth/*'], async (req, res) => {
  try {
    await authHandler(req, res);
  } catch (err: any) {
    console.error('Express /api/auth error:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Помилка сервера автентифікації' });
    }
  }
});

// Локальна директорія завантажень для кешу / резерву
const uploadsDir = path.resolve(__dirname, 'data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Роздача медіафайлів із Cloudflare R2 через безпечний проксі
app.get('/api/media/:key', async (req, res) => {
  const key = req.params.key;
  if (!key) {
    return res.status(400).send('File key required');
  }

  // 1. Спроба завантажити з Cloudflare R2
  if (isCloudflareR2Configured()) {
    try {
      const r2Object = await getFromCloudflareR2(key);
      if (r2Object) {
        res.setHeader('Content-Type', r2Object.contentType);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        return res.status(200).send(r2Object.buffer);
      }
    } catch (err) {
      console.warn('R2 media fetch error:', err);
    }
  }

  // 2. Локальний файл як резервний варіант
  const localPath = path.join(uploadsDir, key);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }

  return res.status(404).send('File not found');
});

// Ендпоінт для завантаження зображень (збереження на серверах Cloudflare R2) — вимагає прав адміністратора
app.post('/api/upload', async (req, res) => {
  try {
    // 1. Перевірка авторизації адміністратора
    const token = extractToken(req);
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ error: 'Потрібна авторизація адміністратора для завантаження медіа' });
    }

    const { data, filename } = req.body || {};
    if (!data || typeof data !== 'string') {
      return res.status(400).json({ error: 'Зображення не передано' });
    }

    const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      if (data.startsWith('http://') || data.startsWith('https://')) {
        return res.status(200).json({ url: data });
      }
      return res.status(400).json({ error: 'Недійсний формат зображення (очікується Base64 або URL)' });
    }

    const mimeType = matches[1].toLowerCase();
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedMimes.includes(mimeType)) {
      return res.status(400).json({ error: 'Дозволені лише формати зображень: JPEG, PNG, WebP, GIF, SVG' });
    }

    const base64Data = matches[2];
    const imageBuffer = Buffer.from(base64Data, 'base64');

    // Обмеження розміру: максимум 25MB
    if (imageBuffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: 'Розмір зображення не повинен перевищувати 25MB' });
    }

    let ext = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
    else if (mimeType.includes('webp')) ext = 'webp';
    else if (mimeType.includes('gif')) ext = 'gif';
    else if (mimeType.includes('svg')) ext = 'svg';

    const cleanName = (filename || 'image').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
    const saveName = `${Date.now()}_${cleanName}.${ext}`;

    // 2. Завжди зберігаємо локальну копію як швидкий кеш
    const localFilePath = path.join(uploadsDir, saveName);
    fs.writeFileSync(localFilePath, imageBuffer);

    // 3. Збереження на серверах Cloudflare R2
    if (isCloudflareR2Configured()) {
      try {
        const r2Result = await uploadToCloudflareR2(saveName, imageBuffer, mimeType);
        if (r2Result && r2Result.url) {
          return res.status(200).json({
            url: r2Result.url,
            filename: saveName,
            storage: 'cloudflare_r2',
          });
        }
      } catch (r2Err) {
        console.warn('Failed to upload to Cloudflare R2, using local fallback:', r2Err);
      }
    }

    // 4. Повернення локальної URL якщо R2 не налаштовано або тимчасово недоступний
    return res.status(200).json({
      url: `/uploads/${saveName}`,
      filename: saveName,
      storage: 'local',
    });
  } catch (err: any) {
    console.error('Upload error in server:', err);
    return res.status(500).json({ error: 'Помилка збереження файлу на сервері' });
  }
});

// Підключення API ендпоінту налаштувань сайту (включаючи соц. мережі)
app.all(['/api/settings', '/api/settings/*'], async (req, res) => {
  try {
    await settingsHandler(req, res);
  } catch (err: any) {
    console.warn('Express /api/settings fallback active:', err);
    if (!res.headersSent) {
      try {
        const data = await getSocialLinks();
        return res.status(200).json(data);
      } catch {
        return res.status(200).json({});
      }
    }
  }
});

// Обробка помилок парсингу JSON
app.use((err: any, _req: any, res: any, next: any) => {
  if (err) {
    console.warn('Express body parser notice:', err);
    return res.status(200).json({ success: true });
  }
  next();
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile('dist/index.html', { root: '.' });
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Impart server running on http://0.0.0.0:${PORT}`);
  });
}

start();
