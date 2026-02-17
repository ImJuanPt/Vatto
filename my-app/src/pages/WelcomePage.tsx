import { Navbar } from "../components/Navbar";
import { getStoredAuth } from "../api/auth";

interface WelcomePageProps {
  onNavigateToDashboard: () => void;
  onLogout?: () => void;
}

export function WelcomePage({ onNavigateToDashboard, onLogout }: WelcomePageProps) {
  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        {/* Hero Section (no logo here) */}
        <section className="flex flex-col items-center gap-6 py-8">
          <div className="text-center">
            <h2 className="text-3xl font-bold text-emerald-200">Vatto</h2>
            <p className="text-sm text-slate-300 mt-1">Monitor Inteligente de Energía</p>
          </div>
        </section>

        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
              Bienvenido de nuevo
            </span>
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Controla el consumo eléctrico de tu hogar con confianza
            </h1>
            <p className="text-base text-slate-200 sm:text-lg">
              Visualiza qué aparatos consumen más, recibe consejos para reducir la factura y toma decisiones inteligentes con datos claros y fáciles de entender.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={onNavigateToDashboard}
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-400"
              >
                Entrar a la plataforma
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-white/60 hover:bg-white/10"
              >
                Explorar funciones
              </button>
            </div>
          </div>

          <div className="relative mt-4 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="absolute -top-6 right-6 rounded-full bg-emerald-500 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Consumo estimado
            </div>
            <div className="space-y-3">
              <p className="text-sm text-emerald-200">Nov 2025</p>
              <p className="text-4xl font-semibold">315 kWh</p>
              <p className="text-sm text-slate-200">
                El consumo mensual proyectado muestra una reducción del 12% frente al mes anterior gracias a los ajustes recomendados.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Dispositivos eficientes</p>
                <p className="mt-2 text-2xl font-semibold">68%</p>
                <p className="mt-1 text-xs text-slate-200">Aparatos dentro del rango objetivo</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Ahorro anual estimado</p>
                <p className="mt-2 text-2xl font-semibold">$147</p>
                <p className="mt-1 text-xs text-slate-200">Reduciendo picos y modo reposo</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-200">Próxima acción sugerida</p>
              <p className="mt-2 text-sm text-slate-100">
                Programa el aire acondicionado para activarse 30 minutos antes de llegar a casa y utiliza el modo eco durante la noche.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
