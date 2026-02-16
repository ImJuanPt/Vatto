export interface INotificationService {
  notifySpike(deviceId: number, value: number): Promise<void>;
  broadcastUpdate(deviceId: number, data: any): void;
}