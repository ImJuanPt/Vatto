export interface ConsumptionPoint {
  label: string;
  kWh: number;
}

export interface Appliance {
  id: string;
  name: string;
  category: "kitchen" | "climate" | "laundry" | "entertainment" | "home" | "other" | string;
  typicalWattage: number;
  monthlyKWh: number;
  usageHoursPerDay: number;
  lastUpdated: string;
  description: string;
  monthlyHistory: ConsumptionPoint[];
  weeklyUsage: ConsumptionPoint[];
  // optional metadata from backend
  _meta?: {
    locationId?: number | string;
    macAddress?: string;
    maxWattsThreshold?: number;
    isActive?: boolean;
    currentState?: string;
  };
}

export interface ApplianceInsights {
  totalConsumption: number;
  averageConsumption: number;
  topConsumers: Appliance[];
  highUsageThreshold: number;
}
