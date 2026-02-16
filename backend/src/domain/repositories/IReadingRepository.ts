import { Reading } from "../entities/Reading";

export interface IReadingRepository {
  save(reading: Reading): Promise<void>;

  getLastReadings(deviceId: number, limit: number): Promise<Reading[]>;
}
