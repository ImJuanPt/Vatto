import { Location } from "../entities/Location";
import { CreateLocationDTO } from "../dtos/CreateLocationDTO";

export interface ILocationRepository {
  list(userId?: number): Promise<Location[]>;
  save(location: CreateLocationDTO): Promise<Location>;
  findById(id: number): Promise<Location | null>;
  edit(location: Location, id: number): Promise<Location>;
  delete(id: number): Promise<void>;
}
