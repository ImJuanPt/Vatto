import api from './client';
import { Location } from '../types/location';

export async function getLocations(): Promise<Location[]> {
  try {
    const res = await api.get<any>('/api/v1/locations');
    if (Array.isArray(res)) return res.map(normalize);
    if (res && Array.isArray(res.data)) return res.data.map(normalize);
    throw new Error('Invalid locations response');
  } catch (err) {
    console.warn('getLocations failed', err);
    return [];
  }
}

export async function getLocationById(id: string | number): Promise<Location | null> {
  try {
    const res = await api.get<any>(`/api/v1/locations/${id}`);
    if (!res) return null;
    return normalize(res);
  } catch (err) {
    console.warn('getLocationById failed', err);
    return null;
  }
}

export async function createLocation(name: string, address?: string, timezone?: string, userId?: number): Promise<Location | null> {
  try {
    const payload: any = { name };
    if (address) payload.address = address;
    if (timezone) payload.timezone = timezone;
    if (userId) payload.userId = userId;
    const res = await api.post<any>('/api/v1/locations', payload);
    return normalize(res);
  } catch (err) {
    console.warn('createLocation failed', err);
    return null;
  }
}

export async function deleteLocation(locationId: string | number): Promise<{ success: boolean; error?: string; deviceCount?: number }> {
  try {
    const res = await api.del<any>(`/api/v1/locations/${locationId}`);
    if (res && res.error) {
      return { success: false, error: res.message, deviceCount: res.deviceCount };
    }
    return { success: true };
  } catch (err: any) {
    console.warn('deleteLocation failed', err);
    return { success: false, error: String(err) };
  }
}

function normalize(raw: any): Location {
  return {
    id: raw.id ?? raw.location_id,
    userId: raw.user_id ?? raw.userId,
    name: raw.name,
    address: raw.address,
    timezone: raw.timezone,
    createdAt: raw.created_at ?? raw.createdAt,
  };
}

export default { getLocations, getLocationById };
