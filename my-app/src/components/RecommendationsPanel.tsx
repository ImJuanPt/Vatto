import { LucideLeaf, LucideSparkles, LucideTrendingDown } from "lucide-react";
import { Appliance } from "../types/appliance";

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
  const highUsageAppliances = appliances.filter(
    (appliance) => appliance.monthlyKWh > highUsageThreshold
  );

  return (
    <section className="rounded-2xl border border-white/10 bg-linear-to-br from-emerald-500/20 via-slate-900/40 to-slate-900/20 p-6 text-emerald-100 shadow-lg">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Acciones recomendadas</h2>
          <p className="mt-1 text-sm text-emerald-100">
            Sugerencias basadas en tu consumo actual
          </p>
        </div>
        <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-50">
          {highUsageAppliances.length} alerta{highUsageAppliances.length === 1 ? "" : "s"} activas
        </span>
      </header>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {tips.map((tip) => {
          const Icon = tip.icon;
          return (
            <article
              key={tip.id}
              className="rounded-xl border border-emerald-400/30 bg-white/10 px-4 py-5 text-emerald-100 shadow-sm transition-all duration-200 hover:-translate-y-1 hover:bg-white/15"
            >
              <Icon className="h-6 w-6 text-emerald-200" />
              <h3 className="mt-3 text-base font-semibold text-white">
                {tip.title}
              </h3>
              <p className="mt-2 text-sm text-emerald-100">{tip.description}</p>
            </article>
          );
        })}
      </div>

      {highUsageAppliances.length > 0 && (
        <div className="mt-6 rounded-xl border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-amber-100">
          <p className="font-semibold">Prioriza estos aparatos:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {highUsageAppliances.map((appliance) => (
              <li key={appliance.id}>
                {appliance.name} — {appliance.monthlyKWh.toFixed(1)} kWh este mes
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
