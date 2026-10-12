import React, { useState } from 'react';
import { ArrowLeft, EyeOff, Globe, Link2, Check, Share2 } from 'lucide-react';
import { Article, SiteLanguage } from '../types';
import { formatTimeAgoOrDate } from '../utils/date';
import { ContentRenderer } from './ContentRenderer';

interface ArticleViewProps {
  article: Article;
  lang: SiteLanguage;
  onBack: () => void;
  onSwitchLang?: (lang: SiteLanguage) => void;
}

export const ArticleView: React.FC<ArticleViewProps> = ({
  article,
  lang,
  onBack,
  onSwitchLang,
}) => {
  const isEn = lang === 'en';
  const hasEnVersion = Boolean(article.titleEn?.trim() && article.contentEn?.trim());

  const [copiedLink, setCopiedLink] = useState(false);

  // Вибір даних залежно від обраної мови
  const title = isEn && hasEnVersion ? article.titleEn! : article.title;
  const content = isEn && hasEnVersion ? article.contentEn! : article.content;
  const excerpt = isEn && hasEnVersion ? article.excerptEn : article.excerpt;
  const categoriesList = isEn && hasEnVersion
    ? (article.categoriesEn && article.categoriesEn.length > 0
        ? article.categoriesEn
        : article.categoryEn
        ? [article.categoryEn]
        : (article.categories || [article.category])).filter(Boolean)
    : (article.categories && article.categories.length > 0
        ? article.categories
        : article.category ? [article.category] : []).filter(Boolean);
  const topics = isEn && article.topicsEn && article.topicsEn.length > 0 ? article.topicsEn : article.topics;

  const isHidden = isEn
    ? article.publishedEn === false || !article.publishedEn
    : article.published === false || String(article.published) === 'false';

  const timeDisplay = formatTimeAgoOrDate(article.createdAt, article.date, article.id, lang);

  // Копіювання унікального посилання на статтю
  const handleCopyLink = () => {
    const url = `${window.location.origin}/article/${article.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2200);
      });
    } else {
      // Резервний спосіб
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    }
  };

  return (
    <article className="w-[92%] sm:w-[90%] md:max-w-3xl mx-auto py-8 sm:py-16">
      {/* Верхня навігація, індикатор прихованості та кнопка копіювання посилання */}
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 hover:text-black transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-1 transition-transform" />
          <span>{isEn ? 'All articles' : 'Усі статті'}</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Кнопка "Скопіювати посилання на статтю" */}
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label={isEn ? 'Copy article link' : 'Скопіювати посилання на статтю'}
            className="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-black bg-neutral-50 hover:bg-neutral-100 border border-neutral-200/80 px-3 py-1 rounded transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">
                  {isEn ? 'Link copied!' : 'Посилання скопійовано!'}
                </span>
              </>
            ) : (
              <>
                <Link2 className="w-3.5 h-3.5" />
                <span>{isEn ? 'Copy link' : 'Скопіювати посилання'}</span>
              </>
            )}
          </button>

          {/* Якщо користувач перемкнувся на англійську, але стаття ще не перекладена */}
          {isEn && !hasEnVersion && (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded">
              <Globe className="w-3.5 h-3.5" />
              <span>English version coming soon (showing UA)</span>
            </span>
          )}

          {isHidden && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 px-3 py-1 rounded">
              <EyeOff className="w-3.5 h-3.5 text-neutral-500" />
              <span>
                {isEn ? 'Draft preview' : 'Прихована стаття (попередній перегляд)'}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Рубрики, теми та час публікації */}
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 mb-4">
        {categoriesList.map((cat, idx) => (
          <span
            key={`cat_${idx}`}
            className="font-medium text-neutral-800 bg-neutral-100 px-2.5 py-0.5 rounded"
          >
            {cat}
          </span>
        ))}
        {topics &&
          topics.map((t, idx) => (
            <span
              key={`top_${idx}`}
              className="text-neutral-500 bg-neutral-50 border border-neutral-200/60 px-2 py-0.5 rounded text-[11px]"
            >
              #{t}
            </span>
          ))}
        {timeDisplay && (
          <>
            <span className="text-neutral-300">•</span>
            <span>{timeDisplay}</span>
          </>
        )}
      </div>

      {/* Заголовок */}
      <h1
        className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-black leading-tight mb-6"
        style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
      >
        {title}
      </h1>

      {/* Автор та дата */}
      <div className="flex items-center justify-between py-4 border-y border-neutral-100 mb-8 text-xs text-neutral-500">
        <span>{article.author}</span>
        <span>{timeDisplay}</span>
      </div>

      {/* Обкладинка статті */}
      {article.coverImage && (
        <div className="mb-10 aspect-[16/9] w-full overflow-hidden bg-neutral-100 rounded-lg">
          <img
            src={article.coverImage}
            alt={title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      {/* Лід / короткий опис */}
      {excerpt && (
        <p className="text-lg sm:text-xl text-neutral-700 leading-relaxed font-serif italic mb-8 border-l-2 border-black pl-6">
          {excerpt}
        </p>
      )}

      {/* Рендеринг тексту з медіа */}
      <div className="prose prose-neutral max-w-none text-base sm:text-lg leading-relaxed text-neutral-800">
        <ContentRenderer content={content} />
      </div>

      {/* Теми статті внизу матеріалу */}
      {topics && topics.length > 0 && (
        <div className="mt-12 pt-6 border-t border-neutral-100">
          <div className="text-xs uppercase tracking-wider text-neutral-400 mb-3 font-sans">
            {isEn ? 'Topics & Themes' : 'Теми статті'}
          </div>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <span
                key={t}
                className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs rounded-md transition-colors"
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};
