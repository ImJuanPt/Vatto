import { FiltersToolbar } from "../components/FiltersToolbar";
import { StatsPanel } from "../components/StatsPanel";
import { ConsumptionChart } from "../components/ConsumptionChart";
import { ApplianceCard } from "../components/ApplianceCard";
import { RecommendationsPanel } from "../components/RecommendationsPanel";
import { useMemo, useState, useEffect } from "react";
import devicesService from "../api/devices";
import { applianceHighUsageThreshold } from "../config/constants";
import { Appliance } from "../types/appliance";

export function DashboardPage({ onLogout }: { onLogout?: () => void }) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [appliances, setAppliances] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    devicesService
      .getDevices()
      .then((list) => {
        if (!mounted) return;
        setAppliances(list);
      })
      .catch(() => setAppliances([]))
      .finally(() => setLoading(false));
    return () => {
      mounted = false;
    };
  }, []);

  const filteredAppliances = useMemo(() => {
    if (categoryFilter === "all") return appliances;
    return appliances.filter((appliance) => appliance.category === categoryFilter);
  }, [categoryFilter, appliances]);

  const highUsageAppliances = filteredAppliances.filter(
    (appliance) => appliance.monthlyKWh > applianceHighUsageThreshold
  );

  const sortedAppliances = useMemo(() => [...filteredAppliances].sort((a, b) => b.monthlyKWh - a.monthlyKWh), [filteredAppliances]);

  const hasNoResults = filteredAppliances.length === 0;

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
     

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-200">
            Gestión en tiempo real
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Panel de consumo doméstico
          </h1>
          <p className="max-w-2xl text-base text-slate-200 sm:text-lg">
            Analiza el gasto mensual por dispositivo, identifica picos de uso y accede a recomendaciones inmediatas para optimizar tu consumo energético.
          </p>
        </header>

        <FiltersToolbar activeFilter={categoryFilter} onFilterChange={setCategoryFilter} />

        <StatsPanel appliances={filteredAppliances} highUsageThreshold={applianceHighUsageThreshold} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
          <ConsumptionChart appliances={filteredAppliances} />
          <div className="flex flex-col gap-6">
            <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-white">Alertas de alto consumo</h2>
              <p className="mt-1 text-sm text-emerald-100">
                Aparatos que superan los {applianceHighUsageThreshold} kWh este mes
              </p>
              <div className="mt-4 space-y-3">
                {highUsageAppliances.length === 0 ? (
                  <p className="text-sm text-emerald-300">
                    ¡Excelente! No hay consumos elevados en este momento.
                  </p>
                ) : (
                  highUsageAppliances.map((appliance) => (
                    <div
                      key={appliance.id}
                      className="flex items-center justify-between rounded-xl border border-amber-300/40 bg-amber-300/15 px-4 py-3 text-sm text-amber-100"
                    >
                      <span className="font-semibold">{appliance.name}</span>
                      <span>{appliance.monthlyKWh.toFixed(1)} kWh</span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <RecommendationsPanel
              appliances={filteredAppliances}
              highUsageThreshold={applianceHighUsageThreshold}
            />
          </div>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur-sm">
          <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-white">Inventario de aparatos</h2>
              <p className="text-sm text-emerald-100">
                Consulta el detalle de uso, potencia y última actualización
              </p>
            </div>
            <div className="text-xs font-medium text-emerald-100">
              Mostrar {filteredAppliances.length} aparatos
            </div>
          </header>

          {loading ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-emerald-100">
              Cargando aparatos...
            </div>
          ) : hasNoResults ? (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-10 text-center text-sm text-emerald-100">
              No hay aparatos en esta categoría por ahora.
            </div>
          ) : (
            <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {sortedAppliances.map((appliance: Appliance) => (
                <ApplianceCard
                  key={appliance.id}
                  appliance={appliance}
                  highUsageThreshold={applianceHighUsageThreshold}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
