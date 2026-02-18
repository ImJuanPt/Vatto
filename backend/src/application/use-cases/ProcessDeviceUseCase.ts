import { Device } from "../../domain/entities/Device";
import { CreateDeviceDTO } from "../../domain/dtos/CreateDeviceDTO";
import { IDeviceRepository } from "../../domain/repositories/IDeviceRepository";
import { INotificationService } from "../../domain/interfaces/INotificationService";

export class ProcessDeviceUseCase {
  constructor(
    private deviceRepo: IDeviceRepository,
    private notifier: INotificationService
  ) {}

  async list(userId?: number) {
    const devices = await this.deviceRepo.list(userId);
    
    // Enriquecer con métricas si los métodos existen
    try {
      const [monthlyUsage, dailyHours, typicalWattage, currentStates] = await Promise.all([
        typeof (this.deviceRepo as any).getMonthlyUsage === 'function'
          ? (this.deviceRepo as any).getMonthlyUsage()
          : Promise.resolve([]),
        typeof (this.deviceRepo as any).getDailyHours === 'function'
          ? (this.deviceRepo as any).getDailyHours()
          : Promise.resolve([]),
        typeof (this.deviceRepo as any).getTypicalWattageForAllDevices === 'function'
          ? (this.deviceRepo as any).getTypicalWattageForAllDevices()
          : Promise.resolve([]),
        typeof (this.deviceRepo as any).getCurrentStateForAllDevices === 'function'
          ? (this.deviceRepo as any).getCurrentStateForAllDevices()
          : Promise.resolve([])
      ]);

      const monthlyMap = new Map(monthlyUsage.map((m: any) => [m.device_id, m.kwh_30d]));
      const hoursMap = new Map(dailyHours.map((h: any) => [h.device_id, h.hours_per_day]));
      const wattageMap = new Map(typicalWattage.map((w: any) => [w.device_id, w.peak_watts]));
      const stateMap = new Map(currentStates.map((s: any) => [s.device_id, s.current_state]));

      const enrichedDevices = await Promise.all(devices.map(async (device: any) => {
        device.monthlyKWh = monthlyMap.get(device.id) || 0;
        device.usageHoursPerDay = hoursMap.get(device.id) || 0;
        
        // Actualizar maxWattsThreshold con el pico de los últimos 30 días (siempre, dinámicamente)
        const peakWatts = Number(wattageMap.get(device.id) || 0);
        device.maxWattsThreshold = peakWatts;
        
        // Actualizar current_state basado en consumo actual
        const currentState = stateMap.get(device.id) || 'off';
        device.currentState = currentState;
        
        // Actualizar en BD
        if (peakWatts >= 0) {
          try {
            await (this.deviceRepo as any).updateMaxWattsThreshold(device.id, peakWatts);
          } catch (err) {
            console.warn(`Failed to update maxWattsThreshold for device ${device.id}:`, err);
          }
        }
        
        // Actualizar estado en BD
        try {
          await (this.deviceRepo as any).updateCurrentState(device.id, currentState);
        } catch (err) {
          console.warn(`Failed to update currentState for device ${device.id}:`, err);
        }
        return device;
      }));
      return enrichedDevices;
    } catch (err) {
      console.warn('Failed to enrich devices with metrics:', err);
      return devices;
    }
  }

  async findById(id: number) {
    const device = await this.deviceRepo.findById(id);
    return device;
  }

  async findByMac(mac: string) {
    const device = await this.deviceRepo.findByMac(mac);
    return device;
  }

  async create(data: CreateDeviceDTO) {
    const newDevice = await this.deviceRepo.save(data);

    this.notifier.broadcastUpdate(newDevice.locationId, {
      type: "INVALIDATE_QUERY",
      key: ["devices", newDevice.locationId],
    });

    return newDevice;
  }

  async edit(data: CreateDeviceDTO, id: number) {
    const newDevice = await this.deviceRepo.edit(data, id);

    this.notifier.broadcastUpdate(newDevice.locationId, {
      type: "INVALIDATE_QUERY",
      key: ["devices", newDevice.locationId],
    });

    return newDevice;
  }

  async editName(id: number, newName: string) {
    if (typeof (this.deviceRepo as any).updateDeviceName === "function") {
      const newDevice = await (this.deviceRepo as any).updateDeviceName(id, newName);
      
      // Enriquecer con métricas dinámicas
      try {
        const [monthlyUsage, dailyHours, typicalWattage, currentStates] = await Promise.all([
          typeof (this.deviceRepo as any).getMonthlyUsage === 'function'
            ? (this.deviceRepo as any).getMonthlyUsage()
            : Promise.resolve([]),
          typeof (this.deviceRepo as any).getDailyHours === 'function'
            ? (this.deviceRepo as any).getDailyHours()
            : Promise.resolve([]),
          typeof (this.deviceRepo as any).getTypicalWattageForAllDevices === 'function'
            ? (this.deviceRepo as any).getTypicalWattageForAllDevices()
            : Promise.resolve([]),
          typeof (this.deviceRepo as any).getCurrentStateForAllDevices === 'function'
            ? (this.deviceRepo as any).getCurrentStateForAllDevices()
            : Promise.resolve([])
        ]);

        const monthlyMap = new Map(monthlyUsage.map((m: any) => [m.device_id, m.kwh_30d]));
        const hoursMap = new Map(dailyHours.map((h: any) => [h.device_id, h.hours_per_day]));
        const wattageMap = new Map(typicalWattage.map((w: any) => [w.device_id, w.peak_watts]));
        const stateMap = new Map(currentStates.map((s: any) => [s.device_id, s.current_state]));

        newDevice.monthlyKWh = monthlyMap.get(id) || 0;
        newDevice.usageHoursPerDay = hoursMap.get(id) || 0;
        
        const peakWatts = Number(wattageMap.get(id) || 0);
        newDevice.maxWattsThreshold = peakWatts;
        
        const currentState = stateMap.get(id) || 'off';
        newDevice.currentState = currentState;
        
        // Actualizar en BD
        if (peakWatts >= 0) {
          try {
            await (this.deviceRepo as any).updateMaxWattsThreshold(id, peakWatts);
          } catch (err) {
            console.warn(`Failed to update maxWattsThreshold for device ${id}:`, err);
          }
        }
        
        try {
          await (this.deviceRepo as any).updateCurrentState(id, currentState);
        } catch (err) {
          console.warn(`Failed to update currentState for device ${id}:`, err);
        }
      } catch (err) {
        console.warn('Failed to enrich device with metrics:', err);
      }
      
      this.notifier.broadcastUpdate(newDevice.locationId, {
        type: "INVALIDATE_QUERY",
        key: ["devices", newDevice.locationId],
      });

      return newDevice;
    }
    throw new Error("Not implemented");
  }

  async delete(id: number) {
    await this.deviceRepo.delete(id);
    return id;
  }

  async moveDevice(deviceId: number, newLocationId: number) {
    if (typeof (this.deviceRepo as any).moveDeviceToLocation === "function") {
      return await (this.deviceRepo as any).moveDeviceToLocation(deviceId, newLocationId);
    }
    throw new Error("Not implemented");
  }

  async getDailyUsage() {
    if (typeof (this.deviceRepo as any).getDailyUsage === "function") {
      return await (this.deviceRepo as any).getDailyUsage();
    }
    throw new Error("Not implemented");
  }

  async getMonthlyUsage() {
    if (typeof (this.deviceRepo as any).getMonthlyUsage === "function") {
      return await (this.deviceRepo as any).getMonthlyUsage();
    }
    throw new Error("Not implemented");
  }

  async getDailyHours() {
    if (typeof (this.deviceRepo as any).getDailyHours === "function") {
      return await (this.deviceRepo as any).getDailyHours();
    }
    throw new Error("Not implemented");
  }

  /**
   * Emparejar un ESP32 con su deviceId usando código de vinculación
   * @param pairingCode Código de 6 dígitos generado en la app
   * @param macAddress MAC address del ESP32
   * @returns { deviceId, pairingToken } o null si código inválido
   */
  async pairDevice(pairingCode: string, macAddress: string) {
    try {
      // Buscar el device pendiente por código de vinculación
      // El código se genera cuando el usuario crea un device en la app
      // y se almacena temporalmente (ej: 30 minutos de validez)
      
      let device = await (this.deviceRepo as any).findByPairingCode(pairingCode);
      
      // Si no se encuentra por pairing code, buscar por MAC address
      // (podría ser un dispositivo que ya se emparejó previamente)
      if (!device) {
        device = await (this.deviceRepo as any).findByMacAddress(macAddress);
        
        if (device) {
          console.log(`[Pairing] Device ${device.id} already paired with MAC ${macAddress}`);
          return {
            deviceId: device.id,
            message: "Device already paired"
          };
        }
        
        console.warn(`[Pairing] Invalid pairing code: ${pairingCode}`);
        return null;
      }

      // Actualizar el MAC address del device
      await (this.deviceRepo as any).updateMacAddress(device.id, macAddress);

      // Marcar como activo
      await (this.deviceRepo as any).setActive(device.id, true);

      console.log(`[Pairing] Device ${device.id} paired with MAC ${macAddress}`);

      return {
        deviceId: device.id,
        message: "Device paired successfully"
      };
    } catch (err) {
      console.error('[Pairing] Error:', err);
      return null;
    }
  }
}
