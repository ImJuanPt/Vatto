import api from './client';
import { Appliance } from '../types/appliance';
import { appliancesMock } from '../api/mockAppliances';

// Extended mapping: prefer snake_case fields from backend

function deviceTypeToCategory(type?: string): string {
  if (!type) return 'other';
  const t = String(type).toLowerCase();
  // Kitchen devices
  if (['fridge', 'refrigerator', 'oven', 'stove', 'microwave', 'coffee_maker', 'dishwasher', 'blender', 'toaster'].includes(t)) return 'kitchen';
  // Climate devices
  if (['ac', 'heater', 'thermostat', 'aircon', 'climate', 'fan'].includes(t)) return 'climate';
  // Laundry devices
  if (['washer', 'dryer', 'washing_machine', 'laundry', 'iron'].includes(t)) return 'laundry';
  // Entertainment devices
  if (['tv', 'console', 'speaker', 'entertainment', 'media', 'projector'].includes(t)) return 'entertainment';
  // Home devices
  if (['lights', 'fridge_small', 'vacuum', 'printer', 'router', 'computer', 'laptop', 'monitor'].includes(t)) return 'home';
  return 'other';
}

// Map device types to Spanish labels
export function getDeviceTypeLabel(type?: string): string {
  if (!type) return 'Otro';
  const typeMap: Record<string, string> = {
    // Kitchen
    'refrigerator': 'Refrigerador',
    'fridge': 'Refrigerador',
    'oven': 'Horno',
    'microwave': 'Microondas',
    'dishwasher': 'Lavavajillas',
    'coffee_maker': 'Cafetera',
    'blender': 'Licuadora',
    'toaster': 'Tostadora',
    // Climate
    'ac': 'Aire Acondicionado',
    'heater': 'Calefactor',
    'fan': 'Ventilador',
    'thermostat': 'Termostato',
    // Laundry
    'washer': 'Lavadora',
    'dryer': 'Secadora',
    'iron': 'Plancha',
    // Entertainment
    'tv': 'Televisor',
    'speaker': 'Parlante',
    'console': 'Consola',
    'projector': 'Proyector',
    // Home/Other
    'lights': 'Luces',
    'fridge_small': 'Mini Refrigerador',
    'vacuum': 'Aspiradora',
    'printer': 'Impresora',
    'router': 'Router',
    'computer': 'Computadora',
    'laptop': 'Laptop',
    'monitor': 'Monitor',
    'other': 'Otro',
  };
  return typeMap[type.toLowerCase()] || type;
}

// Map categories to Spanish labels
export function getCategoryLabel(category?: string): string {
  if (!category) return 'Otro';
  const categoryMap: Record<string, string> = {
    'kitchen': 'Cocina',
    'climate': 'Clima',
    'laundry': 'Lavandería',
    'entertainment': 'Entretenimiento',
    'home': 'Hogar',
    'other': 'Otro',
  };
  return categoryMap[category.toLowerCase()] || category;
}

function mapDeviceToAppliance(d: any): Appliance {
  const monthlyKWh = Number(d.monthlyKWh ?? d.monthly_kwh ?? d.energy_kwh ?? 0);
  const usageHoursPerDay = Number(d.usageHoursPerDay ?? d.usage_hours_per_day ?? d.active_hours ?? 0);
  
  // Debug: log para verificar qué está llegando
  if (d.id) {
    console.log(`Device ${d.id}: monthlyKWh=${monthlyKWh}, usageHoursPerDay=${usageHoursPerDay}, raw:`, d);
  }
  
  return {
    id: String(d.id),
    name: d.name ?? d.device_name ?? `Dispositivo ${d.id}`,
    category: deviceTypeToCategory(d.device_type ?? (d.category as any) ?? d.deviceType),
    typicalWattage: d.typicalWattage ?? d.max_watts_threshold ?? d.maxWattsThreshold ?? 0,
    monthlyKWh,
    usageHoursPerDay,
    lastUpdated: d.lastUpdated ?? d.created_at ?? new Date().toISOString(),
    description: d.description ?? d.device_type ?? '',
    monthlyHistory: d.monthlyHistory ?? d.monthly_history ?? [],
    weeklyUsage: d.weeklyUsage ?? d.weekly_usage ?? [],
    // extra fields mapped into appliance's description or as properties if needed
    // we'll attach backend-specific fields under a `_meta` key to avoid breaking UI
    // @ts-ignore
    _meta: {
      locationId: d.location_id ?? d.locationId,
      macAddress: d.mac_address ?? d.macAddress,
      maxWattsThreshold: d.max_watts_threshold ?? d.maxWattsThreshold,
      isActive: d.is_active ?? d.isActive,
      currentState: d.current_state ?? d.currentState,
    },
  };
}

export async function getDevices(): Promise<Appliance[]> {
  try {
    const devices = await api.get<any>('/api/v1/devices');
    // Accept either an array or a single device object (backend may return wrong shape)
    if (Array.isArray(devices)) return devices.map(mapDeviceToAppliance);
    if (devices && typeof devices === 'object' && devices.id !== undefined) {
      return [mapDeviceToAppliance(devices)];
    }
    // Support wrapped responses like { data: [...] }
    if (devices && Array.isArray((devices as any).data)) {
      return (devices as any).data.map(mapDeviceToAppliance);
    }
    throw new Error('Invalid devices response');
  } catch (err) {
    console.warn('getDevices failed, using mock fallback', err);
    return appliancesMock;
  }
}

export async function getDeviceById(id: string): Promise<Appliance | null> {
  try {
    const d = await api.get<any>(`/api/v1/devices/${id}`);
    if (!d) return null;
    return mapDeviceToAppliance(d);
  } catch (err) {
    console.warn('getDeviceById failed, using mock fallback', err);
    const fallback = appliancesMock.find((a) => a.id === id) ?? null;
    return fallback;
  }
}

export async function findDeviceByMac(mac: string): Promise<Appliance | null> {
  try {
    const d = await api.get<any>(`/api/v1/devices/by-mac/${encodeURIComponent(mac)}`);
    if (!d) return null;
    return mapDeviceToAppliance(d);
  } catch (err) {
    console.warn('findDeviceByMac failed', err);
    return null;
  }
}

export async function updateDevice(id: string | number, payload: Partial<any>): Promise<Appliance | null> {
  try {
    const res = await api.put<any>(`/api/v1/devices/${id}`, payload);
    if (!res) return null;
    return mapDeviceToAppliance(res);
  } catch (err) {
    console.warn('updateDevice failed', err);
    return null;
  }
}

export async function moveDevice(deviceId: string | number, newLocationId: string | number): Promise<Appliance | null> {
  try {
    const res = await api.post<any>(`/api/v1/devices/${deviceId}/move`, { newLocationId });
    if (!res) return null;
    return mapDeviceToAppliance(res);
  } catch (err) {
    console.warn('moveDevice failed', err);
    return null;
  }
}

export async function deleteDevice(deviceId: string | number): Promise<boolean> {
  try {
    await api.del<any>(`/api/v1/devices/${deviceId}`);
    return true;
  } catch (err) {
    console.warn('deleteDevice failed', err);
    return false;
  }
}

export async function renameDevice(deviceId: string | number, newName: string): Promise<Appliance | null> {
  try {
    const res = await api.put<any>(`/api/v1/devices/${deviceId}`, { name: newName });
    if (!res) return null;
    return mapDeviceToAppliance(res);
  } catch (err) {
    console.warn('renameDevice failed', err);
    return null;
  }
}

export default { getDevices, getDeviceById, findDeviceByMac, updateDevice, moveDevice, deleteDevice, renameDevice };
