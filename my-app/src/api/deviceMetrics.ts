import api from './client';

/**
 * Obtiene métricas de consumo mensual para todos los dispositivos
 */
export async function getDeviceMetrics(): Promise<Record<number, { monthlyKWh: number; usageHoursPerDay: number }>> {
  try {
    const metrics = await api.get<any>('/v1/devices/metrics');
    if (!metrics || typeof metrics !== 'object') {
      console.warn('Invalid metrics response');
      return {};
    }
    return metrics;
  } catch (err) {
    console.warn('Failed to fetch device metrics:', err);
    return {};
  }
}

/**
 * Obtiene el uso diario (últimas 24h) para todos los dispositivos en kWh
 */
export async function getDailyUsage(): Promise<Record<number, number>> {
  try {
    const usage = await api.get<any>('/v1/devices/daily-usage');
    if (!Array.isArray(usage)) {
      console.warn('Invalid daily usage response');
      return {};
    }
    return Object.fromEntries(usage.map((u: any) => [u.device_id, u.kwh_24h || 0]));
  } catch (err) {
    console.warn('Failed to fetch daily usage:', err);
    return {};
  }
}
