export interface CategoryItem {
  id: string;
  name: string;
  nameEn?: string;
}

export interface TopicItem {
  id: string;
  name: string;
  nameEn?: string;
}

export interface TaxonomiesData {
  categories: CategoryItem[];
  topics: TopicItem[];
}

export interface Article {
  id: string;
  // Українська версія (основна)
  title: string;
  excerpt: string;
  content: string;
  category: string;
  categories?: string[]; // Рубрики статті (UA) - можливість призначити декілька рубрик
  topics?: string[]; // Теми / теги статті (UA)
  author: string;
  coverImage?: string;
  date: string;
  readTime?: string;
  createdAt?: string;
  published: boolean; // Опубліковано для української версії сайту

  // Англійська версія
  titleEn?: string;
  excerptEn?: string;
  contentEn?: string;
  categoryEn?: string;
  categoriesEn?: string[]; // Рубрики статті (EN) - можливість призначити декілька рубрик
  topicsEn?: string[]; // Теми / теги статті (EN)
  publishedEn?: boolean; // Опубліковано для англійської версії сайту
}

export type SiteLanguage = 'ua' | 'en';

export interface SocialLinksSet {
  telegram?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
  threads?: string;
}

export interface SiteSocialLinks {
  ua: SocialLinksSet;
  en: SocialLinksSet;
}

export const DEFAULT_SOCIAL_LINKS: SiteSocialLinks = {
  ua: {
    telegram: 'https://t.me/impart',
    instagram: 'https://instagram.com/impart',
    x: 'https://x.com/impart_ua',
    youtube: 'https://youtube.com/@impart_ua',
    threads: 'https://threads.net/@impart_ua',
  },
  en: {
    telegram: 'https://t.me/impart_en',
    instagram: 'https://instagram.com/impart_en',
    x: 'https://x.com/impart_en',
    youtube: 'https://youtube.com/@impart_en',
    threads: 'https://threads.net/@impart_en',
  },
};
