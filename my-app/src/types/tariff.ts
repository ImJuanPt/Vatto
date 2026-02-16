export interface Tariff {
  id?: number | string;
  locationId: number | string;
  name?: string;
  currencyCode?: string;
  baseCost?: number;
  costPerKwh?: number;
  peakStartTime?: string; // HH:MM:SS
  peakEndTime?: string;
  peakCostMultiplier?: number;
}

export default Tariff;
