import { Appliance } from "../types/appliance";
import { calculateInsights } from "../utils/calculateInsights";

type StatsPanelProps = {
  appliances: Appliance[];
  highUsageThreshold: number;
};

export function StatsPanel({ appliances, highUsageThreshold }: StatsPanelProps) {
  const insights = calculateInsights(appliances, highUsageThreshold);

  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="col-span-1 sm:col-span-2 rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg">
        <p className="text-sm font-medium text-emerald-200">Consumo mensual total</p>
        <p className="mt-2 text-3xl font-semibold text-white">
          {insights.totalConsumption.toFixed(1)} kWh
        </p>
        <p className="mt-4 text-sm text-emerald-100">
          Promedio por aparato: <span className="text-white font-semibold">{insights.averageConsumption.toFixed(1)} kWh</span>
        </p>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg">
        <p className="text-sm font-medium text-emerald-200">Top consumidores</p>
        <ul className="mt-3 space-y-2 text-sm text-emerald-100">
          {insights.topConsumers.map((appliance, index) => (
            <li key={appliance.id} className="flex justify-between">
              <span className="font-semibold text-white">
                {index + 1}. {appliance.name}
              </span>
              <span>{appliance.monthlyKWh.toFixed(1)} kWh</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg">
        <p className="text-sm font-medium text-emerald-200">Eficiencia global</p>
        <p className="mt-2 text-3xl font-semibold text-emerald-200">
          {insights.efficiencyScore}%
        </p>
        <p className="mt-4 text-sm text-emerald-100">
          Basado en los aparatos dentro del rango objetivo
        </p>
      </div>
    </section>
  );
}
