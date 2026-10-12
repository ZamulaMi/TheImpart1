import React, { useState } from 'react';
import { Lock, User, Eye, EyeOff, ArrowLeft, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';
import { loginAdmin } from '../services/auth';
import { formatErrorMessage } from '../utils/errors';

interface AdminLoginProps {
  onLoginSuccess: () => void;
  onBackToSite: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onBackToSite }) => {
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('impart_admin_username') || '';
    } catch {
      return '';
    }
  });
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [remainingAttempts, setRemainingAttempts] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMessage('Будь ласка, введіть логін та пароль.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const result = await loginAdmin(username.trim(), password, rememberMe);
    setIsLoading(false);

    if (result.success) {
      onLoginSuccess();
    } else {
      setErrorMessage(formatErrorMessage(result.error, 'Невірний логін або пароль.'));
      if (result.remainingAttempts !== undefined) {
        setRemainingAttempts(result.remainingAttempts);
      }
      if (result.locked) {
        setIsLocked(true);
      }
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-neutral-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* Верхня панель */}
      <header className="px-6 sm:px-12 py-6 flex items-center justify-between border-b border-neutral-800/80 bg-neutral-900/60 backdrop-blur-md">
        <button
          onClick={onBackToSite}
          type="button"
          className="flex items-center gap-2 text-xs sm:text-sm text-neutral-400 hover:text-white transition-colors cursor-pointer group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span>Повернутися на сайт</span>
        </button>

        <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Захищене з'єднання (SSL/TLS)</span>
        </div>
      </header>

      {/* Центральна картка входу */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-2xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
          {/* Декоративна тонка лінія зверху */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-neutral-800 via-neutral-400 to-neutral-800" />

          {/* Заголовок та брендинг */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 text-neutral-200 mb-4 shadow-inner">
              <Lock className="w-5 h-5 text-neutral-300" />
            </div>
            <h1
              className="text-2xl sm:text-3xl font-normal tracking-tight text-white mb-2"
              style={{ fontFamily: "'Playfair Display', serif" }}
            >
              The Impart
            </h1>
            <p className="text-xs uppercase tracking-widest text-neutral-400 font-sans">
              Редакційна панель керування
            </p>
          </div>

          {/* Сповіщення про помилку */}
          {errorMessage && (
            <div className="mb-6 p-3.5 bg-red-950/60 border border-red-800/80 rounded-lg text-xs text-red-200 flex items-start gap-2.5 animate-fade-in">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{formatErrorMessage(errorMessage)}</p>
                {remainingAttempts !== null && remainingAttempts > 0 && !isLocked && (
                  <p className="text-[11px] text-red-300/80 mt-1">
                    Залишилось спроб до блокування: <strong className="text-white">{remainingAttempts}</strong>
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Форма авторизації */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
                Ім'я користувача / Логін
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading || isLocked}
                  placeholder="login"
                  required
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 bg-neutral-900 border border-neutral-800 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 rounded-lg text-sm text-white placeholder-neutral-600 transition-all outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-2">
                Пароль адміністратора
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-neutral-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading || isLocked}
                  placeholder="••••••••••••••••"
                  required
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-neutral-900 border border-neutral-800 focus:border-neutral-400 focus:ring-1 focus:ring-neutral-400 rounded-lg text-sm text-white placeholder-neutral-600 transition-all outline-none disabled:opacity-50 font-mono tracking-tight"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                  title={showPassword ? 'Приховати пароль' : 'Показати пароль'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-neutral-400 hover:text-neutral-300">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-neutral-700 bg-neutral-900 text-white focus:ring-0 focus:ring-offset-0 cursor-pointer"
                />
                <span>Запам'ятати на цьому пристрої</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || isLocked}
              className="w-full py-3 bg-white text-black hover:bg-neutral-200 active:bg-neutral-300 font-medium text-sm rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Перевірка облікових даних...</span>
                </>
              ) : (
                <span>Увійти до панелі керування</span>
              )}
            </button>
          </form>
        </div>
      </main>

      {/* Футер */}
      <footer className="px-6 py-4 text-center text-xs text-neutral-500 border-t border-neutral-900">
        © {new Date().getFullYear()} The Impart. Усі права захищено. Авторизований доступ лише для редакції.
      </footer>
    </div>
  );
};
