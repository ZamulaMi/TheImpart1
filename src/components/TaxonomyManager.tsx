import React, { useState } from 'react';
import { Plus, Trash2, Folder, Tag, Check, Sparkles } from 'lucide-react';
import { TaxonomiesData, CategoryItem, TopicItem, Article } from '../types';

interface TaxonomyManagerProps {
  taxonomies: TaxonomiesData;
  onSaveTaxonomies: (data: TaxonomiesData) => void;
  articles: Article[];
  showNotification: (msg: string) => void;
}

export const TaxonomyManager: React.FC<TaxonomyManagerProps> = ({
  taxonomies,
  onSaveTaxonomies,
  articles,
  showNotification,
}) => {
  const safeCategories = Array.isArray(taxonomies?.categories) ? taxonomies.categories : [];
  const safeTopics = Array.isArray(taxonomies?.topics) ? taxonomies.topics : [];
  const safeArticles = Array.isArray(articles) ? articles : [];

  // Нова рубрика
  const [newCatName, setNewCatName] = useState('');
  const [newCatNameEn, setNewCatNameEn] = useState('');

  // Нова тема
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicNameEn, setNewTopicNameEn] = useState('');

  // Підрахунок використання рубрик
  const getCategoryCount = (catName: string) => {
    return safeArticles.filter(
      (a) => a && a.category?.trim().toLowerCase() === catName.trim().toLowerCase()
    ).length;
  };

  // Підрахунок використання тем
  const getTopicCount = (topicName: string) => {
    return safeArticles.filter(
      (a) =>
        a &&
        a.topics &&
        a.topics.some((t) => t.trim().toLowerCase() === topicName.trim().toLowerCase())
    ).length;
  };

  // Додавання нової рубрики
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newCatName.trim();
    if (!cleanName) return;

    if (
      safeCategories.some(
        (c) => c.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      alert('Рубрика з такою назвою вже існує');
      return;
    }

    const newCat: CategoryItem = {
      id: `cat-${Date.now()}`,
      name: cleanName,
      nameEn: newCatNameEn.trim() || undefined,
    };

    const updated: TaxonomiesData = {
      categories: [...safeCategories, newCat],
      topics: safeTopics,
    };

    onSaveTaxonomies(updated);
    setNewCatName('');
    setNewCatNameEn('');
    showNotification(`Рубрику «${cleanName}» успішно додано`);
  };

  // Видалення рубрики
  const handleDeleteCategory = (id: string, name: string) => {
    const count = getCategoryCount(name);
    const confirmMsg =
      count > 0
        ? `Рубрика «${name}» використовується у ${count} статтях. Ви впевнені, що хочете її видалити зі списку доступних рубрик?`
        : `Видалити рубрику «${name}»?`;

    if (window.confirm(confirmMsg)) {
      const updated: TaxonomiesData = {
        categories: safeCategories.filter((c) => c.id !== id),
        topics: safeTopics,
      };
      onSaveTaxonomies(updated);
      showNotification(`Рубрику «${name}» видалено`);
    }
  };

  // Додавання нової теми
  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newTopicName.trim();
    if (!cleanName) return;

    if (
      safeTopics.some(
        (t) => t.name.toLowerCase() === cleanName.toLowerCase()
      )
    ) {
      alert('Тема з такою назвою вже існує');
      return;
    }

    const newTopic: TopicItem = {
      id: `top-${Date.now()}`,
      name: cleanName,
      nameEn: newTopicNameEn.trim() || undefined,
    };

    const updated: TaxonomiesData = {
      categories: safeCategories,
      topics: [...safeTopics, newTopic],
    };

    onSaveTaxonomies(updated);
    setNewTopicName('');
    setNewTopicNameEn('');
    showNotification(`Тему «${cleanName}» успішно додано`);
  };

  // Видалення теми
  const handleDeleteTopic = (id: string, name: string) => {
    const count = getTopicCount(name);
    const confirmMsg =
      count > 0
        ? `Тема «${name}» використовується у ${count} статтях. Ви впевнені, що хочете її видалити зі списку?`
        : `Видалити тему «${name}»?`;

    if (window.confirm(confirmMsg)) {
      const updated: TaxonomiesData = {
        categories: safeCategories,
        topics: safeTopics.filter((t) => t.id !== id),
      };
      onSaveTaxonomies(updated);
      showNotification(`Тему «${name}» видалено`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10">
      <div className="pb-6 border-b border-neutral-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-medium text-black">
            Рубрики та теми статей
          </h1>
          <p className="text-xs sm:text-sm text-neutral-500 mt-1">
            Створюйте та налаштовуйте структуру журналу. Обрані рубрики та теми доступні в редакторі статей для категоризації та подальшого сортування.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 bg-neutral-50 px-3 py-1.5 rounded-md border border-neutral-200/60 self-start sm:self-auto">
          <Sparkles className="w-3.5 h-3.5 text-neutral-400" />
          <span>{safeCategories.length} рубрик • {safeTopics.length} тем</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">
        {/* КОЛОНКА 1: РУБРИКИ (CATEGORIES) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-200">
            <Folder className="w-4 h-4 text-black" />
            <h2 className="text-sm uppercase tracking-wider font-semibold text-black">
              Рубрики ({safeCategories.length})
            </h2>
          </div>

          {/* Форма додавання нової рубрики */}
          <form
            onSubmit={handleAddCategory}
            className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-lg space-y-3"
          >
            <div className="text-xs font-medium text-black">Створити нову рубрику</div>
            <div className="space-y-2">
              <input
                type="text"
                required
                placeholder="Назва рубрики (UA) *"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
              <input
                type="text"
                placeholder="Category name (EN) — необов'язково"
                value={newCatNameEn}
                onChange={(e) => setNewCatNameEn(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Додати рубрику</span>
            </button>
          </form>

          {/* Список рубрик */}
          <div className="space-y-2">
            {safeCategories.map((cat) => {
              const count = getCategoryCount(cat.name);
              return (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 bg-white border border-neutral-100 hover:border-neutral-200 rounded-lg transition-colors group"
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-black truncate">
                        {cat.name}
                      </span>
                      {cat.nameEn && (
                        <span className="text-xs text-neutral-400 truncate">
                          / {cat.nameEn}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-neutral-400 mt-0.5">
                      {count} {count === 1 ? 'стаття' : count >= 2 && count <= 4 ? 'статті' : 'статей'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(cat.id, cat.name)}
                    className="p-1.5 text-neutral-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                    title="Видалити рубрику"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* КОЛОНКА 2: ТЕМИ (TOPICS / TAGS) */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 pb-3 border-b border-neutral-200">
            <Tag className="w-4 h-4 text-black" />
            <h2 className="text-sm uppercase tracking-wider font-semibold text-black">
              Теми / Теги ({safeTopics.length})
            </h2>
          </div>

          {/* Форма додавання нової теми */}
          <form
            onSubmit={handleAddTopic}
            className="p-4 bg-neutral-50 border border-neutral-200/80 rounded-lg space-y-3"
          >
            <div className="text-xs font-medium text-black">Створити нову тему</div>
            <div className="space-y-2">
              <input
                type="text"
                required
                placeholder="Назва теми (UA) *"
                value={newTopicName}
                onChange={(e) => setNewTopicName(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
              <input
                type="text"
                placeholder="Topic name (EN) — необов'язково"
                value={newTopicNameEn}
                onChange={(e) => setNewTopicNameEn(e.target.value)}
                className="w-full text-xs sm:text-sm bg-white border border-neutral-200 px-3 py-2 rounded focus:outline-none focus:border-black transition-colors"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-black text-white text-xs font-medium rounded hover:bg-neutral-800 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Додати тему</span>
            </button>
          </form>

          {/* Список тем у вигляді бейджів */}
          <div className="flex flex-wrap gap-2 pt-1">
            {safeTopics.map((topic) => {
              const count = getTopicCount(topic.name);
              return (
                <div
                  key={topic.id}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-100/80 hover:bg-neutral-100 border border-neutral-200/80 rounded-md text-xs transition-colors group"
                >
                  <span className="font-medium text-neutral-800">{topic.name}</span>
                  {topic.nameEn && (
                    <span className="text-neutral-400 text-[11px]">({topic.nameEn})</span>
                  )}
                  <span className="text-[10px] text-neutral-400 bg-white px-1.5 py-0.5 rounded-full border border-neutral-200/60">
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeleteTopic(topic.id, topic.name)}
                    className="text-neutral-300 hover:text-red-600 transition-colors cursor-pointer"
                    title="Видалити тему"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
