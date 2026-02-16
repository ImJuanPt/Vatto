export interface DailyEnergyStats {
  id?: number | string;
  deviceId: number | string;
  date: string; // YYYY-MM-DD
  totalKwh?: number;
  peakWattage?: number;
  activeHours?: number;
  costEstimated?: number;
  diffFromYesterdayPercent?: number;
  diffFromAvgPercent?: number;
}

export default DailyEnergyStats;
