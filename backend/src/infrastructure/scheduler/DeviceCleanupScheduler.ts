import { PostgresDeviceRepository } from "../database/PostgresDeviceRepo";

/**
 * Limpia periódicamente dispositivos que no completaron el pairing
 * Se ejecuta cada 10 minutos
 */
export class DeviceCleanupScheduler {
  private intervalId: NodeJS.Timeout | null = null;
  private readonly CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutos
  private readonly EXPIRATION_MINUTES = 60; // Expirar después de 60 minutos

  constructor(private deviceRepo: PostgresDeviceRepository) {}

  /**
   * Inicia el scheduler
   */
  start(): void {
    if (this.intervalId) {
      console.warn("[DeviceCleanupScheduler] Already running");
      return;
    }

    console.log("[DeviceCleanupScheduler] Starting cleanup scheduler (every 10 minutes)");
    
    // Ejecutar limpieza cada 10 minutos
    this.intervalId = setInterval(() => {
      this.cleanup();
    }, this.CLEANUP_INTERVAL_MS);

    // Ejecutar una vez al iniciar después de 1 minuto
    setTimeout(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  /**
   * Detiene el scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[DeviceCleanupScheduler] Stopped");
    }
  }

  /**
   * Ejecuta la limpieza
   */
  private async cleanup(): Promise<void> {
    try {
      const deletedCount = await this.deviceRepo.cleanupExpiredPairingDevices(
        this.EXPIRATION_MINUTES
      );

      if (deletedCount > 0) {
        console.log(
          `[DeviceCleanupScheduler] Cleaned up ${deletedCount} expired device(s) (inactive for ${this.EXPIRATION_MINUTES}+ minutes)`
        );
      }
    } catch (error) {
      console.error("[DeviceCleanupScheduler] Error during cleanup:", error);
    }
  }
}
