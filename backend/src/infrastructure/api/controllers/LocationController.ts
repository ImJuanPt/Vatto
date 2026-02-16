import { Request, Response } from "express";
import { ProcessLocationUseCase } from "../../../application/use-cases/processLocationUseCase";

export class LocationController {
  constructor(private ProcessLocationUseCase: ProcessLocationUseCase) {}

  list = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.id;
      const locations = await this.ProcessLocationUseCase.list(userId);
      res.status(200).json(locations);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  findById = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const location = await this.ProcessLocationUseCase.findById(Number(id));

      res.status(200).json(location);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  create = async (req: Request, res: Response) => {
    try {
      const locationData = req.body as any;
      const userId = req.user?.id;
      if (!userId || !locationData.name) {
        return res.status(400).json({ error: "Missing data" });
      }
      const dto = { userId, name: locationData.name, address: locationData.address };
      const newLocation = await this.ProcessLocationUseCase.create(dto as any);
      res.status(201).json(newLocation);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  edit = async (req: Request, res: Response) => {
    try {
      const locationData = req.body as any;
      const { id } = req.params;
      if (!locationData.name) return res.status(400).json({ error: 'Missing data' });
      const newLocation = await this.ProcessLocationUseCase.edit(locationData as any, Number(id));
      res.status(200).json(newLocation);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };

  delete = async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await this.ProcessLocationUseCase.delete(Number(id));
      
      if (result && typeof result === 'object' && 'error' in result) {
        return res.status(409).json(result);
      }
      
      res.status(200).json(result);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: "Internal Server Error" });
    }
  };
}
