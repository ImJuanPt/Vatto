import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { RegisterUserDTO, LoginDTO } from "../../domain/dtos/AuthDTOs";
import { PasswordService } from "../../infrastructure/security/PasswordService";
import { TokenService } from "../../infrastructure/security/TokenService";
import { User } from "../../domain/entities/User";

export class ProcessAuthUseCase {
  constructor(private userRepo: IUserRepository) {}

  async register(data: RegisterUserDTO) {
    const existingUser = await this.userRepo.findByEmail(data.email);
    if (existingUser) {
      throw new Error('El usuario ya existe');
    }

    const hashedPassword = await PasswordService.hash(data.password);

    const newUser = new User(0, data.email, data.fullName, hashedPassword);

    const savedUser = await this.userRepo.save(newUser);

    // Generar token automáticamente después del registro (auto-login)
    const token = TokenService.generate({ id: savedUser.id, email: savedUser.email });

    return {
      token,
      user: savedUser.toPublicProfile()
    };
  }

  async login(data: LoginDTO) {
    const user = await this.userRepo.findByEmail(data.email);
    if (!user) {
      throw new Error('Credenciales inválidas');
    }

    const isValid = await PasswordService.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new Error('Credenciales inválidas');
    }

    const token = TokenService.generate({ id: user.id, email: user.email });

    return {
      token,
      user: user.toPublicProfile()
    };
  }
}