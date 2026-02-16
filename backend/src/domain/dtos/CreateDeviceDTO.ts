export interface CreateDeviceDTO {
  locationId: number;
  name: string;
  deviceType: string;
  maxWattsThreshold: number;
  macAddress?: string;
}
