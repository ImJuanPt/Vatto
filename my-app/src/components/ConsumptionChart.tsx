import { Appliance } from "../types/appliance";
import { useNavigate } from "react-router-dom";

interface ConsumptionChartProps {
  appliances: Appliance[];
  title?: string;
  subtitle?: string;
}

export function ConsumptionChart({ appliances, title = "Comparativa de consumo", subtitle }: ConsumptionChartProps) {
  const maxConsumption = Math.max(...appliances.map((appliance) => appliance.monthlyKWh), 1);
  const navigate = useNavigate();

  return (
    <section className="rounded-2xl border border-white/10 bg-white/10 p-6 shadow-lg">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-emerald-100">
            {subtitle || `Consumo más alto: ${maxConsumption.toFixed(1)} kWh`}
          </p>
        </div>
      </header>

      {appliances.length === 0 ? (
        <div className="mt-6 flex h-40 items-center justify-center rounded-xl border border-white/10 bg-white/5">
          <p className="text-sm text-emerald-200">No hay datos históricos disponibles</p>
        </div>
      ) : (
        <div className={`mt-6 grid gap-4 ${appliances.length <= 3 ? 'grid-cols-1 sm:grid-cols-3' : appliances.length <= 5 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-7'}`}>
          {appliances.map((appliance, index) => {
            const heightPercentage = (appliance.monthlyKWh / maxConsumption) * 100;
            return (
              <div 
                key={`${appliance.name}-${index}`} 
                className="flex flex-col items-center gap-3 cursor-pointer hover:scale-105 transition-transform"
                onClick={() => navigate(`/appliance/${appliance.id}`)}
                title="Ver detalles del dispositivo"
              >
                <div className="flex h-40 w-14 items-end rounded-xl border border-white/10 bg-white/10 p-1">
                  <div
                    className="w-full rounded-lg bg-linear-to-t from-emerald-500 via-emerald-400 to-emerald-300"
                    style={{ height: `${heightPercentage}%` }}
                  />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">
                    {appliance.monthlyKWh.toFixed(1)}
                  </p>
                  <p className="text-xs text-emerald-100">{appliance.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
