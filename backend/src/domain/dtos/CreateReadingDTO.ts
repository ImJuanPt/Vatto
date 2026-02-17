export interface CreateReadingDTO {
  deviceId: number;
  powerWatts: number;
  voltage?: number;
  current?: number;           // Nombre que envía Arduino
  currentAmps?: number;       // Alias para compatibilidad
  energy?: number;
  frequency?: number;
  powerFactor?: number;
  timestamp?: string;
}
