export class Reading {
  constructor(
    public readonly deviceId: number,
    public readonly powerWatts: number,
    public readonly voltage: number,
    public readonly currentAmps: number,
    public readonly energyKwh: number,
    public readonly frequency: number,
    public readonly powerFactor: number,
    public readonly time: Date
  ) {}

  isSpike(threshold: number): boolean {
    return this.powerWatts > threshold;
  }

  isVoltageDrop(minVoltage: number): boolean {
    return this.voltage < minVoltage;
  }
}