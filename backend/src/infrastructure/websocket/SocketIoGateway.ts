import { Server } from "socket.io";
import { INotificationService } from "../../domain/interfaces/INotificationService";

export class SocketIoGateway implements INotificationService {
  private io: Server;

  constructor(server: any) {
    this.io = new Server(server, {
      cors: { origin: "*" }
    });

    this.io.on("connection", (socket) => {
      console.log(`Cliente conectado: ${socket.id}`);
      
      socket.on("subscribe_device", (deviceId) => {
        socket.join(`device_${deviceId}`);
      });
    });
  }

  async notifySpike(deviceId: number, value: number): Promise<void> {
    this.io.to(`device_${deviceId}`).emit("alert", {
      type: "SPIKE",
      message: `¡Pico detectado! ${value}W`,
      timestamp: new Date()
    });
  }

  broadcastUpdate(deviceId: number, data: any): void {
    this.io.to(`device_${deviceId}`).emit("realtime_reading", data);
  }
}