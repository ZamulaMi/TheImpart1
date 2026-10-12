import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit3,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Globe,
  Image as ImageIcon,
  Video as VideoIcon,
  X,
  Languages,
  Copy,
  FileText,
  Share2,
  Upload,
  Link2,
  FolderTree,
  Tag,
  LogOut,
  Shield,
} from 'lucide-react';
import { Article, SiteSocialLinks, TaxonomiesData } from '../types';
import { formatTimeAgoOrDate } from '../utils/date';
import { ContentRenderer } from './ContentRenderer';
import { SocialLinksManager } from './SocialLinksManager';
import { RichArticleEditor } from './RichArticleEditor';
import { TaxonomyManager } from './TaxonomyManager';
import { AdminSecurityManager } from './AdminSecurityManager';
import { getAuthHeaders } from '../services/auth';
import { formatErrorMessage } from '../utils/errors';

interface AdminPanelProps {
  articles?: Article[];
  onSaveArticle: (article: Article) => Promise<void> | void;
  onDeleteArticle: (id: string) => Promise<void> | void;
  onExitAdmin: () => void;
  onLogout?: () => void;
  onViewArticleOnSite: (id: string) => void;
  socialLinks?: SiteSocialLinks;
  onSaveSocialLinks: (links: SiteSocialLinks) => Promise<void> | void;
  onRefreshSocialLinks?: () => Promise<void>;
  taxonomies?: TaxonomiesData;
  onSaveTaxonomies: (data: TaxonomiesData) => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  articles: rawArticles = [],
  onSaveArticle,
  onDeleteArticle,
  onExitAdmin,
  onLogout,
  onViewArticleOnSite,
  socialLinks = { ua: {}, en: {} },
  onSaveSocialLinks,
  onRefreshSocialLinks,
  taxonomies = { categories: [], topics: [] },
  onSaveTaxonomies,
}) => {
  const articles = Array.isArray(rawArticles) ? rawArticles.filter(Boolean) : [];
  // Розділ адмін-панелі: "Редактор статей", "Рубрики та теми", "Соц. мережі" або "Безпека та пароль"
  const [activeSection, setActiveSection] = useState<'articles' | 'taxonomies' | 'social_links' | 'security'>('articles');

  const [editingArticle, setEditingArticle] = useState<Partial<Article> | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<'all' | 'published_ua' | 'published_en' | 'hidden'>('all');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Швидке створення рубрик та тем безпосередньо у формі статті
  const [showQuickCreateCat, setShowQuickCreateCat] = useState(false);
  const [quickCatName, setQuickCatName] = useState('');
  const [quickCatNameEn, setQuickCatNameEn] = useState('');

  const [showQuickCreateTop, setShowQuickCreateTop] = useState(false);
  const [quickTopName, setQuickTopName] = useState('');
  const [quickTopNameEn, setQuickTopNameEn] = useState('');

  // Мовна вкладка у редакторі форми: 'ua' або 'en'
  const [formLangTab, setFormLangTab] = useState<'ua' | 'en'>('ua');

  // Вкладка перегляду контенту: 'edit' або 'preview'
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');

  const coverFileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);

  const handleCoverFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingCover(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 1920;
            if (width > maxDim || height > maxDim) {
              if (width > height) {
                height = Math.round((height * maxDim) / width);
                width = maxDim;
              } else {
                width = Math.round((width * maxDim) / height);
                height = maxDim;
              }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(event.target?.result as string);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.88));
          };
          img.onerror = () => reject(new Error('Не вдалося завантажити зображення'));
          img.src = event.target?.result as string;
        };
        reader.onerror = () => reject(new Error('Помилка читання файлу'));
        reader.readAsDataURL(file);
      });

      let finalUrl = dataUrl;
      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ data: dataUrl, filename: file.name }),
        });
        if (res.ok) {
          const resJson = await res.json();
          if (resJson.url) finalUrl = resJson.url;
        }
      } catch {}

      setEditingArticle((prev) => ({
        ...prev,
        coverImage: finalUrl,
      }));
      showNotification('Головну обкладинку успішно завантажено!');
    } catch {
      showNotification('Помилка завантаження фотографії');
    } finally {
      setIsUploadingCover(false);
    }
  };

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 4000);
  };

  const handleStartCreate = () => {
    setErrorMsg(null);
    setIsCreatingNew(true);
    setFormLangTab('ua');
    setEditorTab('edit');
    setEditingArticle({
      id: Date.now().toString(),
      title: '',
      excerpt: '',
      content: '',
      category: 'Есе',
      categories: ['Есе'],
      topics: [],
      author: 'Редакція The Impart',
      coverImage: '',
      date: new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }),
      published: true,
      titleEn: '',
      excerptEn: '',
      contentEn: '',
      categoryEn: 'Essay',
      categoriesEn: ['Essay'],
      topicsEn: [],
      publishedEn: false,
    });
  };

  const handleStartEdit = (article: Article) => {
    setErrorMsg(null);
    setIsCreatingNew(false);
    setFormLangTab('ua');
    setEditorTab('edit');
    const initialCats =
      article.categories && article.categories.length > 0
        ? [...article.categories]
        : article.category
        ? article.category.split(',').map((c) => c.trim()).filter(Boolean)
        : ['Загальне'];
    const initialCatsEn =
      article.categoriesEn && article.categoriesEn.length > 0
        ? [...article.categoriesEn]
        : article.categoryEn
        ? article.categoryEn.split(',').map((c) => c.trim()).filter(Boolean)
        : [];

    setEditingArticle({
      ...article,
      categories: initialCats,
      categoriesEn: initialCatsEn,
    });
  };

  const handleCancel = () => {
    setErrorMsg(null);
    setEditingArticle(null);
    setIsCreatingNew(false);
    setEditorTab('edit');
  };

  // Швидке перемикання видимості статті для української версії
  const handleToggleUaVisibility = async (article: Article) => {
    const isCurrentlyPublished =
      article.published === true || String(article.published) === 'true' || (article.published as any) === 1;
    const nextPublished = !isCurrentlyPublished;

    setTogglingId(`ua_${article.id}`);
    try {
      await onSaveArticle({
        ...article,
        published: nextPublished,
      });
      showNotification(
        nextPublished
          ? `Українську версію «${article.title}» опубліковано на сайті.`
          : `Українську версію «${article.title}» приховано з сайту.`
      );
    } catch (err: any) {
      console.error('Toggle visibility error:', err);
      showNotification(`Помилка: ${err.message || 'Не вдалося змінити видимість'}`);
    } finally {
      setTogglingId(null);
    }
  };

  // Швидке перемикання видимості статті для англійської версії
  const handleToggleEnVisibility = async (article: Article) => {
    if (!article.titleEn?.trim()) {
      showNotification('Спочатку заповніть англійську версію статті у редакторі.');
      return;
    }

    const isCurrentlyPublished =
      article.publishedEn === true || String(article.publishedEn) === 'true' || (article.publishedEn as any) === 1;
    const nextPublished = !isCurrentlyPublished;

    setTogglingId(`en_${article.id}`);
    try {
      await onSaveArticle({
        ...article,
        publishedEn: nextPublished,
      });
      showNotification(
        nextPublished
          ? `Англійську версію «${article.titleEn}» опубліковано на сайті.`
          : `Англійську версію «${article.titleEn}» приховано з сайту.`
      );
    } catch (err: any) {
      console.error('Toggle visibility error:', err);
      showNotification(`Помилка: ${err.message || 'Не вдалося змінити видимість'}`);
    } finally {
      setTogglingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle || !editingArticle.title?.trim()) {
      alert('Будь ласка, вкажіть заголовок статті для основної (української) версії.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    const isPub = editingArticle.published !== false && String(editingArticle.published) !== 'false';
    const isPubEn =
      editingArticle.publishedEn === true || String(editingArticle.publishedEn) === 'true';

    const finalArticle: Article = {
      id: editingArticle.id || Date.now().toString(),
      // Українська версія
      title: editingArticle.title.trim(),
      excerpt: editingArticle.excerpt?.trim() || '',
      content: editingArticle.content?.trim() || '',
      category:
        editingArticle.categories && editingArticle.categories.length > 0
          ? editingArticle.categories.join(', ')
          : editingArticle.category?.trim() || 'Загальне',
      categories:
        editingArticle.categories && editingArticle.categories.length > 0
          ? editingArticle.categories
          : editingArticle.category
          ? [editingArticle.category.trim()]
          : ['Загальне'],
      topics: editingArticle.topics || [],
      published: isPub,
      // Загальні метадані
      author: editingArticle.author?.trim() || 'Редакція The Impart',
      coverImage: editingArticle.coverImage?.trim() || undefined,
      date: editingArticle.date || new Date().toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric' }),
      createdAt: editingArticle.createdAt || new Date().toISOString(),
      // Англійська версія
      titleEn: editingArticle.titleEn?.trim() || undefined,
      excerptEn: editingArticle.excerptEn?.trim() || undefined,
      contentEn: editingArticle.contentEn?.trim() || undefined,
      categoryEn:
        editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
          ? editingArticle.categoriesEn.join(', ')
          : editingArticle.categoryEn?.trim() || undefined,
      categoriesEn:
        editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
          ? editingArticle.categoriesEn
          : editingArticle.categoryEn
          ? [editingArticle.categoryEn.trim()]
          : undefined,
      topicsEn: editingArticle.topicsEn || [],
      publishedEn: isPubEn,
    };

    try {
      await onSaveArticle(finalArticle);
      try {
        localStorage.removeItem(`impart_autosave_${finalArticle.id}_ua`);
        localStorage.removeItem(`impart_autosave_${finalArticle.id}_en`);
        localStorage.removeItem(`impart_autosave_new_ua`);
        localStorage.removeItem(`impart_autosave_new_en`);
      } catch {}
      showNotification(
        isCreatingNew
          ? 'Статтю успішно створено та збережено у базі даних!'
          : 'Зміни успішно збережено!'
      );
      setEditingArticle(null);
      setIsCreatingNew(false);
    } catch (err: any) {
      console.error('Save error:', err);
      setErrorMsg(formatErrorMessage(err, 'Помилка збереження у базі даних.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickCreateCategory = () => {
    const clean = quickCatName.trim();
    if (!clean) return;
    if (taxonomies.categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) {
      handleToggleCategory(clean, quickCatNameEn.trim() || undefined);
      setShowQuickCreateCat(false);
      setQuickCatName('');
      setQuickCatNameEn('');
      return;
    }
    const newCat = {
      id: `cat-${Date.now()}`,
      name: clean,
      nameEn: quickCatNameEn.trim() || undefined,
    };
    onSaveTaxonomies({
      ...taxonomies,
      categories: [...taxonomies.categories, newCat],
    });
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentCats =
        prev.categories && prev.categories.length > 0
          ? [...prev.categories]
          : prev.category
          ? prev.category.split(',').map((c) => c.trim()).filter(Boolean)
          : [];
      const currentCatsEn =
        prev.categoriesEn && prev.categoriesEn.length > 0
          ? [...prev.categoriesEn]
          : prev.categoryEn
          ? prev.categoryEn.split(',').map((c) => c.trim()).filter(Boolean)
          : [];

      const nextCats = currentCats.includes(clean) ? currentCats : [...currentCats, clean];
      const nextCatsEn =
        quickCatNameEn.trim() && !currentCatsEn.includes(quickCatNameEn.trim())
          ? [...currentCatsEn, quickCatNameEn.trim()]
          : currentCatsEn;

      return {
        ...prev,
        categories: nextCats,
        category: nextCats.join(', '),
        categoriesEn: nextCatsEn,
        categoryEn: nextCatsEn.join(', '),
      };
    });
    setShowQuickCreateCat(false);
    setQuickCatName('');
    setQuickCatNameEn('');
    showNotification(`Створено рубрику «${clean}»`);
  };

  const handleToggleCategory = (catName: string, catNameEn?: string) => {
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentCats =
        prev.categories && prev.categories.length > 0
          ? [...prev.categories]
          : prev.category
          ? prev.category.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const currentCatsEn =
        prev.categoriesEn && prev.categoriesEn.length > 0
          ? [...prev.categoriesEn]
          : prev.categoryEn
          ? prev.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

      const exists = currentCats.includes(catName);
      let nextCats: string[];
      let nextCatsEn: string[];

      if (exists) {
        if (currentCats.length <= 1) {
          showNotification('Стаття повинна містити щонайменше одну рубрику.');
          return prev;
        }
        nextCats = currentCats.filter((c) => c !== catName);
        nextCatsEn = catNameEn ? currentCatsEn.filter((c) => c !== catNameEn) : currentCatsEn;
      } else {
        nextCats = [...currentCats, catName];
        nextCatsEn =
          catNameEn && !currentCatsEn.includes(catNameEn)
            ? [...currentCatsEn, catNameEn]
            : currentCatsEn;
      }

      return {
        ...prev,
        categories: nextCats,
        category: nextCats.join(', '),
        categoriesEn: nextCatsEn,
        categoryEn: nextCatsEn.join(', '),
      };
    });
  };

  const handleToggleCategoryEn = (enName: string, uaName?: string) => {
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const currentCatsEn =
        prev.categoriesEn && prev.categoriesEn.length > 0
          ? [...prev.categoriesEn]
          : prev.categoryEn
          ? prev.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
          : [];
      const currentCatsUa =
        prev.categories && prev.categories.length > 0
          ? [...prev.categories]
          : prev.category
          ? prev.category.split(',').map((s) => s.trim()).filter(Boolean)
          : [];

      const exists = currentCatsEn.includes(enName);
      let nextCatsEn: string[];
      let nextCatsUa = currentCatsUa;

      if (exists) {
        nextCatsEn = currentCatsEn.filter((c) => c !== enName);
      } else {
        nextCatsEn = [...currentCatsEn, enName];
        if (uaName && !currentCatsUa.includes(uaName)) {
          nextCatsUa = [...currentCatsUa, uaName];
        }
      }

      return {
        ...prev,
        categoriesEn: nextCatsEn,
        categoryEn: nextCatsEn.join(', '),
        categories: nextCatsUa,
        category: nextCatsUa.join(', '),
      };
    });
  };

  const handleQuickCreateTopic = () => {
    const clean = quickTopName.trim();
    if (!clean) return;
    let updatedTopics = [...taxonomies.topics];
    if (!updatedTopics.some((t) => t.name.toLowerCase() === clean.toLowerCase())) {
      const newTop = {
        id: `top-${Date.now()}`,
        name: clean,
        nameEn: quickTopNameEn.trim() || undefined,
      };
      updatedTopics.push(newTop);
      onSaveTaxonomies({
        ...taxonomies,
        topics: updatedTopics,
      });
    }
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const current = prev.topics || [];
      if (!current.includes(clean)) {
        return {
          ...prev,
          topics: [...current, clean],
          topicsEn: quickTopNameEn.trim()
            ? [...(prev.topicsEn || []), quickTopNameEn.trim()]
            : prev.topicsEn,
        };
      }
      return prev;
    });
    setShowQuickCreateTop(false);
    setQuickTopName('');
    setQuickTopNameEn('');
    showNotification(`Додано тему «${clean}»`);
  };

  const handleToggleTopic = (topicName: string, topicNameEn?: string) => {
    setEditingArticle((prev) => {
      if (!prev) return prev;
      const current = prev.topics || [];
      const currentEn = prev.topicsEn || [];
      const exists = current.includes(topicName);
      if (exists) {
        return {
          ...prev,
          topics: current.filter((t) => t !== topicName),
          topicsEn: topicNameEn ? currentEn.filter((t) => t !== topicNameEn) : currentEn,
        };
      } else {
        return {
          ...prev,
          topics: [...current, topicName],
          topicsEn: topicNameEn ? [...currentEn, topicNameEn] : currentEn,
        };
      }
    });
  };

  const handleRemoveTopic = (topicName: string) => {
    setEditingArticle((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: (prev.topics || []).filter((t) => t !== topicName),
      };
    });
  };

  const filteredArticles = articles.filter((a) => {
    const isPubUa = a.published === true || String(a.published) === 'true' || (a.published as any) === 1;
    const isPubEn = a.publishedEn === true || String(a.publishedEn) === 'true' || (a.publishedEn as any) === 1;

    if (filterStatus === 'published_ua') return isPubUa;
    if (filterStatus === 'published_en') return isPubEn;
    if (filterStatus === 'hidden') return !isPubUa && !isPubEn;
    return true;
  });

  const uaPublishedCount = articles.filter(
    (a) => a.published === true || String(a.published) === 'true' || (a.published as any) === 1
  ).length;
  const enPublishedCount = articles.filter(
    (a) => a.publishedEn === true || String(a.publishedEn) === 'true' || (a.publishedEn as any) === 1
  ).length;

  return (
    <div className="min-h-screen bg-white text-black font-sans flex flex-col">
      {/* Верхня панель адмінки */}
      <header className="border-b border-neutral-100 bg-white sticky top-0 z-30 px-6 sm:px-12 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onExitAdmin}
            className="flex items-center gap-2 text-sm text-neutral-600 hover:text-black transition-colors cursor-pointer group"
            title="Повернутися на головний сайт"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            <span className="hidden sm:inline">На сайт</span>
          </button>
          <span className="text-neutral-300">/</span>
          <span
            className="text-lg sm:text-xl font-medium tracking-tight text-black select-none"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            The Impart
          </span>
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-sm">
            Панель керування
          </span>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onExitAdmin();
            }}
            className="text-xs text-neutral-500 hover:text-black flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Головна сторінка</span>
          </a>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-xs text-neutral-500 hover:text-red-600 flex items-center gap-1.5 transition-colors cursor-pointer pl-3 border-l border-neutral-200"
              title="Завершити сеанс адміністратора"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Вийти</span>
            </button>
          )}
        </div>
      </header>

      {/* Спливаюче сповіщення */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 bg-black text-white text-xs sm:text-sm px-4 py-3 rounded shadow-lg flex items-center gap-2 animate-fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{notification}</span>
        </div>
      )}

      {/* Основний контейнер з лівим сайдбаром меню та робочою областю */}
      <div className="flex-1 flex flex-col md:flex-row w-full max-w-7xl mx-auto">
        {/* Лівий сайдбар з кнопками опцій */}
        <aside className="w-full md:w-64 border-b md:border-b-0 md:border-r border-neutral-100 p-6 shrink-0 bg-neutral-50/40">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 mb-3 px-3">
            Розділи
          </div>
          <nav className="flex flex-row md:flex-col gap-1.5">
            {/* Опція 1: Редактор статей (по замовчуванню) */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('articles');
                setEditingArticle(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'articles'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Редактор статей</span>
            </button>

            {/* Опція 2: Рубрики та теми */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('taxonomies');
                setEditingArticle(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'taxonomies'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <FolderTree className="w-4 h-4 shrink-0" />
              <span>Рубрики та теми</span>
            </button>

            {/* Опція 3: Соц. мережі */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('social_links');
                setEditingArticle(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'social_links'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>Соц. мережі</span>
            </button>

            {/* Опція 4: Безпека та пароль */}
            <button
              type="button"
              onClick={() => {
                setActiveSection('security');
                setEditingArticle(null);
                setIsCreatingNew(false);
              }}
              className={`flex-1 md:flex-initial flex items-center gap-3 px-3.5 py-2.5 text-xs sm:text-sm font-medium rounded-md transition-all cursor-pointer text-left ${
                activeSection === 'security'
                  ? 'bg-black text-white shadow-xs'
                  : 'text-neutral-600 hover:text-black hover:bg-neutral-100'
              }`}
            >
              <Shield className="w-4 h-4 shrink-0" />
              <span>Безпека та пароль</span>
            </button>
          </nav>
        </aside>

        {/* Робоча область вибраного розділу */}
        <main className="flex-1 w-full px-6 sm:px-12 py-8 sm:py-12 overflow-x-hidden">
          {activeSection === 'taxonomies' ? (
            <TaxonomyManager
              taxonomies={taxonomies}
              onSaveTaxonomies={onSaveTaxonomies}
              articles={articles}
              showNotification={showNotification}
            />
          ) : activeSection === 'social_links' ? (
            <SocialLinksManager
              socialLinks={socialLinks}
              onSaveSocialLinks={onSaveSocialLinks}
              onRefreshSocialLinks={onRefreshSocialLinks}
              showNotification={showNotification}
            />
          ) : activeSection === 'security' ? (
            <AdminSecurityManager
              showNotification={showNotification}
              onLogout={onLogout}
            />
          ) : editingArticle ? (
          /* Форма редагування / створення статті */
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center justify-between pb-6 border-b border-neutral-100 mb-6">
              <div>
                <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
                  {isCreatingNew ? 'Нова стаття' : 'Редагування статті'}
                </h1>
                <p className="text-xs text-neutral-500 mt-1">
                  Основна назва статті в списку завжди українською, переклад створюється на вкладці «English».
                </p>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs sm:text-sm text-neutral-500 hover:text-black transition-colors cursor-pointer"
              >
                Скасувати
              </button>
            </div>

            {/* ВКЛАДКИ МОВ: УКРАЇНСЬКА ТА АНГЛІЙСЬКА */}
            <div className="flex items-center gap-2 border-b border-neutral-200 pb-px mb-8">
              <button
                type="button"
                onClick={() => setFormLangTab('ua')}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer ${
                  formLangTab === 'ua'
                    ? 'border-black text-black'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                <span>Українська версія (основна)</span>
                {editingArticle.published !== false ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Опубліковано на UA" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-neutral-300" title="Приховано на UA" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setFormLangTab('en')}
                className={`flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-all cursor-pointer ${
                  formLangTab === 'en'
                    ? 'border-black text-black'
                    : 'border-transparent text-neutral-400 hover:text-neutral-700'
                }`}
              >
                <span>English version</span>
                {editingArticle.publishedEn ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500" title="Опубліковано на EN" />
                ) : editingArticle.titleEn?.trim() ? (
                  <span className="w-2 h-2 rounded-full bg-amber-400" title="Чернетка EN" />
                ) : (
                  <span className="text-[10px] text-neutral-400 uppercase tracking-wider font-normal">
                    (порожньо)
                  </span>
                )}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* ЗАГАЛЬНІ ПОЛЯ (Автор та обкладинка — спільні для обох мов) */}
              <div className="p-4 bg-neutral-50/70 border border-neutral-200/80 rounded-lg space-y-4">
                <div className="flex items-center justify-between text-xs text-neutral-500 uppercase tracking-wider">
                  <span>Загальні параметри матеріалу</span>
                  <span className="text-[10px] text-neutral-400">Спільні для UA та EN</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
                      Автор статті
                    </label>
                    <input
                      type="text"
                      placeholder="Ім'я автора"
                      value={editingArticle.author || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, author: e.target.value })}
                      className="w-full text-sm border-b border-neutral-200 pb-1.5 focus:border-black focus:outline-none transition-colors bg-transparent"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Головна обкладинка статті
                      </label>
                      <button
                        type="button"
                        onClick={() => coverFileInputRef.current?.click()}
                        disabled={isUploadingCover}
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-800 hover:text-black font-medium cursor-pointer underline disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{isUploadingCover ? 'Завантаження...' : 'Завантажити файл'}</span>
                      </button>
                    </div>
                    <input
                      type="file"
                      ref={coverFileInputRef}
                      accept="image/*"
                      onChange={handleCoverFileChange}
                      className="hidden"
                    />
                    <input
                      type="url"
                      placeholder="https://images.unsplash.com/... або завантажте файл кнопкою вище"
                      value={editingArticle.coverImage || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, coverImage: e.target.value })}
                      className="w-full text-sm border-b border-neutral-200 pb-1.5 focus:border-black focus:outline-none transition-colors bg-transparent font-mono text-xs"
                    />
                  </div>
                </div>

                {editingArticle.coverImage && (
                  <div className="relative aspect-[16/9] max-h-48 overflow-hidden rounded-md bg-neutral-100 border border-neutral-200 group">
                    <img
                      src={editingArticle.coverImage}
                      alt="Обкладинка"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setEditingArticle({ ...editingArticle, coverImage: '' })}
                      title="Видалити обкладинку"
                      className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-black text-white rounded-full transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* ВМІСТ УКРАЇНСЬКОЇ ВЕРСІЇ */}
              {formLangTab === 'ua' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <span className="text-xs uppercase tracking-wider font-medium text-black flex items-center gap-1.5">
                      Український текст статті (UA)
                    </span>
                    <span className="text-xs text-neutral-400">Основна версія</span>
                  </div>

                  {/* Заголовок UA */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Заголовок статті (UA) *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Введіть заголовок статті українською..."
                      value={editingArticle.title || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, title: e.target.value })}
                      className="w-full text-lg sm:text-xl font-serif border-b border-neutral-200 pb-2 focus:border-black focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Рубрики статті (UA) */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Рубрики статті * (можна обрати кілька)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCreateCat(!showQuickCreateCat)}
                        className="text-xs text-neutral-500 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showQuickCreateCat ? 'Скасувати' : 'Створити нову рубрику'}</span>
                      </button>
                    </div>

                    {showQuickCreateCat && (
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                        <div className="text-xs font-medium text-black">Нова рубрика</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Назва рубрики (UA)..."
                            value={quickCatName}
                            onChange={(e) => setQuickCatName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateCategory();
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                          <input
                            type="text"
                            placeholder="Name in EN..."
                            value={quickCatNameEn}
                            onChange={(e) => setQuickCatNameEn(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateCategory();
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                          <button
                            type="button"
                            onClick={handleQuickCreateCategory}
                            className="px-3.5 py-1.5 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 shrink-0 cursor-pointer"
                          >
                            Додати
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Вибір рубрик зі списку (можна обрати декілька) */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {taxonomies.categories.map((cat) => {
                          const currentCats =
                            editingArticle.categories && editingArticle.categories.length > 0
                              ? editingArticle.categories
                              : editingArticle.category
                              ? editingArticle.category.split(',').map((s) => s.trim()).filter(Boolean)
                              : [];
                          const isSelected = currentCats.includes(cat.name);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleToggleCategory(cat.name, cat.nameEn)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-black text-white border-black shadow-xs ring-1 ring-black'
                                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              <span>{cat.name}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Список призначених рубрик */}
                      {(() => {
                        const selectedCats =
                          editingArticle.categories && editingArticle.categories.length > 0
                            ? editingArticle.categories
                            : editingArticle.category
                            ? editingArticle.category.split(',').map((s) => s.trim()).filter(Boolean)
                            : [];
                        if (selectedCats.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
                            <span>Призначені рубрики:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedCats.map((catName) => (
                                <span
                                  key={catName}
                                  className="inline-flex items-center gap-1 bg-neutral-100 text-black px-2 py-0.5 rounded text-[11px] font-medium"
                                >
                                  {catName}
                                  {selectedCats.length > 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleToggleCategory(catName)}
                                      className="hover:text-red-600 transition-colors ml-0.5 cursor-pointer text-xs"
                                      title="Видалити рубрику"
                                    >
                                      ×
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Теми статті (Topics / Tags) */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-neutral-500">
                        Теми статті (для детального сортування)
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowQuickCreateTop(!showQuickCreateTop)}
                        className="text-xs text-neutral-500 hover:text-black flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{showQuickCreateTop ? 'Скасувати' : 'Створити нову тему'}</span>
                      </button>
                    </div>

                    {showQuickCreateTop && (
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg space-y-2">
                        <div className="text-xs font-medium text-black">Нова тема / тег</div>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            placeholder="Назва теми (UA)..."
                            value={quickTopName}
                            onChange={(e) => setQuickTopName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateTopic();
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                          <input
                            type="text"
                            placeholder="Topic name in EN..."
                            value={quickTopNameEn}
                            onChange={(e) => setQuickTopNameEn(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleQuickCreateTopic();
                              }
                            }}
                            className="w-full text-xs bg-white border border-neutral-200 px-3 py-1.5 rounded focus:outline-none focus:border-black"
                          />
                          <button
                            type="button"
                            onClick={handleQuickCreateTopic}
                            className="px-3.5 py-1.5 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 shrink-0 cursor-pointer"
                          >
                            Додати тему
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Обрані теми для цієї статті */}
                    {editingArticle.topics && editingArticle.topics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 items-center">
                        <span className="text-[11px] text-neutral-400 mr-1">Обрані теми:</span>
                        {editingArticle.topics.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black text-white text-xs rounded-md shadow-xs"
                          >
                            <span>#{t}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveTopic(t)}
                              className="hover:text-neutral-300 cursor-pointer"
                              title="Прибрати зі статті"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Вибір тем з доступних */}
                    <div className="flex flex-wrap gap-1.5 p-3 bg-neutral-50/70 border border-neutral-200/80 rounded-lg">
                      <div className="w-full text-[11px] text-neutral-400 mb-1">
                        Оберіть теми зі списку нижче:
                      </div>
                      {taxonomies.topics.map((top) => {
                        const isAttached = editingArticle.topics?.includes(top.name);
                        return (
                          <button
                            key={top.id}
                            type="button"
                            onClick={() => handleToggleTopic(top.name, top.nameEn)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                              isAttached
                                ? 'bg-neutral-900 text-white font-medium shadow-xs'
                                : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-black'
                            }`}
                          >
                            {isAttached && <Check className="w-3 h-3 text-emerald-400" />}
                            <span>#{top.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Короткий опис UA */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Короткий опис (для списку на головній)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Одне-два речення про головну думку статті українською..."
                      value={editingArticle.excerpt || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, excerpt: e.target.value })}
                      className="w-full text-sm border border-neutral-200 p-3 focus:border-black focus:outline-none transition-colors resize-none"
                    />
                  </div>

                  {/* Текст UA + розширені інструменти форматування */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Текст статті (UA) *
                    </label>
                    <RichArticleEditor
                      value={editingArticle.content || ''}
                      onChange={(val) => setEditingArticle({ ...editingArticle, content: val })}
                      placeholder="Напишіть текст статті українською тут..."
                      lang="ua"
                      articleId={editingArticle.id || 'new'}
                      minHeight="420px"
                    />
                  </div>

                  {/* Перемикач видимості української версії */}
                  <div className="pt-2">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Видимість на українській версії сайту
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingArticle({ ...editingArticle, published: true })}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.published !== false
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <Eye className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Опубліковано для UA</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Відображається читачам, коли обрана мова UA
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingArticle({ ...editingArticle, published: false })}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.published === false
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <EyeOff className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Приховано для UA</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Зберігається в базі, але не показується на сайті
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ВМІСТ АНГЛІЙСЬКОЇ ВЕРСІЇ */}
              {formLangTab === 'en' && (
                <div className="space-y-6 animate-fade-in">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-100">
                    <span className="text-xs uppercase tracking-wider font-medium text-black flex items-center gap-1.5">
                      English Article Version (EN)
                    </span>
                    {editingArticle.content && !editingArticle.contentEn && (
                      <button
                        type="button"
                        onClick={() => {
                          // Допомагає скопіювати текст або медіа-посилання з UA для перекладу
                          setEditingArticle({
                            ...editingArticle,
                            categoryEn: editingArticle.categoryEn || editingArticle.category,
                            contentEn: editingArticle.content,
                          });
                          showNotification('Структуру тексту скопійовано з української версії для перекладу.');
                        }}
                        className="text-xs text-neutral-600 hover:text-black flex items-center gap-1 underline cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Скопіювати з UA для перекладу</span>
                      </button>
                    )}
                  </div>

                  {/* Заголовок EN */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Article Title (EN)
                    </label>
                    <input
                      type="text"
                      placeholder="Enter article title in English..."
                      value={editingArticle.titleEn || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, titleEn: e.target.value })}
                      className="w-full text-lg sm:text-xl font-serif border-b border-neutral-200 pb-2 focus:border-black focus:outline-none transition-colors"
                    />
                  </div>

                  {/* Рубрики EN (можна обрати кілька) */}
                  <div className="space-y-3">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500">
                      Topic / Category (EN) — select multiple if applicable
                    </label>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {taxonomies.categories.map((cat) => {
                          const enName = cat.nameEn || cat.name;
                          const currentCatsEn =
                            editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
                              ? editingArticle.categoriesEn
                              : editingArticle.categoryEn
                              ? editingArticle.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
                              : [];
                          const isSelected = currentCatsEn.includes(enName);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              onClick={() => handleToggleCategoryEn(enName, cat.name)}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-black text-white border-black shadow-xs ring-1 ring-black'
                                  : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'
                              }`}
                            >
                              {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              <span>{enName}</span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Список призначених англійських рубрик */}
                      {(() => {
                        const selectedCatsEn =
                          editingArticle.categoriesEn && editingArticle.categoriesEn.length > 0
                            ? editingArticle.categoriesEn
                            : editingArticle.categoryEn
                            ? editingArticle.categoryEn.split(',').map((s) => s.trim()).filter(Boolean)
                            : [];
                        if (selectedCatsEn.length === 0) return null;
                        return (
                          <div className="flex items-center gap-2 text-xs text-neutral-500 pt-1">
                            <span>Selected categories:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedCatsEn.map((catEnName) => (
                                <span
                                  key={catEnName}
                                  className="inline-flex items-center gap-1 bg-neutral-100 text-black px-2 py-0.5 rounded text-[11px] font-medium"
                                >
                                  {catEnName}
                                  <button
                                    type="button"
                                    onClick={() => handleToggleCategoryEn(catEnName)}
                                    className="hover:text-red-600 transition-colors ml-0.5 cursor-pointer text-xs"
                                    title="Remove category"
                                  >
                                    ×
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Теми EN */}
                  <div className="space-y-3 pt-1">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500">
                      Article Themes & Tags (EN)
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-3 bg-neutral-50/70 border border-neutral-200/80 rounded-lg">
                      <div className="w-full text-[11px] text-neutral-400 mb-1">
                        Select themes in English for international readers:
                      </div>
                      {taxonomies.topics.map((top) => {
                        const topEnName = top.nameEn || top.name;
                        const isAttached =
                          editingArticle.topicsEn?.includes(topEnName) ||
                          editingArticle.topics?.includes(top.name);
                        return (
                          <button
                            key={top.id}
                            type="button"
                            onClick={() => handleToggleTopic(top.name, topEnName)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer ${
                              isAttached
                                ? 'bg-neutral-900 text-white font-medium shadow-xs'
                                : 'bg-white text-neutral-600 border border-neutral-200 hover:border-neutral-400 hover:text-black'
                            }`}
                          >
                            {isAttached && <Check className="w-3 h-3 text-emerald-400" />}
                            <span>#{topEnName}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Короткий опис EN */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Excerpt / Summary (EN)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="One or two sentences summarizing the article in English..."
                      value={editingArticle.excerptEn || ''}
                      onChange={(e) => setEditingArticle({ ...editingArticle, excerptEn: e.target.value })}
                      className="w-full text-sm border border-neutral-200 p-3 focus:border-black focus:outline-none transition-colors resize-none"
                    />
                  </div>

                  {/* Текст EN + розширені інструменти форматування */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Article Content (EN)
                    </label>
                    <RichArticleEditor
                      value={editingArticle.contentEn || ''}
                      onChange={(val) => setEditingArticle({ ...editingArticle, contentEn: val })}
                      placeholder="Write English article content here..."
                      lang="en"
                      articleId={editingArticle.id || 'new'}
                      minHeight="420px"
                    />
                  </div>

                  {/* Перемикач видимості англійської версії */}
                  <div className="pt-2">
                    <label className="block text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Видимість на англійській версії сайту
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingArticle({ ...editingArticle, publishedEn: true })}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.publishedEn === true
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <Eye className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Опубліковано для EN</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Стаття з'явиться на сайті, коли читач перемкнеться на англійську мову
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setEditingArticle({ ...editingArticle, publishedEn: false })}
                        className={`p-3.5 border text-left rounded transition-all cursor-pointer flex items-start gap-3 ${
                          editingArticle.publishedEn !== true
                            ? 'border-black bg-neutral-50 ring-1 ring-black'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <EyeOff className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
                        <div>
                          <div className="text-xs sm:text-sm font-medium text-black">Приховано для EN (чернетка)</div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            Не відображається в англійській версії сайту
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Повідомлення про помилку збереження */}
              {errorMsg && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded">
                  {formatErrorMessage(errorMsg)}
                </div>
              )}

              {/* Кнопки збереження */}
              <div className="pt-6 border-t border-neutral-100 flex items-center justify-between">
                <div className="text-xs text-neutral-500">
                  {formLangTab === 'ua' ? (
                    <button
                      type="button"
                      onClick={() => setFormLangTab('en')}
                      className="text-black hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Перейти до редагування англійської версії</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setFormLangTab('ua')}
                      className="text-black hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span>Повернутися до української версії</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={handleCancel}
                    className="px-5 py-2 text-xs sm:text-sm text-neutral-600 hover:text-black transition-colors cursor-pointer disabled:opacity-50"
                  >
                    Скасувати
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 bg-black text-white text-xs sm:text-sm tracking-wide hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-2"
                  >
                    {isSaving && (
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    <span>{isSaving ? 'Збереження...' : isCreatingNew ? 'Створити матеріал' : 'Зберегти зміни'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        ) : (
          /* Список статей у панелі */
          <div>
            {/* Заголовок та кнопка створення */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-neutral-100 mb-6 gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
                  Редактор статей
                </h1>
                <p className="text-xs sm:text-sm text-neutral-500 mt-1">
                  Назва матеріалів у списку українською. Керування українською та англійською версіями ({articles.length}{' '}
                  {articles.length === 1 ? 'стаття' : 'статей'})
                </p>
              </div>
              <button
                onClick={handleStartCreate}
                className="self-start sm:self-auto flex items-center gap-2 bg-black text-white px-4 py-2 text-xs sm:text-sm tracking-wide hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Створити нову статтю</span>
              </button>
            </div>

            {/* Вкладки фільтрів видимості: Всі, Опубліковані UA, Опубліковані EN, Приховані */}
            {articles.length > 0 && (
              <div className="flex items-center gap-2 pb-4 mb-4 border-b border-neutral-100 overflow-x-auto">
                <button
                  onClick={() => setFilterStatus('all')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'all'
                      ? 'bg-black text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-black hover:bg-neutral-200'
                  }`}
                >
                  <span>Всі матеріали</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === 'all' ? 'bg-neutral-800 text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}>
                    {articles.length}
                  </span>
                </button>

                <button
                  onClick={() => setFilterStatus('published_ua')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'published_ua'
                      ? 'bg-emerald-700 text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  <span>Опубліковані UA</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === 'published_ua' ? 'bg-emerald-800 text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}>
                    {uaPublishedCount}
                  </span>
                </button>

                <button
                  onClick={() => setFilterStatus('published_en')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'published_en'
                      ? 'bg-blue-700 text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-blue-700 hover:bg-blue-50'
                  }`}
                >
                  <span>Опубліковані EN</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    filterStatus === 'published_en' ? 'bg-blue-800 text-white' : 'bg-neutral-200 text-neutral-600'
                  }`}>
                    {enPublishedCount}
                  </span>
                </button>

                <button
                  onClick={() => setFilterStatus('hidden')}
                  className={`px-3 py-1.5 text-xs rounded transition-colors cursor-pointer flex items-center gap-1.5 ${
                    filterStatus === 'hidden'
                      ? 'bg-neutral-800 text-white font-medium'
                      : 'bg-neutral-100 text-neutral-600 hover:text-black hover:bg-neutral-200'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Приховані</span>
                </button>
              </div>
            )}

            {articles.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-neutral-200">
                <p className="text-neutral-500 text-sm mb-4">Наразі немає жодної статті.</p>
                <button
                  onClick={handleStartCreate}
                  className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-black underline underline-offset-4 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Створити першу публікацію
                </button>
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-neutral-200">
                <p className="text-neutral-500 text-sm">Немає статей для обраного фільтра.</p>
                <button
                  onClick={() => setFilterStatus('all')}
                  className="mt-3 text-xs text-black underline underline-offset-4 cursor-pointer"
                >
                  Показати всі матеріали
                </button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {filteredArticles.map((art) => {
                  const isPubUa =
                    art.published === true || String(art.published) === 'true' || (art.published as any) === 1;
                  const isPubEn =
                    art.publishedEn === true || String(art.publishedEn) === 'true' || (art.publishedEn as any) === 1;
                  const hasEn = Boolean(art.titleEn?.trim());

                  const isTogglingUa = togglingId === `ua_${art.id}`;
                  const isTogglingEn = togglingId === `en_${art.id}`;
                  const timeDisplay = formatTimeAgoOrDate(art.createdAt, art.date, art.id, 'ua');

                  return (
                    <div
                      key={art.id}
                      className={`py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group px-3 -mx-3 transition-colors rounded ${
                        isPubUa || isPubEn
                          ? 'hover:bg-neutral-50/60'
                          : 'bg-neutral-50/50 hover:bg-neutral-100/60 border-l-2 border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {art.coverImage ? (
                          <img
                            src={art.coverImage}
                            alt={art.title}
                            className={`w-16 h-16 sm:w-20 sm:h-20 object-cover rounded shrink-0 bg-neutral-100 ${
                              !isPubUa && !isPubEn ? 'grayscale opacity-75' : ''
                            }`}
                          />
                        ) : (
                          <div
                            className={`w-16 h-16 sm:w-20 sm:h-20 rounded shrink-0 flex items-center justify-center text-xs font-serif ${
                              isPubUa ? 'bg-neutral-100 text-neutral-400' : 'bg-neutral-200 text-neutral-500'
                            }`}
                          >
                            The Impart
                          </div>
                        )}
                        <div>
                          <div className="flex flex-wrap items-center gap-2 mb-1.5">
                            {/* Статус UA */}
                            {isPubUa ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                UA: Live
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                                UA: Сховано
                              </span>
                            )}

                            {/* Статус EN */}
                            {isPubEn ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                EN: Live
                              </span>
                            ) : hasEn ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                                EN: Чернетка
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">
                                EN: Немає
                              </span>
                            )}

                            <span className="text-neutral-300">•</span>
                            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
                              {Array.isArray(art.categories) && art.categories.length > 0
                                ? art.categories.map((c: any) => typeof c === 'string' ? c : c?.name || String(c)).join(' / ')
                                : typeof art.category === 'string'
                                ? art.category
                                : (art.category as any)?.name || (art.category as any)?.title || ''}
                            </span>
                            {timeDisplay && (
                              <>
                                <span className="text-neutral-300">•</span>
                                <span className="text-xs text-neutral-400">{timeDisplay}</span>
                              </>
                            )}
                          </div>

                          {/* ГОЛОВНА НАЗВА В СПИСКУ ЗАВЖДИ УКРАЇНСЬКОЮ */}
                          <h2 className="text-base sm:text-lg font-serif font-medium text-black group-hover:text-neutral-700 transition-colors">
                            {typeof art.title === 'string' ? art.title : (art.title as any)?.name || String(art.title || '')}
                          </h2>

                          {/* Додаткова плашка, якщо є англійський переклад */}
                          {art.titleEn && (
                            <p className="text-xs text-neutral-400 italic mt-0.5 flex items-center gap-1">
                              <span>EN:</span>
                              <span>{typeof art.titleEn === 'string' ? art.titleEn : String(art.titleEn)}</span>
                            </p>
                          )}

                          {art.excerpt && (
                            <p className="text-xs text-neutral-500 line-clamp-1 mt-1 max-w-xl">
                              {typeof art.excerpt === 'string' ? art.excerpt : String(art.excerpt)}
                            </p>
                          )}

                          {Array.isArray(art.topics) && art.topics.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {art.topics.map((t: any, idx: number) => {
                                const topicStr = typeof t === 'string' ? t : t?.name || String(t);
                                return (
                                  <span
                                    key={`${topicStr}_${idx}`}
                                    className="text-[10px] text-neutral-500 bg-neutral-100 px-1.5 py-0.5 rounded"
                                  >
                                    #{topicStr}
                                  </span>
                                );
                              })}
                            </div>
                          )}

                          <p className="text-[11px] text-neutral-400 mt-1">
                            {typeof art.author === 'string' ? art.author : (art.author as any)?.name || String(art.author || '')}
                          </p>
                        </div>
                      </div>

                      {/* Панель дій над статтею */}
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                        {/* Кнопка швидкого приховування/публікації для UA */}
                        <button
                          onClick={() => handleToggleUaVisibility(art)}
                          disabled={isTogglingUa}
                          className={`p-2 rounded transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                            isPubUa
                              ? 'text-neutral-600 hover:text-amber-700 hover:bg-amber-50'
                              : 'text-neutral-500 hover:text-emerald-700 hover:bg-emerald-50'
                          } disabled:opacity-50`}
                          title={
                            isPubUa
                              ? 'Сховати українську версію з сайту'
                              : 'Опублікувати українську версію на сайті'
                          }
                        >
                          {isTogglingUa ? (
                            <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <span className="text-[11px] font-semibold text-neutral-700">UA</span>
                              <span className="hidden lg:inline">{isPubUa ? 'Сховати' : 'Показати'}</span>
                            </>
                          )}
                        </button>

                        {/* Кнопка швидкого приховування/публікації для EN */}
                        {hasEn && (
                          <button
                            onClick={() => handleToggleEnVisibility(art)}
                            disabled={isTogglingEn}
                            className={`p-2 rounded transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                              isPubEn
                                ? 'text-neutral-600 hover:text-amber-700 hover:bg-amber-50'
                                : 'text-neutral-500 hover:text-blue-700 hover:bg-blue-50'
                            } disabled:opacity-50`}
                            title={
                              isPubEn
                                ? 'Сховати англійську версію з сайту'
                                : 'Опублікувати англійську версію на сайті'
                            }
                          >
                            {isTogglingEn ? (
                              <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <span className="text-[11px] font-semibold text-neutral-700">EN</span>
                                <span className="hidden lg:inline">{isPubEn ? 'Hide' : 'Publish'}</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Скопіювати пряме посилання на статтю */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = `${window.location.origin}/article/${art.id}`;
                            navigator.clipboard.writeText(url).then(() => {
                              showNotification('Пряме посилання на статтю скопійовано');
                            });
                          }}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                          title="Скопіювати пряме посилання на статтю"
                        >
                          <Link2 className="w-4 h-4" />
                        </button>

                        {/* Перегляд на сайті */}
                        <button
                          onClick={() => onViewArticleOnSite(art.id)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                          title="Переглянути на сайті"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>

                        {/* Редагування */}
                        <button
                          onClick={() => handleStartEdit(art)}
                          className="p-2 text-neutral-500 hover:text-black hover:bg-neutral-100 rounded transition-colors cursor-pointer"
                          title="Редагувати статтю (UA / EN)"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>

                        {/* Видалення */}
                        <button
                          onClick={() => {
                            const isConfirmed = typeof window !== 'undefined' && window.confirm
                              ? window.confirm(`Видалити статтю «${art.title || ''}» назавжди з бази даних?`)
                              : true;
                            if (isConfirmed) {
                              onDeleteArticle(art.id);
                              showNotification('Статтю назавжди видалено.');
                            }
                          }}
                          className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors cursor-pointer"
                          title="Видалити назавжди"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>
      </div>
    </div>
  );
};
