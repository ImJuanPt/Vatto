import { useEffect, useMemo, useState } from "react";
import { LucideLeaf, LucideSparkles, LucideTrendingDown, LucideAlertTriangle, LucideCheckCircle, LucideZap } from "lucide-react";
import { Appliance } from "../types/appliance";
import { useNavigate } from "react-router-dom";
import { getRecommendations, markRecommendationAction, RecommendationResponse } from "../api/recommendations";

interface RecommendationsPanelProps {
  appliances: Appliance[];
  highUsageThreshold: number;
}

const tips = [
  {
    id: "schedule",
    icon: LucideTrendingDown,
    title: "Desplaza picos de uso",
    description: "Programa los aparatos de alto consumo en horarios valle para aprovechar tarifas más bajas y aliviar la red.",
  },
  {
    id: "maintenance",
    icon: LucideSparkles,
    title: "Mantén los equipos",
    description: "Limpia filtros y rejillas cada mes, revisa juntas y ventilación para sostener la eficiencia al máximo.",
  },
  {
    id: "eco-mode",
    icon: LucideLeaf,
    title: "Activa modos eco",
    description: "Usa modos de bajo consumo o reposo cuando sea posible; ahorrarás energía sin sacrificar comodidad diaria.",
  },
];

export function RecommendationsPanel({ appliances, highUsageThreshold }: RecommendationsPanelProps) {
  const navigate = useNavigate();
  const [aiRecommendations, setAiRecommendations] = useState<RecommendationResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecommendations();
  }, []);

  const loadRecommendations = async () => {
    try {
      const data = await getRecommendations();
      setAiRecommendations(data);
    } catch (error) {
      console.error("Error loading recommendations:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkResolved = async (id: number) => {
    try {
      await markRecommendationAction(id);
      setAiRecommendations(recommendations =>
        recommendations.filter(r => r.id !== id)
      );
    } catch (error) {
      console.error("Error marking recommendation:", error);
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'border-red-500/50 bg-red-500/10 text-red-100';
      case 'HIGH':
        return 'border-orange-500/50 bg-orange-500/10 text-orange-100';
      case 'WARNING':
        return 'border-yellow-500/50 bg-yellow-500/10 text-yellow-100';
      case 'MEDIUM':
        return 'border-blue-500/50 bg-blue-500/10 text-blue-100';
      default:
        return 'border-slate-500/50 bg-slate-500/10 text-slate-100';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
      case 'HIGH':
      case 'WARNING':
        return LucideAlertTriangle;
      default:
        return LucideZap;
    }
  };

  const parseSavings = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const highUsageAppliances = appliances.filter(
    (appliance) => appliance.monthlyKWh > highUsageThreshold
  );

  const applianceIds = useMemo(() => new Set(appliances.map((a) => Number(a.id))), [appliances]);

  const visibleRecommendations = useMemo(() => {
    if (applianceIds.size === 0) return aiRecommendations;
    return aiRecommendations.filter((rec) => applianceIds.has(Number(rec.device_id)));
  }, [aiRecommendations, applianceIds]);

  return (
    <section className="rounded-2xl border border-white/10 bg-linear-to-br from-emerald-500/20 via-slate-900/40 to-slate-900/20 p-6 text-emerald-100 shadow-lg">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Recomendaciones de IA</h2>
          <p className="mt-1 text-sm text-emerald-100">
            Optimizaciones personalizadas basadas en tu consumo y patrones de uso
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-50">
          {visibleRecommendations.length} {visibleRecommendations.length === 1 ? "sugerencia" : "sugerencias"} activas
        </span>
      </header>

      {loading ? (
        <div className="mt-6 flex justify-center">
          <p className="text-sm text-emerald-100">Cargando recomendaciones...</p>
        </div>
      ) : visibleRecommendations.length > 0 ? (
        <div className="mt-6 space-y-3">
          {visibleRecommendations.map((rec) => {
            const Icon = getSeverityIcon(rec.severity_level);
            return (
              <div
                key={rec.id}
                className={`rounded-xl border p-4 transition-all duration-200 ${getSeverityColor(rec.severity_level)}`}
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-1 h-5 w-5 shrink-0" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-white">{rec.title}</h3>
                    <p className="mt-1 text-sm opacity-90">{rec.description}</p>
                    <div className="mt-3 flex flex-wrap gap-3 text-xs">
                      {rec.device_name && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                          📱 {rec.device_name}
                        </span>
                      )}
                      {parseSavings(rec.potential_savings_kwh) !== null && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                          💡 Ahorro: {parseSavings(rec.potential_savings_kwh)!.toFixed(1)} kWh
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-1">
                        🕒 {new Date(rec.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleMarkResolved(rec.id)}
                    className="shrink-0 rounded-lg bg-green-500/80 px-3 py-2 text-xs font-medium text-white transition-all duration-200 hover:bg-green-500 active:scale-95"
                  >
                    ✓ Resuelto
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-emerald-400/30 bg-white/5 py-8 text-center">
          <LucideCheckCircle className="h-12 w-12 text-emerald-400/60" />
          <p className="mt-3 text-sm font-medium text-emerald-100">
            Todo funciona correctamente
          </p>
          <p className="mt-1 text-xs text-emerald-200/70">
            No hay recomendaciones pendientes de IA
          </p>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-sm font-semibold text-white">Consejos generales</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {tips.map((tip) => {
            const Icon = tip.icon;
            return (
              <article
                key={tip.id}
                className="rounded-xl border border-emerald-400/30 bg-white/10 px-4 py-5 text-emerald-100 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-white/15"
              >
                <Icon className="h-6 w-6 text-emerald-200" />
                <h4 className="mt-3 text-base font-semibold text-white">
                  {tip.title}
                </h4>
                <p className="mt-2 text-sm text-emerald-100">{tip.description}</p>
              </article>
            );
          })}
        </div>
      </div>

      {highUsageAppliances.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Aparatos con alto consumo:</p>
          <ul className="mt-2 space-y-1">
            {highUsageAppliances.map((appliance) => (
              <li
                key={appliance.id}
                className="cursor-pointer rounded px-2 py-1 transition-colors hover:bg-amber-300/20"
                onClick={() => navigate(`/appliance/${appliance.id}`)}
                title="Ver detalles del dispositivo"
              >
                • {appliance.name} — {appliance.monthlyKWh.toFixed(1)} kWh este mes
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
