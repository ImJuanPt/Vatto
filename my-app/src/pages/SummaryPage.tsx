import { useMemo, useState, useEffect } from "react";
import { FiltersToolbar } from "../components/FiltersToolbar";
import { StatsPanel } from "../components/StatsPanel";
import { ConsumptionChart } from "../components/ConsumptionChart";
import { RecommendationsPanel } from "../components/RecommendationsPanel";
import { Appliance } from "../types/appliance";
import { User } from "../types/user";
import { api } from "../api/client";
import { applianceHighUsageThreshold } from "../config/constants";
import { getReadingsForDevice } from "../api/readings";
import { Reading } from "../types/reading";

interface SummaryPageProps {
  user: User;
  onLogout?: () => void;
}

export function SummaryPage({ user, onLogout }: SummaryPageProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [appliances, setAppliances] = useState<Appliance[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('../api/devices');
        const list = (await mod.getDevices()) as Appliance[];
        if (!mounted) return;

        // Para cada dispositivo, intentar obtener lecturas y calcular monthlyKWh y usageHoursPerDay
        const enriched = await Promise.all(
          list.map(async (ap) => {
            try {
              // Si el dispositivo ya tiene monthlyKWh del backend, usar ese
              if (ap.monthlyKWh > 0 || ap.usageHoursPerDay > 0) {
                console.log(`[SummaryPage] Using backend data for ${ap.name}: monthlyKWh=${ap.monthlyKWh}, usageHoursPerDay=${ap.usageHoursPerDay}`);
                return ap;
              }

              // De lo contrario, obtener lecturas y calcular
              const readings: Reading[] = await getReadingsForDevice(ap.id);
              const totalKwh = computeKwhFromReadings(readings, 30);
              const usageHours = computeActiveHours(readings, 30);
              console.log(`[SummaryPage] Computed for ${ap.name}: monthlyKWh=${totalKwh}, usageHoursPerDay=${usageHours}`);
              return { ...ap, monthlyKWh: typeof totalKwh === 'number' ? totalKwh : (ap.monthlyKWh ?? 0), usageHoursPerDay: typeof usageHours === 'number' ? usageHours : (ap.usageHoursPerDay ?? 0) } as Appliance;
            } catch (e) {
              console.warn(`[SummaryPage] Error enriching ${ap.name}:`, e);
              return { ...ap, monthlyKWh: ap.monthlyKWh ?? 0 } as Appliance;
            }
          })
        );

        console.log('[SummaryPage] Final appliances:', enriched);
        setAppliances(enriched);
      } catch (err) {
        console.warn('Failed to load devices for summary', err);
        setAppliances([]);
      }
    })();
    return () => { mounted = false };
  }, []);

  function computeKwhFromReadings(readings: Reading[], days = 30): number {
    if (!readings || readings.length === 0) return 0;
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    // Si las lecturas incluyen valores energyKwh, sumar aquellos dentro del rango.
    if (readings.some((r) => typeof r.energyKwh === 'number')) {
      const total = readings.reduce((sum, r) => {
        const t = new Date(r.time).getTime();
        if (t < cutoff) return sum;
        const ek = r.energyKwh ?? 0;
        return sum + ek;
      }, 0);
      return Math.round(total * 100) / 100;
    }

    const sorted = readings.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    let total = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const ta = new Date(a.time).getTime();
      const tb = new Date(b.time).getTime();
      if (tb < cutoff) continue;
      const dt = Math.min(tb, Date.now()) - Math.max(ta, cutoff);
      if (dt <= 0) continue;
      const p = a.powerWatts ?? 0;
      const pNext = b.powerWatts ?? p;
      const avgW = (p + pNext) / 2;
      total += (avgW * (dt / 1000) / 3600) / 1000; // W * s -> Wh -> kWh
    }
    return Math.round(total * 100) / 100;
  }

  function computeActiveHours(readings: Reading[], days = 30): number {
    if (!readings || readings.length === 0) return 0;
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const sorted = readings.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    let activeSeconds = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const ta = new Date(a.time).getTime();
      const tb = new Date(b.time).getTime();
      if (tb < cutoff) continue;
      const dt = Math.min(tb, Date.now()) - Math.max(ta, cutoff);
      if (dt <= 0) continue;
      const p = a.powerWatts ?? (a.energyKwh ? (a.energyKwh * 1000) / ((dt || 3600) / 1000) : 0);
      const pNext = b.powerWatts ?? p;
      const avgW = (p + pNext) / 2;
      if (avgW > 1) activeSeconds += dt;
    }
    return Math.round((activeSeconds / 3600) * 100) / 100;
  }

  const filteredAppliances = useMemo(() => {
    if (categoryFilter === "all") return appliances;
    return appliances.filter((appliance) => appliance.category === categoryFilter);
  }, [categoryFilter, appliances]);

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      

      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <header className="space-y-3">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-200">
            Resumen ejecutivo
          </span>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Vista general del consumo doméstico
          </h1>
          <p className="max-w-2xl text-base text-slate-200 sm:text-lg">
            Revisa métricas clave, tendencias de consumo y recomendaciones antes de entrar al detalle de cada aparato.
          </p>
        </header>

        <FiltersToolbar activeFilter={categoryFilter} onFilterChange={setCategoryFilter} />

        <StatsPanel appliances={filteredAppliances} highUsageThreshold={applianceHighUsageThreshold} />

        <ConsumptionChart appliances={filteredAppliances} />

        <RecommendationsPanel
          appliances={filteredAppliances}
          highUsageThreshold={applianceHighUsageThreshold}
        />
      </div>
    </main>
  );
}
