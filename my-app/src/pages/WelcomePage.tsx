import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Appliance } from "../types/appliance";
import { getDevices } from "../api/devices";
import { getRecommendations, RecommendationResponse } from "../api/recommendations";
import { applianceHighUsageThreshold } from "../config/constants";

interface WelcomePageProps {
  onNavigateToDashboard?: () => void;
  onLogout?: () => void;
  user?: {
    fullName?: string;
  };
}

export function WelcomePage({ user }: WelcomePageProps) {
  const navigate = useNavigate();
  const [appliances, setAppliances] = useState<Appliance[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendationResponse[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [devices, recs] = await Promise.all([getDevices(), getRecommendations()]);
        if (!mounted) return;
        setAppliances(Array.isArray(devices) ? devices : []);
        setRecommendations(Array.isArray(recs) ? recs : []);
      } catch (error) {
        console.warn("[WelcomePage] Failed to load dashboard snapshot", error);
        if (!mounted) return;
        setAppliances([]);
        setRecommendations([]);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const currentMonthLabel = useMemo(
    () =>
      new Date().toLocaleDateString("es-ES", {
        month: "short",
        year: "numeric",
      }),
    []
  );

  const totalMonthlyKwh = useMemo(
    () => appliances.reduce((sum, a) => sum + Number(a.monthlyKWh || 0), 0),
    [appliances]
  );

  const efficientPercent = useMemo(() => {
    if (!appliances.length) return 0;
    const efficient = appliances.filter((a) => Number(a.monthlyKWh || 0) <= applianceHighUsageThreshold).length;
    return Math.round((efficient / appliances.length) * 100);
  }, [appliances]);

  const potentialSavingsKwh = useMemo(
    () =>
      recommendations.reduce((sum, r) => {
        const v = Number(r.potential_savings_kwh ?? 0);
        return sum + (Number.isFinite(v) ? v : 0);
      }, 0),
    [recommendations]
  );

  const nextSuggestedAction = useMemo(() => {
    if (recommendations.length > 0) return recommendations[0].description;
    const topConsumer = [...appliances].sort((a, b) => Number(b.monthlyKWh || 0) - Number(a.monthlyKWh || 0))[0];
    if (topConsumer) {
      return `Revisa el consumo de ${topConsumer.name} (${Number(topConsumer.monthlyKWh || 0).toFixed(
        1
      )} kWh) y programa horarios de uso más eficientes.`;
    }
    return "Conecta tus dispositivos para comenzar a recibir sugerencias personalizadas.";
  }, [recommendations, appliances]);

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 pb-20 pt-10 sm:px-6 lg:px-8">
        <section className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
              Bienvenido de nuevo
            </span>
            {user?.fullName && (
              <p className="mt-2 text-sm text-emerald-100">{user.fullName}</p>
            )}
            <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
              Controla el consumo eléctrico de tu hogar con confianza
            </h1>
            <p className="text-base text-slate-200 sm:text-lg">
              Visualiza qué aparatos consumen más, recibe consejos para reducir la factura y toma decisiones inteligentes con datos claros y fáciles de entender.
            </p>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => navigate("/resumen")}
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-400"
              >
                Entrar a la plataforma
              </button>
              <button
                type="button"
                onClick={() => navigate("/gestion")}
                className="inline-flex items-center justify-center rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:border-white/60 hover:bg-white/10"
              >
                Gestionar aparatos
              </button>
            </div>
          </div>

          <div className="relative mt-4 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
            <div className="absolute -top-6 right-6 rounded-full bg-emerald-500 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-white">
              Consumo estimado
            </div>
            <div className="space-y-3">
              <p className="text-sm text-emerald-200">{currentMonthLabel}</p>
              <p className="text-4xl font-semibold">{totalMonthlyKwh.toFixed(1)} kWh</p>
              <p className="text-sm text-slate-200">
                Consumo mensual acumulado con base en las lecturas reales de tus dispositivos activos.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Dispositivos eficientes</p>
                <p className="mt-2 text-2xl font-semibold">{efficientPercent}%</p>
                <p className="mt-1 text-xs text-slate-200">Aparatos dentro del rango objetivo</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide text-emerald-200">Ahorro potencial</p>
                <p className="mt-2 text-2xl font-semibold">{potentialSavingsKwh.toFixed(1)} kWh</p>
                <p className="mt-1 text-xs text-slate-200">Sumatoria de recomendaciones activas de IA</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-emerald-200">Próxima acción sugerida</p>
              <p className="mt-2 text-sm text-slate-100">
                {nextSuggestedAction}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
