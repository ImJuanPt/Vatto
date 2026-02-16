
import { Request, Response } from "express";
import { ProcessDeviceUseCase } from "../../../application/use-cases/ProcessDeviceUseCase";

export class DeviceController {
  constructor(private ProcessDeviceUseCase: ProcessDeviceUseCase) {}

  list = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const devices = await this.ProcessDeviceUseCase.list(userId);
      res.status(200).json(devices);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  findById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const device = await this.ProcessDeviceUseCase.findById(Number(id));

      res.status(201).json(device);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  getByMac = async (req: Request, res: Response) => {
    try {
      const { mac } = req.params;
      if (!mac) return res.status(400).json({ error: 'Missing mac' });
      const device = await this.ProcessDeviceUseCase.findByMac(String(mac));
      if (!device) return res.status(404).json({ error: 'Device not found' });
      return res.status(200).json(device);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const deviceData = req.body;

      if (!deviceData.locationId || !deviceData.name || !deviceData.deviceType) {
        return res.status(400).json({ error: "Missing data" });
      }

      const newDevice = await this.ProcessDeviceUseCase.create(deviceData);

      res.status(201).json(newDevice);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  edit = async (req: Request, res: Response) => {
    try {
      const deviceData = req.body;
      const { id } = req.params;

      if (deviceData.locationId && deviceData.name && deviceData.deviceType) {
        // Actualización completa
        const newDevice = await this.ProcessDeviceUseCase.edit(deviceData, Number(id));
        res.status(201).json(newDevice);
      } else if (deviceData.name) {
        // Actualización solo de nombre
        const newDevice = await this.ProcessDeviceUseCase.editName(Number(id), deviceData.name);
        res.status(200).json(newDevice);
      } else {
        return res.status(400).json({ error: "Missing required data" });
      }
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  delete = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const device = await this.ProcessDeviceUseCase.delete(Number(id));

      res.status(201).json(device);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  dailyUsage = async (req: Request, res: Response) => {
    try {
      const usage = await this.ProcessDeviceUseCase.getDailyUsage();
      res.status(200).json(usage);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  metrics = async (req: Request, res: Response) => {
    try {
      const [monthlyUsage, dailyHours] = await Promise.all([
        this.ProcessDeviceUseCase.getMonthlyUsage(),
        this.ProcessDeviceUseCase.getDailyHours()
      ]);
      
      if (!monthlyUsage || !dailyHours) {
        return res.status(200).json({});
      }

      const metricsMap: Record<number, any> = {};
      
      monthlyUsage.forEach((m: any) => {
        if (!metricsMap[m.device_id]) {
          metricsMap[m.device_id] = {};
        }
        metricsMap[m.device_id].monthlyKWh = m.kwh_30d || 0;
      });

      dailyHours.forEach((h: any) => {
        if (!metricsMap[h.device_id]) {
          metricsMap[h.device_id] = {};
        }
        metricsMap[h.device_id].usageHoursPerDay = h.hours_per_day || 0;
      });

      res.status(200).json(metricsMap);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  // POST /pair - Emparejar ESP32 usando código de vinculación
  pair = async (req: Request, res: Response) => {
    try {
      const { pairingCode, macAddress } = req.body;

      if (!pairingCode || !macAddress) {
        return res.status(400).json({ error: "Missing pairingCode or macAddress" });
      }

      // Buscar el código de vinculación en la tabla de devices pendientes
      // Esto se hace dentro del caso de uso
      const result = await this.ProcessDeviceUseCase.pairDevice(pairingCode, macAddress);

      if (!result) {
        return res.status(404).json({ error: "Invalid or expired pairing code" });
      }

      return res.status(200).json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  moveDevice = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { newLocationId } = req.body;

      if (!newLocationId) {
        return res.status(400).json({ error: "Missing newLocationId" });
      }

      const device = await this.ProcessDeviceUseCase.moveDevice(Number(id), Number(newLocationId));
      res.status(200).json(device);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };
}

