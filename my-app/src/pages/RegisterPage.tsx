import { useState } from 'react';
import auth from '../api/auth';
import { useNavigate } from 'react-router-dom';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.register(email, fullName, password);
      setSuccess('Registro completado. Ahora puedes iniciar sesión.');
      setTimeout(() => navigate('/login'), 1200);
    } catch (err: any) {
      setError(err?.message || 'Error en el registro');
    }
    finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-slate-800 p-6 rounded-2xl shadow-xl border border-emerald-500/20">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <img 
            src="/LogoVatto.png" 
            alt="Vatto Logo" 
            className="h-20 w-20 object-contain"
          />
        </div>
        
        <h1 className="text-2xl font-bold text-center mb-2">Vatto</h1>
        <p className="text-xs text-emerald-100 text-center mb-6">Crear cuenta</p>
        
        {error && <div className="text-red-400 mb-3 text-sm">{error}</div>}
        {success && <div className="text-emerald-300 mb-3 text-sm">{success}</div>}
        <label className="block text-sm mb-2">Nombre completo</label>
        <input value={fullName} onChange={(e) => setFullName(e.target.value)} disabled={loading} className="w-full mb-3 rounded px-3 py-2 bg-amber-50 text-black" />
        <label className="block text-sm mb-2">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} className="w-full mb-3 rounded px-3 py-2 bg-amber-50 text-black" />
        <label className="block text-sm mb-2">Contraseña</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" disabled={loading} className="w-full mb-4 rounded px-3 py-2 bg-amber-50 text-black" />
        <button disabled={loading} className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 transition-all py-2.5 text-white font-medium shadow-lg disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {loading ? (
            <svg className="h-4 w-4 animate-spin text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
            </svg>
          ) : null}
          <span>{loading ? 'Registrando...' : 'Registrar'}</span>
        </button>
        <div className="mt-3 text-center text-sm">
          <a href="/login" className="text-emerald-300 hover:underline">Ya tengo cuenta</a>
        </div>
      </form>
    </div>
  );
}
