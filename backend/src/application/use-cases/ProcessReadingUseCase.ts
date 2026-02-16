import { Reading } from "../../domain/entities/Reading";
import { IReadingRepository } from "../../domain/repositories/IReadingRepository";
import { IDeviceRepository } from "../../domain/repositories/IDeviceRepository";
import { INotificationService } from "../../domain/interfaces/INotificationService";
import { CreateReadingDTO } from "../../domain/dtos/CreateReadingDTO";

export class ProcessReadingUseCase {
  constructor(
    private readingRepo: IReadingRepository,
    private notifier: INotificationService,
    private deviceRepo: IDeviceRepository
  ) {}

  async execute(data: CreateReadingDTO): Promise<void> {
    const device = await this.deviceRepo.findById(data.deviceId);

    if (!device) {
      console.warn(`[ProcessReading] Dispositivo ID ${data.deviceId} no encontrado`);
      return; 
    }

    const readingDate = data.timestamp ? new Date(data.timestamp) : new Date();

    // Usar 'current' si viene del Arduino, sino 'currentAmps'
    const current = data.current || data.currentAmps || 0;

    const reading = new Reading(
      data.deviceId,
      data.powerWatts,
      data.voltage || 0,
      current,
      data.energy || 0,
      data.frequency || 0,
      data.powerFactor || 0,
      readingDate
    );

    await this.readingRepo.save(reading);

    if (reading.isSpike(device.maxWattsThreshold)) {
      await this.notifier.notifySpike(device.id, reading.powerWatts);
    }

    this.notifier.broadcastUpdate(device.id, reading);
  }
}
