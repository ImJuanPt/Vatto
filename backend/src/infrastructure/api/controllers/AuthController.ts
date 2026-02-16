import { Request, Response } from 'express';
import { ProcessAuthUseCase } from '../../../application/use-cases/ProcessAuthUseCase';

export class AuthController {
  constructor(private authUseCase: ProcessAuthUseCase) {}

  register = async (req: Request, res: Response) => {
    try {
      const result = await this.authUseCase.register(req.body);
      res.status(201).json(result);
    } catch (error: any) {
      if (error.message === 'El usuario ya existe') {
        return res.status(409).json({ error: error.message });
      }
      res.status(500).json({ error: 'Error interno' });
    }
  };

  login = async (req: Request, res: Response) => {
    try {
      const result = await this.authUseCase.login(req.body);
      res.json(result);
    } catch (error) {
      res.status(401).json({ error: 'Credenciales inválidas' });
    }
  };
}