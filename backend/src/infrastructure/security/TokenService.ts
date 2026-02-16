import jwt from 'jsonwebtoken';
import { config } from '../../config/env';

export class TokenService {
  static generate(payload: any): string {
    return jwt.sign(payload, config.JWT_SECRET || 'secret_dev', { expiresIn: '24h' });
  }

  static verify(token: string): any {
    return jwt.verify(token, config.JWT_SECRET || 'secret_dev');
  }
}