import { Reading } from "../types/reading";

interface CurrentReadingsPanelProps {
  reading: Reading | null;
  isLoading?: boolean;
}

function safeParseNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

export function CurrentReadingsPanel({ reading, isLoading = false }: CurrentReadingsPanelProps) {
  if (isLoading) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-semibold text-emerald-100 mb-4">Lectura en tiempo real</h3>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-white/10 rounded w-1/2"></div>
          <div className="h-4 bg-white/10 rounded w-2/3"></div>
        </div>
      </section>
    );
  }

  if (!reading) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/5 p-6">
        <h3 className="text-sm font-semibold text-emerald-100 mb-4">Lectura en tiempo real</h3>
        <p className="text-xs text-emerald-200">Sin lecturas disponibles</p>
      </section>
    );
  }

  const readingTime = new Date(reading.time);
  const powerWatts = safeParseNumber(reading.powerWatts);
  const voltage = safeParseNumber(reading.voltage);
  const currentAmps = safeParseNumber(reading.currentAmps);
  const frequency = safeParseNumber(reading.frequency);
  const powerFactor = safeParseNumber(reading.powerFactor);
  const energyKwh = safeParseNumber(reading.energyKwh);

  return (
    <section className="rounded-xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-sm font-semibold text-emerald-100">Lectura en tiempo real</h3>
        <span className="text-xs text-emerald-300">
          {readingTime.toLocaleTimeString()}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {/* Potencia */}
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Potencia</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {powerWatts !== null ? Math.round(powerWatts) : '-'}
          </p>
          <p className="text-xs text-emerald-300">Watts</p>
        </div>

        {/* Voltaje */}
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Voltaje</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {voltage !== null ? voltage.toFixed(1) : '-'}
          </p>
          <p className="text-xs text-emerald-300">V</p>
        </div>

        {/* Corriente */}
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Corriente</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {currentAmps !== null ? currentAmps.toFixed(2) : '-'}
          </p>
          <p className="text-xs text-emerald-300">A</p>
        </div>

        {/* Frecuencia */}
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Frecuencia</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {frequency !== null && frequency > 0 ? frequency.toFixed(1) : '-'}
          </p>
          <p className="text-xs text-emerald-300">Hz</p>
        </div>

        {/* Factor de potencia */}
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Factor</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {powerFactor !== null && powerFactor > 0 ? powerFactor.toFixed(2) : '-'}
          </p>
          <p className="text-xs text-emerald-300">PF</p>
        </div>

        {/* Energía acumulada */}
        <div className="rounded-lg bg-white/5 p-4 border border-white/10">
          <p className="text-xs text-emerald-200 uppercase tracking-wide">Energía</p>
          <p className="mt-2 text-2xl font-bold text-white">
            {energyKwh !== null ? energyKwh.toFixed(3) : '-'}
          </p>
          <p className="text-xs text-emerald-300">kWh</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-emerald-400">
        Actualizado: {readingTime.toLocaleString()}
      </p>
    </section>
  );
}
