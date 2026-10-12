import { getTaxonomies, saveTaxonomies } from './settings.ts';
import { verifyAdminToken, extractToken } from './_auth_utils.ts';
import { initResponseHelpers, parseRequestBody } from './_helpers.ts';
import type { TaxonomiesData } from '../src/types.ts';

export default async function handler(req: any, res: any) {
  initResponseHelpers(res);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      const data = await getTaxonomies();
      return res.status(200).json(data);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const token = extractToken(req);
      if (!verifyAdminToken(token)) {
        return res.status(401).json({ error: 'Потрібна авторизація адміністратора для збереження рубрик та тем' });
      }

      let body = await parseRequestBody(req);
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch {
          return res.status(400).json({ error: 'Недійсний JSON у запиті' });
        }
      }

      if (!body || typeof body !== 'object' || !Array.isArray(body.categories)) {
        return res.status(400).json({ error: 'Недійсний формат даних taxonomies (очікується масив categories)' });
      }

      const saved = await saveTaxonomies(body as TaxonomiesData);
      return res.status(200).json(saved);
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error: any) {
    console.error('API /api/taxonomies error:', error);
    const fallback = await getTaxonomies();
    return res.status(200).json(fallback);
  }
}
