export class User {
  constructor(
    public readonly id: number,
    public readonly email: string,
    public readonly fullName: string,
    public readonly passwordHash: string
  ) {}

  toPublicProfile() {
    return {
      id: this.id,
      email: this.email,
      fullName: this.fullName,
    };
  }
}
