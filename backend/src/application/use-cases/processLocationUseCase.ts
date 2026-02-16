import { Location } from "../../domain/entities/Location";
import { CreateLocationDTO } from "../../domain/dtos/CreateLocationDTO";
import { ILocationRepository } from "../../domain/repositories/ILocationRepository";
import { INotificationService } from "../../domain/interfaces/INotificationService";

export class ProcessLocationUseCase {
  constructor(private locationRepo: ILocationRepository, private notifier: INotificationService) {}
  async list(userId?: number) {
    const locations = await this.locationRepo.list(userId);
    return locations;
  }

  async findById(id: number) {
    const location = await this.locationRepo.findById(id);
    return location;
  }

  async create(data: CreateLocationDTO) {
    const newLocation = await this.locationRepo.save(data);

    this.notifier.broadcastUpdate(newLocation.userId, {
      type: "INVALIDATE_QUERY",
      key: ["locations", newLocation.userId],
    });

    return newLocation;
  }

  async edit(data: Location, id: number) {
    const newLocation = await this.locationRepo.edit(data, id);
    return newLocation;
  }

  async delete(id: number) {
    // Validar si hay dispositivos en la ubicación
    const deviceCount = await (this.locationRepo as any).getDeviceCountInLocation(id);
    
    if (deviceCount > 0) {
      return {
        error: "DEVICES_EXIST",
        message: `No se puede eliminar esta ubicación. Hay ${deviceCount} dispositivo(s) registrado(s).`,
        deviceCount: deviceCount
      };
    }
    
    await this.locationRepo.delete(id);
    return { id, success: true };
  }
}
