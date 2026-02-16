import { Device } from "../entities/Device";
import { CreateDeviceDTO } from "../dtos/CreateDeviceDTO";

export interface IDeviceRepository {
  list(userId?: number): Promise<Device[]>;
  findByMac(mac: string): Promise<Device | null>;
  save(device: CreateDeviceDTO): Promise<Device>;
  findById(id: number): Promise<Device | null>;
  edit(device: CreateDeviceDTO, id: number): Promise<Device>;
  delete(id: number): Promise<void>;
}
