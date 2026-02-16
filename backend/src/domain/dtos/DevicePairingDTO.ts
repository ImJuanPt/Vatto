/**
 * DTO para emparejar un ESP32 con su deviceId usando código de vinculación
 * El ESP32 envía: { pairingCode, macAddress, wifiMac? }
 * El backend retorna: { deviceId, pairingToken }
 */
export interface DevicePairingDTO {
  pairingCode: string; // Código de 6 dígitos generado en la app
  macAddress: string;  // MAC address del ESP32 (ej: "AA:BB:CC:DD:EE:FF")
  wifiMac?: string;    // MAC del WiFi si está disponible
}

export interface PairingResponse {
  deviceId: number;
  pairingToken: string; // Token para autenticar futuras lecturas (opcional)
  message: string;
}
