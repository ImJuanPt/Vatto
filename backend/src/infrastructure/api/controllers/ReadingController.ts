import { Request, Response } from "express";
import { IQueueService } from "../../../domain/interfaces/IQueueService";
import { IReadingRepository } from "../../../domain/repositories/IReadingRepository";
import { IDeviceRepository } from "../../../domain/repositories/IDeviceRepository";

export class ReadingController {
  constructor(
    private queueService: IQueueService, 
    private readingRepo: IReadingRepository,
    private deviceRepo: IDeviceRepository
  ) {}

  receiveReading = async (req: Request, res: Response) => {
    try {
      const readingData = req.body;

      // Permitir que powerWatts sea 0, solo no undefined/null
      if (!readingData.deviceId || readingData.powerWatts == null) {
        return res.status(400).json({ error: "Missing data" });
      }

      // Validar que el dispositivo exista antes de encolar
      const device = await this.deviceRepo.findById(readingData.deviceId);
      if (!device) {
        console.warn(`[ReadingController] Device ${readingData.deviceId} not found`);
        return res.status(404).json({ error: "Device not found" });
      }

      await this.queueService.addJob("readings_queue", readingData);

      return res.status(202).json({ status: "queued", message: "Lectura recibida" });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  // Obtener ultima lectura: GET /readings/latest/:deviceId
  getLatest = async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
      const list = await this.readingRepo.getLastReadings(Number(deviceId), 1);
      const latest = list && list.length ? list[0] : null;
      return res.status(200).json(latest);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  // Obtener historial de lecturas: GET /readings/device/:deviceId?limit=100
  getHistory = async (req: Request, res: Response) => {
    try {
      const { deviceId } = req.params;
      const limit = Number(req.query.limit || 100);
      if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });
      const list = await this.readingRepo.getLastReadings(Number(deviceId), limit);
      return res.status(200).json(list);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}
