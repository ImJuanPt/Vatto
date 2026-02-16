export class Device {
  public monthlyKWh?: number = 0;
  public usageHoursPerDay?: number = 0;

  constructor(
    public readonly id: number,
    public readonly locationId: number,
    public readonly name: string,
    public readonly deviceType: string,
    public readonly maxWattsThreshold: number,
    public readonly macAddress: string,
    public readonly isActive: boolean
    , public readonly pairingCode?: string | null
  ) {}
}

