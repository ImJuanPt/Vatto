import { Appliance, ApplianceInsights } from "../types/appliance";

export function calculateInsights(
  appliances: Appliance[],
  highUsageThreshold: number
): ApplianceInsights & { efficiencyScore: number } {
  if (!appliances.length) {
    return {
      totalConsumption: 0,
      averageConsumption: 0,
      topConsumers: [],
      highUsageThreshold,
      efficiencyScore: 100,
    };
  }

  const totalConsumption = appliances.reduce((sum, appliance) => sum + (appliance.monthlyKWh ?? 0), 0);
  const averageConsumption = appliances.length ? totalConsumption / appliances.length : 0;

  const topConsumers = [...appliances]
    .sort((a, b) => b.monthlyKWh - a.monthlyKWh)
    .slice(0, 3);

  // Compute efficiency only for appliances that have a valid monthlyKWh value
  const evaluable = appliances.filter((appliance) => typeof appliance.monthlyKWh === 'number');
  const appliancesWithinThreshold = evaluable.filter(
    (appliance) => (appliance.monthlyKWh ?? Infinity) <= highUsageThreshold
  ).length;

  const efficiencyScore = evaluable.length
    ? Math.round((appliancesWithinThreshold / evaluable.length) * 100)
    : 0;

  return {
    totalConsumption,
    averageConsumption,
    topConsumers,
    highUsageThreshold,
    efficiencyScore,
  };
}
