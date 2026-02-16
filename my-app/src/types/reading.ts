export interface Reading {
  time: string; // ISO timestamp
  deviceId: number | string;
  powerWatts?: number;
  voltage?: number;
  currentAmps?: number;
  energyKwh?: number;
  frequency?: number;
  powerFactor?: number;
}

export default Reading;
