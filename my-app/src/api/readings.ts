import api from './client';
import { Reading } from '../types/reading';

// Try a few possible endpoints to retrieve readings; backend may vary.
async function tryEndpoints<T = any>(endpoints: string[]) {
  for (const ep of endpoints) {
    try {
      const res = await api.get<any>(ep);
      if (res) return res;
    } catch (err) {
      // try next
    }
  }
  throw new Error('No endpoints available');
}

export async function getLatestReadingForDevice(deviceId: string | number): Promise<Reading | null> {
  const candidates = [
    `/api/v1/readings/latest/${deviceId}`,
    `/api/v1/readings/device/${deviceId}?limit=1000`,
    `/api/v1/readings/latest?deviceId=${deviceId}`,
    `/api/v1/readings?deviceId=${deviceId}`,
    `/api/v1/devices/${deviceId}/readings/latest`,
    `/api/v1/devices/${deviceId}/readings`,
  ];
  try {
    const res = await tryEndpoints(candidates);
    // Normalize common shapes
    if (Array.isArray(res)) return normalize(res[0]);
    if (res && res.latest) return normalize(res.latest);
    if (res && res.time) return normalize(res);
    if (res && Array.isArray(res.data) && res.data.length) return normalize(res.data[0]);
    return null;
  } catch (err) {
    console.warn('getLatestReadingForDevice failed', err);
    return null;
  }
}

export async function getReadingsForDevice(deviceId: string | number): Promise<Reading[]> {
  const candidates = [
    `/api/v1/readings/device/${deviceId}?limit=1000`,
    `/api/v1/readings?deviceId=${deviceId}`,
    `/api/v1/readings?device_id=${deviceId}`,
    `/api/v1/devices/${deviceId}/readings`,
  ];
  try {
    const res = await tryEndpoints(candidates);
    if (Array.isArray(res)) return res.map(normalize);
    if (res && Array.isArray(res.data)) return res.data.map(normalize);
    return [];
  } catch (err) {
    console.warn('getReadingsForDevice failed', err);
    return [];
  }
}

function normalize(r: any): Reading {
  const parseNum = (val: any) => {
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  };

  return {
    time: r.time ?? r.timestamp ?? r.recorded_at ?? new Date().toISOString(),
    deviceId: r.device_id ?? r.deviceId ?? r.deviceId,
    powerWatts: parseNum(r.power_watts ?? r.powerWatts),
    voltage: parseNum(r.voltage),
    currentAmps: parseNum(r.current_amps ?? r.currentAmps),
    energyKwh: parseNum(r.energy_kwh ?? r.energyKwh),
    frequency: parseNum(r.frequency),
    powerFactor: parseNum(r.power_factor ?? r.powerFactor),
  } as Reading;
}

export default { getLatestReadingForDevice, getReadingsForDevice };
