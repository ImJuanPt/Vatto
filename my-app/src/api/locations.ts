import api from './client';
import { Location } from '../types/location';

export async function getLocations(): Promise<Location[]> {
  try {
    console.log('[getLocations] Fetching locations...');
    const res = await api.get<any>('/v1/locations');
    console.log('[getLocations] Raw response:', res);
    if (Array.isArray(res)) {
      console.log('[getLocations] Found', res.length, 'locations:', res);
      return res.map(normalize);
    }
    if (res && Array.isArray(res.data)) {
      console.log('[getLocations] Found', res.data.length, 'locations in .data:', res.data);
      return res.data.map(normalize);
    }
    throw new Error('Invalid locations response');
  } catch (err) {
    console.error('[getLocations] Error:', err);
    return [];
  }
}

export async function getLocationById(id: string | number): Promise<Location | null> {
  try {
    const res = await api.get<any>(`/v1/locations/${id}`);
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
    console.log('[createLocation] Sending payload:', payload);
    const res = await api.post<any>('/v1/locations', payload);
    console.log('[createLocation] Response:', res);
    return normalize(res);
  } catch (err: any) {
    console.error('[createLocation] Error:', err);
    console.error('[createLocation] Error response:', err.response);
    console.error('[createLocation] Error status:', err.response?.status);
    console.error('[createLocation] Error data:', err.response?.data);
    throw err; // Re-throw para que el componente pueda manejar el error
  }
}

export async function deleteLocation(locationId: string | number): Promise<{ success: boolean; error?: string; deviceCount?: number }> {
  try {
    const res = await api.del<any>(`/v1/locations/${locationId}`);
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
