import { useMemo, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Appliance, ConsumptionPoint } from "../types/appliance";
import { Navbar } from "../components/NavBar";
import { User } from "../types/user";
import { ConsumptionChart } from "../components/ConsumptionChart";
import { RecommendationsPanel } from "../components/RecommendationsPanel";
import { CurrentReadingsPanel } from "../components/CurrentReadingsPanel";
import { api } from "../api/client";
import { applianceHighUsageThreshold } from "../config/constants";
import { subscribeToDevice } from "../api/socket";
import { getLatestReadingForDevice, getReadingsForDevice } from "../api/readings";
import { Reading } from "../types/reading";
import { DailyEnergyStats } from "../types/dailyStats";
import { moveDevice, deleteDevice, getDevices, renameDevice } from "../api/devices";
import { getLocations } from "../api/locations";
import { Location } from "../types/location";

interface ApplianceDetailPageProps {
  user: User;
  onLogout?: () => void;
}

export function ApplianceDetailPage({ user, onLogout }: ApplianceDetailPageProps) {
  const { applianceId } = useParams<{ applianceId: string }>();
  const navigate = useNavigate();
  const [appliance, setAppliance] = useState<Appliance | null>(null);
  const [loading, setLoading] = useState(false);
  const [latestReading, setLatestReading] = useState<Reading | null>(null);
  const [dailyStats, setDailyStats] = useState<DailyEnergyStats | null>(null);
  const [monthlyPoints, setMonthlyPoints] = useState<ConsumptionPoint[]>([]);
  const [weeklyPoints, setWeeklyPoints] = useState<ConsumptionPoint[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const locs = await getLocations();
        setLocations(locs);
      } catch (err) {
        console.warn('Failed to load locations', err);
      }
    })();
  }, []);

  useEffect(() => {
    if (!applianceId) return;
    setLoading(true);
    (async () => {
      try {
        const devicesModule = await import('../api/devices');
        const metricsModule = await import('../api/deviceMetrics');
        
        const device = await devicesModule.getDeviceById(applianceId);
        if (!device) {
          setAppliance(null);
          return;
        }

        // Enriquecer con métricas si monthlyKWh o usageHoursPerDay están en 0
        if (device.monthlyKWh === 0 || device.usageHoursPerDay === 0) {
          try {
            const metrics = await metricsModule.getDeviceMetrics();
            const deviceNum = Number(device.id);
            if (metrics && metrics[deviceNum]) {
              device.monthlyKWh = metrics[deviceNum].monthlyKWh || device.monthlyKWh;
              device.usageHoursPerDay = metrics[deviceNum].usageHoursPerDay || device.usageHoursPerDay;
              console.log(`[ApplianceDetailPage] Enriched ${device.name} with metrics: monthlyKWh=${device.monthlyKWh}, usageHoursPerDay=${device.usageHoursPerDay}`);
            }
          } catch (err) {
            console.warn('Failed to load metrics for device', err);
          }
        } else {
          console.log(`[ApplianceDetailPage] Using backend data for ${device.name}: monthlyKWh=${device.monthlyKWh}, usageHoursPerDay=${device.usageHoursPerDay}`);
        }

        setAppliance(device as any);
      } catch (err) {
        console.error('Failed to load device', err);
        setAppliance(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [applianceId]);

  useEffect(() => {
    if (!applianceId) return;
    // Fetch latest reading and history to compute daily stats
    let mounted = true;
    (async () => {
      try {
        const latest = await getLatestReadingForDevice(applianceId);
        const history = await getReadingsForDevice(applianceId);
        console.log(`[ApplianceDetailPage] Loaded ${history.length} readings for device ${applianceId}`);
        if (history.length > 0) {
          console.log('[ApplianceDetailPage] First reading:', history[0]);
          console.log('[ApplianceDetailPage] Last reading:', history[history.length - 1]);
        }
        if (!mounted) return;
        setLatestReading(latest);
        const stats = computeDailyStats(history, applianceId);
        setDailyStats(stats);
        const monthly = computeMonthlyPoints(history);
        const weekly = computeWeeklyPoints(history);
        setMonthlyPoints(monthly);
        setWeeklyPoints(weekly);
      } catch (err) {
        console.warn('Failed to fetch readings', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [applianceId]);

  function computeDailyStats(readings: Reading[], deviceId: string | number): DailyEnergyStats {
    const today = new Date().toISOString().slice(0, 10);
    const todays = readings
      .map((r) => ({ ...r, time: r.time }))
      .filter((r) => r.time && r.time.slice(0, 10) === today)
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

    let totalKwh = 0;
    let peakWattage = 0;
    let activeSeconds = 0;

    for (let i = 0; i < todays.length; i++) {
      const cur = todays[i];
      const p = cur.powerWatts ?? 0;
      if (p > peakWattage) peakWattage = p;
      if (i < todays.length - 1) {
        const next = todays[i + 1];
        const dt = (new Date(next.time).getTime() - new Date(cur.time).getTime()) / 1000; // seconds
        if (dt > 0) {
          // trapezoid integration for energy (kWh)
          const pNext = next.powerWatts ?? p;
          const avgW = (p + pNext) / 2;
          totalKwh += (avgW * (dt / 3600)) / 1000;
          if (avgW > 1) activeSeconds += dt;
        }
      }
    }

    // If we only have one reading, try to use energyKwh directly
    if (todays.length === 1 && todays[0].energyKwh) {
      totalKwh = todays[0].energyKwh as number;
    }

    const activeHours = Math.round((activeSeconds / 3600) * 100) / 100;

    return {
      deviceId,
      date: today,
      totalKwh: Math.round(totalKwh * 100) / 100,
      peakWattage: Math.round(peakWattage),
      activeHours,
    };
  }

  function computeMonthlyPoints(readings: Reading[]): ConsumptionPoint[] {
    if (!readings || readings.length === 0) {
      console.log('[ApplianceDetailPage] No readings for monthly points');
      return [];
    }
    
    console.log(`[ApplianceDetailPage] Computing monthly points from ${readings.length} readings`);
    
    // Filtrar solo lecturas de los últimos 12 meses (más generoso)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const cutoff = twelveMonthsAgo.getTime();
    
    const filtered = readings.filter((r) => {
      const timestamp = new Date(r.time).getTime();
      return !isNaN(timestamp) && timestamp >= cutoff;
    });
    
    console.log(`[ApplianceDetailPage] After date filter (12 months): ${filtered.length} readings`);
    
    if (filtered.length === 0) {
      console.warn('[ApplianceDetailPage] No readings in last 12 months, using all available data');
      // Si no hay datos en los últimos 12 meses, usar todos los datos disponibles
      filtered.push(...readings);
    }
    
    const sorted = filtered.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    if (sorted.length > 0) {
      console.log(`[ApplianceDetailPage] Monthly calculation range: ${sorted[0].time} to ${sorted[sorted.length - 1].time}`);
    }
    
    // Agrupar por mes (YYYY-MM) calculando energía desde potencia
    const groups: Record<string, number> = {};
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const key = (cur.time || '').slice(0, 7); // YYYY-MM
      
      const curTime = new Date(cur.time).getTime();
      const nextTime = new Date(next.time).getTime();
      const dt = (nextTime - curTime) / 1000; // segundos
      
      // Considerar intervalos hasta 24 horas (más permisivo)
      if (dt > 0 && dt < 86400) {
        const p = cur.powerWatts ?? 0;
        const pNext = next.powerWatts ?? p;
        const avgW = (p + pNext) / 2;
        const incrementKwh = (avgW * (dt / 3600)) / 1000;
        groups[key] = (groups[key] || 0) + incrementKwh;
      }
    }

    console.log('[ApplianceDetailPage] Monthly groups:', groups);

    // Tomar todos los meses disponibles, máximo 6
    const keys = Object.keys(groups).sort().slice(-6);
    const result = keys.map((k) => ({ label: k, kWh: Math.round((groups[k] || 0) * 100) / 100 }));
    
    console.log('[ApplianceDetailPage] Monthly points:', result);
    return result;
  }

  function computeWeeklyPoints(readings: Reading[]): ConsumptionPoint[] {
    if (!readings || readings.length === 0) {
      console.log('[ApplianceDetailPage] No readings for weekly points');
      return [];
    }
    
    console.log(`[ApplianceDetailPage] Computing weekly points from ${readings.length} readings`);
    
    // Filtrar solo lecturas de los últimos 30 días (más generoso)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const cutoff = thirtyDaysAgo.getTime();
    
    const filtered = readings.filter((r) => {
      const timestamp = new Date(r.time).getTime();
      return !isNaN(timestamp) && timestamp >= cutoff;
    });
    
    console.log(`[ApplianceDetailPage] After date filter (30 days): ${filtered.length} readings`);
    
    if (filtered.length === 0) {
      console.warn('[ApplianceDetailPage] No readings in last 30 days, using all available data');
      // Si no hay datos en los últimos 30 días, usar todos los datos disponibles
      filtered.push(...readings);
    }
    
    const sorted = filtered.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    // Agrupar por día (YYYY-MM-DD) calculando energía desde potencia
    const byDay: Record<string, number> = {};
    
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const next = sorted[i + 1];
      const day = (cur.time || '').slice(0, 10); // YYYY-MM-DD
      
      const curTime = new Date(cur.time).getTime();
      const nextTime = new Date(next.time).getTime();
      const dt = (nextTime - curTime) / 1000; // segundos
      
      // Considerar intervalos hasta 24 horas (más permisivo)
      if (dt > 0 && dt < 86400) {
        const p = cur.powerWatts ?? 0;
        const pNext = next.powerWatts ?? p;
        const avgW = (p + pNext) / 2;
        const incrementKwh = (avgW * (dt / 3600)) / 1000;
        byDay[day] = (byDay[day] || 0) + incrementKwh;
      }
    }

    console.log('[ApplianceDetailPage] Daily groups:', byDay);

    // Tomar últimos 7 días que tengan datos, asegurando que no haya duplicados
    const days = Object.keys(byDay).sort().slice(-7);
    
    // Validar que no haya duplicados
    const uniqueDays = [...new Set(days)];
    if (uniqueDays.length !== days.length) {
      console.warn('[ApplianceDetailPage] Found duplicate days, filtering...', days, uniqueDays);
    }
    
    const result = uniqueDays.map((d) => ({ label: d, kWh: Math.round((byDay[d] || 0) * 100) / 100 }));
    
    console.log('[ApplianceDetailPage] Weekly points:', result);
    return result;
  }

  const handleMoveDevice = async () => {
    if (!appliance || !selectedLocationId) return;
    
    try {
      await moveDevice(appliance.id, selectedLocationId);
      setShowMoveDialog(false);
      setSelectedLocationId(null);
      navigate('/gestion');
    } catch (err) {
      console.error('Failed to move device', err);
      alert('Error al mover el dispositivo');
    }
  };

  const handleDeleteDevice = async () => {
    if (!appliance) return;
    
    setIsDeleting(true);
    try {
      const success = await deleteDevice(appliance.id);
      if (success) {
        setShowDeleteConfirm(false);
        navigate('/gestion');
      } else {
        alert('Error al eliminar el dispositivo');
      }
    } catch (err) {
      console.error('Failed to delete device', err);
      alert('Error al eliminar el dispositivo');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRenameDevice = async () => {
    if (!appliance || !newName.trim()) return;
    
    setIsRenaming(true);
    try {
      const updated = await renameDevice(appliance.id, newName.trim());
      if (updated) {
        setAppliance(updated);
        setShowRenameDialog(false);
        setNewName('');
      } else {
        alert('Error al cambiar el nombre');
      }
    } catch (err) {
      console.error('Failed to rename device', err);
      alert('Error al cambiar el nombre');
    } finally {
      setIsRenaming(false);
    }
  };

  useEffect(() => {
    if (!applianceId) return;
    const unsub = subscribeToDevice(applianceId, {
      onAlert: (data) => {
        console.info('Socket alert', data);
        // could show a UI toast — for now we console.log and update description
      },
      onReading: (reading) => {
        console.info('Realtime reading', reading);
        // Solo actualizar la última lectura, NO sobreescribir monthlyKWh
        setLatestReading(reading);
      },
    });
    return () => unsub();
  }, [applianceId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-6 px-4 py-20 text-center">
          <p className="text-lg font-semibold text-white">Cargando dispositivo...</p>
        </div>
      </main>
    );
  }

  if (!appliance) {
    return (
      <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-center gap-6 px-4 py-20 text-center">
          <p className="text-lg font-semibold text-white">No encontramos el aparato solicitado.</p>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-200 hover:bg-emerald-400"
          >
            Volver
          </button>
        </div>
      </main>
    );
  }

  const monthlyData = monthlyPoints.length > 0 
    ? monthlyPoints.map((point) => ({ ...appliance, monthlyKWh: point.kWh, name: point.label }))
    : [];
  const weeklyData = weeklyPoints.length > 0
    ? weeklyPoints.map((point) => ({ ...appliance, monthlyKWh: point.kWh, name: point.label }))
    : [];

  console.log('[ApplianceDetailPage] Rendering charts - Monthly data points:', monthlyData.length, 'Weekly data points:', weeklyData.length);

  return (
    <main className="min-h-screen bg-linear-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      

      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-16 pt-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex w-fit items-center rounded-full border border-emerald-300/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100 transition-all duration-200 hover:bg-emerald-500/20"
          >
            ← Volver a la gestión
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setNewName(appliance?.name || '');
                setShowRenameDialog(true);
              }}
              className="inline-flex items-center rounded-full border border-purple-300/40 bg-purple-500/10 px-4 py-2 text-sm font-medium text-purple-100 transition-all duration-200 hover:bg-purple-500/20"
            >
              Cambiar nombre
            </button>
            <button
              onClick={() => setShowMoveDialog(true)}
              className="inline-flex items-center rounded-full border border-blue-300/40 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-100 transition-all duration-200 hover:bg-blue-500/20"
            >
              Mover a otra ubicación
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="inline-flex items-center rounded-full border border-red-300/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-100 transition-all duration-200 hover:bg-red-500/20"
            >
              Eliminar dispositivo
            </button>
          </div>
        </div>

        <header className="rounded-3xl border border-white/10 bg-white/10 p-6 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/60 bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-200">
                {appliance.category}
              </span>
              <h1 className="mt-4 text-3xl font-semibold text-white sm:text-4xl">
                {appliance.name}
              </h1>
            </div>
            <div className="text-right text-emerald-100">
              <p className="text-sm">Consumo últimos 30 días</p>
              <p className="text-3xl font-semibold text-white">
                {appliance.monthlyKWh.toFixed(1)} kWh
              </p>
              <p className="mt-1 text-xs text-emerald-200">Rolling 30 días desde hoy</p>
              <p className="mt-1 text-xs">Actualizado {new Date(appliance.lastUpdated).toLocaleString()}</p>
              {dailyStats && (
                <p className="mt-1 text-xs">Hoy: {Number(dailyStats.totalKwh ?? 0).toFixed(2)} kWh · Pico {Math.round(dailyStats.peakWattage ?? 0)} W</p>
              )}
            </div>
          </div>
          <p className="mt-4 text-sm text-emerald-100">{appliance.description}</p>
        </header>

        <CurrentReadingsPanel reading={latestReading} />

        <section className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ConsumptionChart 
            appliances={monthlyData} 
            title="Historial mensual"
            subtitle="Consumo por mes calendario (ej: Dic 2025, Ene 2026)"
          />

          <ConsumptionChart 
            appliances={weeklyData} 
            title="Comportamiento semanal"
            subtitle="Energía consumida por día en la última semana"
          />
        </section>

        <RecommendationsPanel
          appliances={[appliance]}
          highUsageThreshold={applianceHighUsageThreshold}
        />

        {/* Rename Device Dialog */}
        {showRenameDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Cambiar nombre del dispositivo
              </h3>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nuevo nombre"
                className="w-full mb-6 rounded px-3 py-2 bg-slate-700 text-white border border-slate-600 focus:outline-none focus:border-purple-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameDevice();
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowRenameDialog(false);
                    setNewName('');
                  }}
                  disabled={isRenaming}
                  className="px-4 py-2 rounded bg-white/5 text-white hover:bg-white/10 transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRenameDevice}
                  disabled={isRenaming || !newName.trim()}
                  className="px-4 py-2 rounded bg-purple-500/20 text-purple-100 hover:bg-purple-500/30 transition disabled:opacity-50"
                >
                  {isRenaming ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Move Device Dialog */}
        {showMoveDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Mover dispositivo a otra ubicación
              </h3>
              <select
                value={selectedLocationId || ''}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="w-full mb-6 rounded px-3 py-2 text-black bg-white"
              >
                <option value="">Selecciona una ubicación</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={String(loc.id)}>
                    {loc.name} {loc.address && `- ${loc.address}`}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowMoveDialog(false);
                    setSelectedLocationId(null);
                  }}
                  className="px-4 py-2 rounded bg-white/5 text-white hover:bg-white/10 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleMoveDevice}
                  disabled={!selectedLocationId}
                  className="px-4 py-2 rounded bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 transition disabled:opacity-50"
                >
                  Mover
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Device Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-sm rounded-xl bg-slate-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-4">
                Eliminar dispositivo
              </h3>
              <p className="text-sm text-red-100 mb-6">
                ¿Estás seguro de que quieres eliminar "{appliance?.name}"? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded bg-white/5 text-white hover:bg-white/10 transition disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleDeleteDevice}
                  disabled={isDeleting}
                  className="px-4 py-2 rounded bg-red-500/20 text-red-100 hover:bg-red-500/30 transition disabled:opacity-50"
                >
                  {isDeleting ? 'Eliminando...' : 'Eliminar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
