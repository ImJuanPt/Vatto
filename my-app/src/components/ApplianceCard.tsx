import { LucideAlertTriangle, LucidePlug } from "lucide-react";
import { Appliance } from "../types/appliance";

interface ApplianceCardProps {
  appliance: Appliance;
  highUsageThreshold: number;
}

const categoryColors: Record<Appliance["category"], string> = {
  kitchen: "bg-orange-400/20 text-orange-100 border border-orange-300/40",
  climate: "bg-sky-400/20 text-sky-100 border border-sky-300/40",
  laundry: "bg-violet-400/20 text-violet-100 border border-violet-300/40",
  entertainment: "bg-rose-400/20 text-rose-100 border border-rose-300/40",
  other: "bg-slate-400/20 text-slate-100 border border-slate-300/40",
};

export function ApplianceCard({ appliance, highUsageThreshold }: ApplianceCardProps) {
  const isHighUsage = appliance.monthlyKWh > highUsageThreshold;
  const currentState = appliance._meta?.currentState || 'off';
  const isOn = currentState === 'on';

  return (
    <article className="relative rounded-2xl border border-white/10 bg-white/10 p-5 text-emerald-100 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${categoryColors[appliance.category]}`}
            >
              <LucidePlug className="h-3.5 w-3.5" />
              {appliance.category}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                isOn
                  ? 'bg-green-400/20 text-green-100 border border-green-300/40'
                  : 'bg-gray-400/20 text-gray-100 border border-gray-300/40'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isOn ? 'bg-green-400' : 'bg-gray-400'}`}></span>
              {isOn ? 'ON' : 'OFF'}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-white">
            {appliance.name}
          </h3>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-emerald-200">Mensual</p>
          <p className="text-2xl font-semibold text-white">
            {appliance.monthlyKWh.toFixed(1)} kWh
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-emerald-100">
        <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
          <dt className="font-medium text-emerald-200">Potencia típica</dt>
          <dd className="mt-1 text-base font-semibold text-white">
            {appliance.typicalWattage} W
          </dd>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/10 px-3 py-2">
          <dt className="font-medium text-emerald-200">Uso diario</dt>
          <dd className="mt-1 text-base font-semibold text-white">
            {appliance.usageHoursPerDay > 0 ? appliance.usageHoursPerDay.toFixed(1) : '0'} h/día
          </dd>
        </div>
      </dl>

      <p className="mt-4 text-xs text-emerald-200">
        Actualizado {new Date(appliance.lastUpdated).toLocaleString()}
      </p>

      {isHighUsage && (
        <div className="absolute -top-4 right-4 inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-semibold text-amber-100 shadow">
          <LucideAlertTriangle className="h-4 w-4" />
          Alto consumo
        </div>
      )}
    </article>
  );
}
