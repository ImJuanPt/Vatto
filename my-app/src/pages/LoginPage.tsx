import { useState } from 'react';
import auth from '../api/auth';
import { useNavigate } from 'react-router-dom';
import { AlertBanner } from '../components/AlertBanner';

function resolveLoginError(err: any): { message: string; variant: 'error' | 'warning' } {
  const status: number | undefined = err?.status;
  const bodyMsg: string | undefined = err?.body?.message ?? err?.body?.error;

  if (!navigator.onLine) return { message: 'Sin conexión a internet. Verifica tu red e intenta de nuevo.', variant: 'warning' };

  switch (status) {
    case 400: return { message: bodyMsg ?? 'Los datos enviados no son válidos. Revisa el email y la contraseña.', variant: 'error' };
    case 401: return { message: 'Email o contraseña incorrectos. Verifica tus datos e intenta de nuevo.', variant: 'error' };
    case 403: return { message: 'Tu cuenta no tiene acceso. Contacta al soporte si crees que es un error.', variant: 'warning' };
    case 404: return { message: 'No encontramos una cuenta con ese email. ¿Quieres crear una?', variant: 'error' };
    case 429: return { message: 'Demasiados intentos seguidos. Espera unos minutos e intenta de nuevo.', variant: 'warning' };
    case 500:
    case 502:
    case 503: return { message: 'El servidor está teniendo problemas. Intenta de nuevo en unos momentos.', variant: 'warning' };
    default:
      if (bodyMsg) return { message: bodyMsg, variant: 'error' };
      return { message: 'Ocurrió un error inesperado. Intenta de nuevo.', variant: 'error' };
  }
}

export function LoginPage({ onLogin }: { onLogin: (user: any) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alert, setAlert] = useState<{ message: string; variant: 'error' | 'warning' | 'success' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAlert(null);

    if (!email.trim() || !password) {
      setAlert({ message: 'Por favor completa el email y la contraseña.', variant: 'warning' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setAlert({ message: 'El email no tiene un formato válido.', variant: 'warning' });
      return;
    }

    setLoading(true);
    try {
      const user = await auth.login(email.trim(), password);
      onLogin(user);
      navigate('/');
    } catch (err: any) {
      setAlert(resolveLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
      <div className="w-full max-w-sm">
        <form onSubmit={handleSubmit} className="bg-slate-800 p-6 rounded-2xl shadow-xl border border-emerald-500/20">
          <div className="flex justify-center -mb-20">
            <img src="/LogoVatto.png" alt="Vatto Logo" className="h-80 w-80 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-center mb-2">Vatto</h1>
          <p className="text-xs text-emerald-100 text-center mb-6">Monitor inteligente de energía</p>

          <AlertBanner
            message={alert?.message ?? null}
            variant={alert?.variant}
            onDismiss={() => setAlert(null)}
          />

          <label className="block text-sm mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            autoComplete="email"
            placeholder="correo@ejemplo.com"
            className="w-full mb-3 rounded-lg px-3 py-2 bg-amber-50 text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />

          <label className="block text-sm mb-1.5">Contraseña</label>
          <div className="relative mb-5">
            <input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
              placeholder="••••••••"
              className="w-full rounded-lg px-3 py-2 pr-10 bg-amber-50 text-black placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
              tabIndex={-1}
              aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              {showPass ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-5 0-9-4-9-7a9.96 9.96 0 012.34-4.34M6.6 6.6A8.97 8.97 0 0112 5c5 0 9 3 9 7a9.96 9.96 0 01-3.1 4.9M3 3l18 18" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>

          <button
            disabled={loading}
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-all py-2.5 text-white font-medium shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            <span>{loading ? 'Entrando...' : 'Entrar'}</span>
          </button>

          <div className="mt-4 text-center text-sm">
            <a href="/register" className="text-emerald-300 hover:underline">¿No tienes cuenta? Regístrate</a>
          </div>
        </form>
      </div>
    </div>
  );
}
