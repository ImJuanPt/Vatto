#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <DNSServer.h>
#include <PZEM004Tv30.h>
#include <Preferences.h>
#include <WiFiProv.h>
#include <time.h>

// ============== CONFIGURACIÓN GENERAL ==============
#define BACKEND_URL_BASE          "https://vatto.online/api/v1"
#define BACKEND_URL_READINGS      "https://vatto.online/api/v1/readings"
#define AP_SSID                   "Vatto-Setup"
#define AP_PASSWORD               "12345678"
#define DEVICE_MODEL_ID           "PZEM-ESP32-V1"
#define QR_LANDING_BASE_URL       "https://vatto.online/qr"
#define APK_DOWNLOAD_URL          "https://vatto.online/apk/vatto-latest.apk"
#define LOCAL_SETUP_HOST          "configuracion.local"
#define RXD2                      16
#define TXD2                      17

// ============== CONSTANTES DE TIEMPO (ms) ==============
#define WIFI_CONNECT_TIMEOUT      15000    // 15 segundos máximo para conectar
#define HTTP_TIMEOUT              10000    // 10 segundos máximo para requests HTTP
#define READING_INTERVAL          10000    // 10 segundos entre lecturas
#define SENSOR_READ_TIMEOUT       5000     // 5 segundos máximo para leer sensor
#define WIFI_RECONNECT_INTERVAL   30000    // 30 segundos entre reintentos de reconexión
#define PZEM_BAUD_RATE            9600

// ============== CONSTANTES BLE PROVISIONING ==============
#define BLE_PROV_POP              "12345678"
#define BLE_SERVICE_PREFIX        "VATTO_"
#define BLE_PAIRING_RETRY_INTERVAL 5000     // 5 segundos entre reintentos de pairing BLE

// ============== CONSTANTES DE REINTENTOS ==============
#define MAX_WIFI_RETRIES          3
#define MAX_PAIRING_RETRIES       3
#define MAX_HTTP_RETRIES          2
#define RETRY_BACKOFF_FACTOR      2        // Backoff exponencial: 2x

// ============== ALMACENAMIENTO PERSISTENTE ==============
Preferences preferences;

// ============== HARDWARE ==============
PZEM004Tv30 pzem(Serial2, RXD2, TXD2);
WebServer server(80);
DNSServer dnsServer;
bool sensorHealthy = false;
bool bleProvisioningStarted = false;
unsigned long lastBlePairingAttempt = 0;

// ============== FORWARD DECLARATIONS ==============
bool connectToWiFi(String ssid, String password, bool keepAP);
bool connectToWifiWithRetry(String ssid, String password, int maxRetries, bool keepAP);
bool pairDeviceWithRetry(String pairingCode, int maxRetries);
bool pairDevice(String pairingCode);
bool validateDeviceStillExists();
void handleNormalMode();
void readAndSendSensorData();
void resetConfiguration();
void handleInfo();
void addCorsHeaders();
String urlEncode(const String& value);
String buildQrLandingUrl(const String& macAddress);
String buildProvisioningQrPayload(const String& macAddress);
void printProvisioningSummary();
void startBleProvisioning();
void handleBleAutoPairing();

// ============== NTP ==============
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0;
const int   daylightOffset_sec = 0;

// ============== ESTADO DEL DISPOSITIVO ==============
int deviceId = 0;
String wifiSSID = "";
String wifiPassword = "";
String pairingCodeStored = "";
bool configurationMode = true;
bool useStoredWifiCreds = false;
bool forceReconfigurationMode = false;

// ============== MÉTRICAS Y DEBUG ==============
unsigned long lastReadingTime = 0;
unsigned long lastWifiReconnectAttempt = 0;
unsigned long lastDeviceValidationTime = 0;
unsigned long lastSuccessfulPairingTime = 0;  // Timestamp del último pairing exitoso
int consecutiveReadingFailures = 0;
int consecutiveHttpFailures = 0;
int consecutiveValidationFailures = 0;  // Contador para fallos de validación

// ============== ENUMS PARA LOGGING ==============
enum LogLevel { LOG_INFO, LOG_WARN, LOG_ERROR, LOG_SUCCESS };

// ============== FUNCIONES DE LOGGING ==============
void logMessage(const char* tag, LogLevel level, const char* format, ...) {
  char buffer[256];
  va_list args;
  va_start(args, format);
  vsnprintf(buffer, sizeof(buffer), format, args);
  va_end(args);

  const char* prefix = "";
  switch (level) {
    case LOG_INFO:    prefix = "[INFO] "; break;
    case LOG_WARN:    prefix = "[WARN] "; break;
    case LOG_ERROR:   prefix = "[ERROR] "; break;
    case LOG_SUCCESS: prefix = "[OK] "; break;
  }

  Serial.printf("[%s] %s%s\n", tag, prefix, buffer);
}

String urlEncode(const String& value) {
  String encoded = "";
  const char* hex = "0123456789ABCDEF";

  for (size_t i = 0; i < value.length(); i++) {
    unsigned char c = value.charAt(i);
    bool isUnreserved = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') ||
                        (c >= '0' && c <= '9') || c == '-' || c == '_' || c == '.' || c == '~';

    if (isUnreserved) {
      encoded += (char)c;
    } else {
      encoded += '%';
      encoded += hex[(c >> 4) & 0x0F];
      encoded += hex[c & 0x0F];
    }
  }

  return encoded;
}

String buildQrLandingUrl(const String& macAddress) {
  String url = String(QR_LANDING_BASE_URL);
  url += "?mac=" + urlEncode(macAddress);
  url += "&model=" + urlEncode(String(DEVICE_MODEL_ID));
  return url;
}

String buildProvisioningQrPayload(const String& macAddress) {
  String payload = "{";
  payload += "\"v\":1,";
  payload += "\"brand\":\"VATTO\",";
  payload += "\"deviceType\":\"pzem-esp32\",";
  payload += "\"model\":\"" + String(DEVICE_MODEL_ID) + "\",";
  payload += "\"mac\":\"" + macAddress + "\",";
  payload += "\"apSsid\":\"" + String(AP_SSID) + "\",";
  payload += "\"apIp\":\"192.168.4.1\",";
  payload += "\"setupUrl\":\"http://" + String(LOCAL_SETUP_HOST) + "\",";
  payload += "\"setupUrlFallback\":\"http://192.168.4.1\",";
  payload += "\"apkUrl\":\"" + String(APK_DOWNLOAD_URL) + "\",";
  payload += "\"linkUrl\":\"" + buildQrLandingUrl(macAddress) + "\"";
  payload += "}";
  return payload;
}

void printProvisioningSummary() {
  String staMac = WiFi.macAddress();
  String apMac = WiFi.softAPmacAddress();
  String qrUrl = buildQrLandingUrl(staMac);
  String qrPayload = buildProvisioningQrPayload(staMac);

  Serial.println("\n================= VATTO PROVISIONING DATA =================");
  Serial.println("Copia y guarda estos datos para etiquetar el medidor:\n");
  Serial.println("- MAC (STA, para registro): " + staMac);
  Serial.println("- MAC (AP): " + apMac);
  Serial.println("- Modelo: " + String(DEVICE_MODEL_ID));
  Serial.println("- URL local setup: http://" + String(LOCAL_SETUP_HOST));
  Serial.println("- URL fallback setup: http://192.168.4.1");
  Serial.println("- URL QR permanente recomendada: " + qrUrl);
  Serial.println("- URL descarga APK: " + String(APK_DOWNLOAD_URL));
  Serial.println("- Payload QR JSON sugerido:");
  Serial.println(qrPayload);
  Serial.println("===========================================================\n");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=== ESP32 PZEM Power Monitor v3.1 - Initialization ===");

  preferences.begin("pzem_config", false);
  deviceId = preferences.getInt("deviceId", 0);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  pairingCodeStored = preferences.getString("pairingCode", "");
  useStoredWifiCreds = preferences.getBool("useStoredWifiCreds", false);
  preferences.end();
  logMessage("INIT", LOG_INFO, "Configuration loaded: deviceId=%d", deviceId);

  Serial2.begin(PZEM_BAUD_RATE, SERIAL_8N1, RXD2, TXD2);
  logMessage("PZEM", LOG_INFO, "Serial initialized");
  delay(2000);

  if (deviceId == 0) {
    configurationMode = true;
    logMessage("MODE", LOG_WARN, "Configuration mode - AP: Vatto-Setup on 192.168.4.1");
    startConfigurationMode();
  } else {
    configurationMode = false;
    logMessage("MODE", LOG_SUCCESS, "Normal mode - deviceId=%d", deviceId);
    
    float testVoltage = pzem.voltage();
    float testCurrent = pzem.current();
    float testPower = pzem.power();
    
    if (!isnan(testVoltage) || !isnan(testCurrent) || !isnan(testPower)) {
      sensorHealthy = true;
      logMessage("PZEM", LOG_SUCCESS, "Sensor OK");
    } else {
      sensorHealthy = false;
      logMessage("PZEM", LOG_WARN, "Sensor not responding - check connections");
    }
    if (useStoredWifiCreds || wifiSSID.isEmpty()) {
      logMessage("WIFI", LOG_INFO, "Connecting using stored WiFi credentials (BLE/NVS)");
    } else {
      logMessage("WIFI", LOG_INFO, "Connecting to: %s", wifiSSID.c_str());
    }
    
    String connectSsid = (useStoredWifiCreds || wifiSSID.isEmpty()) ? "" : wifiSSID;
    String connectPassword = (useStoredWifiCreds || wifiSSID.isEmpty()) ? "" : wifiPassword;

    if (!connectToWifiWithRetry(connectSsid, connectPassword, MAX_WIFI_RETRIES, false)) {
      logMessage("WIFI", LOG_ERROR, "WiFi failed after %d attempts", MAX_WIFI_RETRIES);

      if (!useStoredWifiCreds) {
        logMessage("WIFI", LOG_WARN, "Trying fallback using NVS stored credentials");
        if (connectToWifiWithRetry("", "", 1, false)) {
          useStoredWifiCreds = true;
          preferences.begin("pzem_config", false);
          preferences.putBool("useStoredWifiCreds", true);
          preferences.end();
          logMessage("WIFI", LOG_SUCCESS, "Fallback credentials worked");
        }
      }

      if (WiFi.status() != WL_CONNECTED) {
        logMessage("MODE", LOG_WARN, "Entering recovery mode (AP + local setup)");

        // Recovery real: limpiar credenciales WiFi provisionadas para permitir
        // un nuevo provisioning BLE/AP en esta misma sesión.
        WiFi.disconnect(true, true);
        delay(200);

        preferences.begin("pzem_config", false);
        preferences.putString("ssid", "");
        preferences.putString("password", "");
        preferences.putString("pairingCode", "");
        preferences.putBool("useStoredWifiCreds", false);
        preferences.end();

        wifiSSID = "";
        wifiPassword = "";
        pairingCodeStored = "";
        useStoredWifiCreds = false;

        logMessage("RECOVERY", LOG_INFO, "WiFi credentials cleared. AP + BLE reprovisioning enabled");
        configurationMode = true;
        forceReconfigurationMode = true;
        startConfigurationMode();
        return;
      }
    }
    
    logMessage("NTP", LOG_INFO, "Syncing time");
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    delay(2000);
    
    unsigned long timeSincePairing = millis() - lastSuccessfulPairingTime;
    bool justPaired = (lastSuccessfulPairingTime > 0 && timeSincePairing < 60000);
    
    if (justPaired) {
      logMessage("VALIDATE", LOG_INFO, "Skipping validation - just paired");
    } else {
      logMessage("VALIDATE", LOG_INFO, "Validating device");
      
      bool validated = false;
      for (int attempt = 1; attempt <= 3; attempt++) {
        if (attempt > 1) {
          logMessage("VALIDATE", LOG_INFO, "Retry %d/3", attempt);
          delay(2000);
        }
        
        if (validateDeviceStillExists()) {
          validated = true;
          break;
        }
      }
      
      if (!validated) {
        logMessage("VALIDATE", LOG_ERROR, "Device deleted from platform - resetting to factory");
        WiFi.disconnect();
        resetConfiguration();
        delay(500);
        ESP.restart();   // Arranque limpio → boot en modo AP sin configuración
        return;
      }
      
      logMessage("VALIDATE", LOG_SUCCESS, "Device %d validated successfully", deviceId);
    }
  }
}

void loop() {
  if (configurationMode) {
    server.handleClient();
    dnsServer.processNextRequest();
    handleBleAutoPairing();
    delay(50);
  } else {
    handleNormalMode();
  }
}

void startConfigurationMode() {
  WiFi.mode(WIFI_AP_STA);
  delay(100);

  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    logMessage("AP", LOG_ERROR, "Failed to start Access Point");
    delay(3000);
    ESP.restart();
  }

  IPAddress apIP = WiFi.softAPIP();
  logMessage("AP", LOG_SUCCESS, "Access Point started");
  logMessage("AP", LOG_INFO, "IP: %s", apIP.toString().c_str());
  logMessage("DNS", LOG_INFO, "Local host enabled: http://%s", LOCAL_SETUP_HOST);

  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", apIP);  // Captive DNS: cualquier host -> 192.168.4.1

  printProvisioningSummary();

  server.on("/", HTTP_GET, handleWebRoot);
  server.on("/configure", HTTP_POST, handleConfigure);
  server.on("/info", HTTP_GET, handleInfo);

  // CORS preflight para que el WebView de la app móvil pueda llamar directamente
  server.on("/configure", HTTP_OPTIONS, []() {
    addCorsHeaders();
    server.send(204);
  });
  server.on("/info", HTTP_OPTIONS, []() {
    addCorsHeaders();
    server.send(204);
  });

  server.onNotFound([]() {
    if (server.method() == HTTP_GET) {
      handleWebRoot();
      return;
    }
    addCorsHeaders();
    server.send(404, "text/plain", "Not found");
  });

  server.begin();
  logMessage("WEB", LOG_SUCCESS, "Web server started");

  startBleProvisioning();
}

// ============================================================
// CORS: permite que el WebView de la app móvil (Capacitor)
// llame a http://192.168.4.1 sin bloqueos de origen cruzado
// ============================================================
void addCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

/**
 * GET /info
 * Devuelve información del dispositivo en JSON.
 * La app móvil llama a este endpoint (cuando está conectada al AP Vatto-Setup)
 * para verificar que está hablando con el ESP32 correcto antes de enviar credenciales.
 * Respuesta: { "mac": "AA:BB:CC:DD:EE:FF", "model": "PZEM-ESP32-V1",
 *              "status": "unconfigured" | "configured", "deviceId": 0 }
 */
void handleInfo() {
  addCorsHeaders();
  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");

  String mac = WiFi.softAPmacAddress();
  String staMac = WiFi.macAddress();
  String status = (deviceId > 0) ? "configured" : "unconfigured";
  String qrUrl = buildQrLandingUrl(staMac);

  String json = "{";
  json += "\"mac\":\"" + mac + "\",";
  json += "\"staMac\":\"" + staMac + "\",";
  json += "\"model\":\"" + String(DEVICE_MODEL_ID) + "\",";
  json += "\"status\":\"" + status + "\",";
  json += "\"qrUrl\":\"" + qrUrl + "\",";
  json += "\"deviceId\":" + String(deviceId);
  json += "}";

  server.send(200, "application/json", json);
}

/**
 * GET /
 * Sirve la página HTML/CSS/JS de configuración responsiva y profesional
 */
void handleWebRoot() {
  // Si ya está configurado, mostrar página de éxito
  if (deviceId > 0 && !forceReconfigurationMode) {
    server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    server.sendHeader("Pragma", "no-cache");
    server.sendHeader("Expires", "0");
    
    String successHtml = R"(
<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PZEM - Configurado</title><style>*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.container{background:white;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.2);padding:40px;max-width:400px;width:100%;text-align:center}
.check{color:#28a745;font-size:64px;margin-bottom:20px}h1{color:#333;margin-bottom:10px}p{color:#666;line-height:1.6}</style>
</head><body><div class="container"><div class="check">✅</div><h1>Dispositivo Configurado</h1>
<p>Tu PZEM está listo. Conectado al backend en modo normal.</p><p style="color:#999;font-size:12px;margin-top:20px">DeviceId: )";
    successHtml += String(deviceId) + R"(</p></div></body></html>)";
    server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    server.sendHeader("Pragma", "no-cache");
    server.sendHeader("Expires", "0");
    server.send(200, "text/html; charset=utf-8", successHtml);
    return;
  }

  server.sendHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  server.sendHeader("Pragma", "no-cache");
  server.sendHeader("Expires", "0");
  
  String html = R"HTML(
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Configuración PZEM</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      padding: 40px;
      max-width: 450px;
      width: 100%;
    }
    .header { text-align: center; margin-bottom: 30px; }
    .header h1 { color: #333; font-size: 28px; margin-bottom: 8px; }
    .header p { color: #999; font-size: 14px; }
    .form-group { margin-bottom: 20px; }
    label {
      display: block;
      margin-bottom: 8px;
      color: #333;
      font-weight: 600;
      font-size: 14px;
    }
    input, select {
      width: 100%;
      padding: 12px;
      border: 2px solid #ddd;
      border-radius: 6px;
      font-size: 14px;
      font-family: inherit;
      transition: border-color 0.3s;
    }
    input:focus, select:focus { outline: none; border-color: #667eea; }
    input:invalid { border-color: #dc3545; }
    .info-text {
      font-size: 12px;
      color: #999;
      margin-top: 4px;
    }
    button {
      width: 100%;
      padding: 12px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 20px;
    }
    button:hover:not(:disabled) { box-shadow: 0 5px 20px rgba(102, 126, 234, 0.4); }
    button:active:not(:disabled) { transform: scale(0.98); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .status {
      margin-top: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      display: none;
      align-items: center;
    }
    .status.success {
      background: #d4edda;
      color: #155724;
      border: 1px solid #c3e6cb;
      display: flex;
    }
    .status.error {
      background: #f8d7da;
      color: #721c24;
      border: 1px solid #f5c6cb;
      display: flex;
    }
    .status.loading {
      background: #d1ecf1;
      color: #0c5460;
      border: 1px solid #bee5eb;
      display: flex;
    }
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid transparent;
      border-radius: 50%;
      border-top-color: currentColor;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      flex-shrink: 0;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>⚡ Configuración PZEM</h1>
      <p>Ingresa los datos de tu red WiFi. El QR de la app VATTO es ahora el método principal.</p>
      <div style="margin-top:10px;padding:10px 14px;background:#eef2ff;border-radius:6px;font-size:12px;color:#3730a3;text-align:left">
        📱 <strong>Desde la app VATTO:</strong> Escanea el QR del medidor para vincular por MAC automáticamente.<br>
        📶 O usa BLE: en la app selecciona <strong>BLE (recomendado)</strong> para configurar por Bluetooth sin entrar al portal.<br>
        🌐 O entra a <strong>http://configuracion.local</strong> (o <strong>http://192.168.4.1</strong> si no abre).<br>
        🆘 Si no tienes la app o el QR, usa el código de respaldo aquí abajo.
      </div>
    </div>

    <form id="configForm" novalidate>
      <div class="form-group">
        <label for="ssid">Red WiFi (SSID)</label>
        <input type="text" id="ssid" name="ssid" placeholder="Nombre de tu red WiFi" 
               required minlength="1" maxlength="32">
        <div class="info-text">El nombre de tu red WiFi</div>
      </div>

      <div class="form-group">
        <label for="password">Contraseña WiFi</label>
        <input type="password" id="password" name="password" placeholder="Contraseña" 
               required minlength="8" maxlength="64">
        <div class="info-text">Mínimo 8 caracteres</div>
      </div>

      <div class="form-group">
        <label for="pairingCode">Código de respaldo <span style="font-weight:400;color:#aaa">(opcional)</span></label>
        <input type="text" id="pairingCode" name="pairingCode" 
               placeholder="000000" pattern="[0-9]{6}" maxlength="6">
        <div class="info-text">Solo si <strong>no</strong> escaneaste el QR desde la app VATTO. Si escaneaste el QR, deja este campo vacío.</div>
      </div>

      <button type="submit" id="submitBtn">Configurar Dispositivo</button>
    </form>

    <div class="status" id="status"></div>
  </div>

  <script>
    const form = document.getElementById('configForm');
    const statusDiv = document.getElementById('status');
    const submitBtn = document.getElementById('submitBtn');
    const pairingInput = document.getElementById('pairingCode');

    // Solo permitir números en pairing code
    pairingInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const ssid = document.getElementById('ssid').value.trim();
      const password = document.getElementById('password').value.trim();
      const pairingCode = document.getElementById('pairingCode').value.trim();

      // Validar
      if (!ssid || ssid.length < 1 || ssid.length > 32) {
        showStatus('SSID invalido', 'error');
        return;
      }
      if (!password || password.length < 8 || password.length > 64) {
        showStatus('Contraseña debe tener 8-64 caracteres', 'error');
        return;
      }
      // pairingCode es opcional: si el usuario escaneó el QR desde la app, viene vacío
      if (pairingCode && (pairingCode.length !== 6 || !/^\d{6}$/.test(pairingCode))) {
        showStatus('El código debe ser 6 dígitos (o déjalo vacío si usaste el QR)', 'error');
        return;
      }

      submitBtn.disabled = true;
      showStatus('Configurando dispositivo...', 'loading');

      try {
        const response = await fetch('/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ssid, password, pairingCode })
        });

        if (response.ok) {
          showStatus('Exito. El dispositivo se esta configurando...', 'success');
          submitBtn.disabled = true;
          return;
        }

        // Si no es OK, intentar parsear el error
        const data = await response.json().catch(() => ({}));
        
        let errorMsg = data.error || data.message || 'Error en configuración';
        
        if (response.status === 409) {
          errorMsg = 'MAC duplicado. Este dispositivo ya esta registrado.';
        } else if (response.status === 404) {
          errorMsg = 'No se encontro pre-registro por MAC y/o codigo invalido';
        } else if (response.status === 400) {
          errorMsg = 'Error: ' + errorMsg;
        }
        
        showStatus('Error: ' + errorMsg, 'error');
        submitBtn.disabled = false;
        
      } catch (error) {
        showStatus('Configuración enviada. Espera 10-20 segundos.', 'success');
        submitBtn.disabled = true;
      }
    });

    function showStatus(message, type) {
      statusDiv.className = 'status ' + type;
      statusDiv.innerHTML = message;
      statusDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  </script>
</body>
</html>
  )HTML";

  server.send(200, "text/html; charset=utf-8", html);
}

/**
 * POST /configure
 * Recibe { ssid, password, pairingCode }
 * Intenta conectar a WiFi y hacer pairing con reintentos
 */
void handleConfigure() {
  addCorsHeaders();

  if (!server.hasArg("plain")) {
    server.send(400, "application/json", "{\"error\":\"Empty request body\"}");
    return;
  }

  String body = server.arg("plain");
  String ssid = extractJsonString(body, "ssid");
  String password = extractJsonString(body, "password");
  String pairingCode = extractJsonString(body, "pairingCode");

  if (ssid.isEmpty() || ssid.length() > 32) {
    server.send(400, "application/json", "{\"error\":\"Invalid SSID\"}");
    return;
  }

  if (password.isEmpty() || password.length() < 8 || password.length() > 64) {
    server.send(400, "application/json", "{\"error\":\"Password must be 8-64 characters\"}");
    return;
  }

  // pairingCode es opcional: si viene vacío, el backend lo busca por MAC address
  if (!pairingCode.isEmpty() && (pairingCode.length() != 6 || !isNumeric(pairingCode))) {
    server.send(400, "application/json", "{\"error\":\"Pairing code must be 6 digits or empty\"}");
    return;
  }

  logMessage("CONFIG", LOG_INFO, "Configuration request: SSID=%s", ssid.c_str());

  WiFi.mode(WIFI_AP_STA);
  delay(100);

  if (!connectToWifiWithRetry(ssid, password, MAX_WIFI_RETRIES, true)) {
    logMessage("CONFIG", LOG_ERROR, "WiFi connection failed");
    WiFi.mode(WIFI_AP);
    server.send(400, "application/json", "{\"error\":\"WiFi connection failed\"}");
    return;
  }

  logMessage("CONFIG", LOG_SUCCESS, "WiFi connected");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  delay(2000);

  if (!pairDeviceWithRetry(pairingCode, MAX_PAIRING_RETRIES)) {
    logMessage("CONFIG", LOG_ERROR, "Pairing failed");
    WiFi.mode(WIFI_AP);
    server.send(400, "application/json", "{\"error\":\"Pairing failed. If QR flow was used, verify that device was pre-linked by MAC in VATTO app; otherwise use valid backup code.\"}");
    return;
  }

  preferences.begin("pzem_config", false);
  preferences.putInt("deviceId", deviceId);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.putString("pairingCode", pairingCode);
  preferences.putBool("useStoredWifiCreds", false);
  preferences.end();

  forceReconfigurationMode = false;

  lastSuccessfulPairingTime = millis();
  logMessage("CONFIG", LOG_SUCCESS, "Configuration saved");

  // Enviar respuesta JSON (el cliente no intenta procesar como JSON si falla, solo hace reload)
  server.send(200, "application/json", "{\"success\":true,\"deviceId\":" + String(deviceId) + ",\"message\":\"Device configured successfully. Restarting...\"}");

  delay(2000); // Esperar 2 segundos antes de reiniciar
  ESP.restart();
}

bool isNumeric(String str) {
  for (int i = 0; i < str.length(); i++) {
    if (!isdigit(str[i])) return false;
  }
  return true;
}

String extractJsonString(String json, String key) {
  int startPos = json.indexOf("\"" + key + "\":");
  if (startPos == -1) return "";
  
  startPos = json.indexOf("\"", startPos + key.length() + 3) + 1;
  int endPos = json.indexOf("\"", startPos);
  
  if (startPos > 0 && endPos > startPos) {
    return json.substring(startPos, endPos);
  }
  return "";
}


bool validateDeviceStillExists() {
  if (deviceId == 0 || WiFi.status() != WL_CONNECTED) {
    return true;
  }

  HTTPClient http;
  String url = String(BACKEND_URL_BASE) + "/devices/" + String(deviceId);
  
  http.setTimeout(HTTP_TIMEOUT);
  http.begin(url);
  
  int httpCode = http.GET();
  http.end();
  
  if (httpCode == 200) {
    consecutiveValidationFailures = 0;
    return true;
  }
  
  if (httpCode == 404) {
    consecutiveValidationFailures++;
    logMessage("VALIDATE", LOG_ERROR, "Device not found (HTTP 404)");
    return false;
  }
  
  if (httpCode == 409) {
    consecutiveValidationFailures++;
    logMessage("VALIDATE", LOG_ERROR, "Device conflict (HTTP 409)");
    if (consecutiveValidationFailures >= 2) {
      logMessage("VALIDATE", LOG_ERROR, "Too many failures");
      return false;
    }
    return true;
  }
  
  if (httpCode == 401 || httpCode == 403) {
    logMessage("VALIDATE", LOG_WARN, "HTTP %d auth issue", httpCode);
    consecutiveValidationFailures = 0;
    return true;
  }
  
  consecutiveValidationFailures++;
  logMessage("VALIDATE", LOG_ERROR, "Validation failed (HTTP %d)", httpCode);
  
  // Solo resetear después de 2+ fallos AND si son errores que sugieren eliminación
  if (consecutiveValidationFailures >= 2) {
    logMessage("VALIDATE", LOG_ERROR, "Too many validation failures (%d). Device may have been deleted.", consecutiveValidationFailures);
    return false;
  }
  
  logMessage("VALIDATE", LOG_WARN, "Failure #%d - retry allowed", consecutiveValidationFailures);
  return true;
}

bool validateDeviceExists(int devId) {
  if (devId == 0) return false;
  
  if (WiFi.status() != WL_CONNECTED) {
    return true;
  }

  HTTPClient http;
  String url = String(BACKEND_URL_BASE) + "/devices/" + String(devId);
  
  http.setTimeout(HTTP_TIMEOUT);
  http.begin(url);
  
  int httpCode = http.GET();
  bool exists = (httpCode == 200);
  
  if (!exists) {
    preferences.begin("pzem_config", false);
    preferences.clear();
    preferences.end();
    deviceId = 0;
    wifiSSID = "";
    wifiPassword = "";
    pairingCodeStored = "";
    configurationMode = true;
  }
  
  http.end();
  return exists;
}

void handleNormalMode() {
  unsigned long now = millis();
  
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiReconnectAttempt >= WIFI_RECONNECT_INTERVAL) {
      logMessage("WIFI", LOG_WARN, "Disconnected, reconnecting...");
      lastWifiReconnectAttempt = now;
      
      String reconnectSsid = (useStoredWifiCreds || wifiSSID.isEmpty()) ? "" : wifiSSID;
      String reconnectPassword = (useStoredWifiCreds || wifiSSID.isEmpty()) ? "" : wifiPassword;

      if (!connectToWifiWithRetry(reconnectSsid, reconnectPassword, MAX_WIFI_RETRIES, false)) {
        logMessage("WIFI", LOG_ERROR, "Reconnect failed");
        return;
      }
    }
    return;
  }

  unsigned long validationInterval = (consecutiveValidationFailures > 0) ? 60000 : 300000;
  
  if (now - lastDeviceValidationTime >= validationInterval) {
    lastDeviceValidationTime = now;
    logMessage("VALIDATE", LOG_INFO, "Checking device");
    
    if (!validateDeviceStillExists()) {
      logMessage("MODE", LOG_ERROR, "Device deleted from platform - resetting to factory");
      WiFi.disconnect();
      resetConfiguration();
      delay(500);
      ESP.restart();   // Arranque limpio → boot en modo AP sin configuración
      return;
    }
  }

  if (now - lastReadingTime >= READING_INTERVAL) {
    lastReadingTime = now;
    readAndSendSensorData();
  }

  delay(100);
}

/**
 * Lee sensor PZEM y envía al backend con reintentos
 */
void readAndSendSensorData() {
  logMessage("SENSOR", LOG_INFO, "Reading PZEM...");
  
  // Permitir timeout en lectura del sensor
  unsigned long sensorStartTime = millis();
  float voltaje = pzem.voltage();
  float corriente = pzem.current();
  float potencia = pzem.power();
  float energia = pzem.energy();
  float frecuencia = pzem.frequency();
  float pf = pzem.pf();
  
  unsigned long sensorReadTime = millis() - sensorStartTime;
  
  // Validar lecturas
  if (isnan(voltaje) || isnan(corriente) || isnan(potencia)) {
    consecutiveReadingFailures++;
    logMessage("SENSOR", LOG_ERROR, "Invalid reading");
    
    if (consecutiveReadingFailures >= 5) {
      logMessage("SENSOR", LOG_ERROR, "Too many failures, restarting");
      delay(1000);
      ESP.restart();
    }
    return;
  }

  consecutiveReadingFailures = 0;

  Serial.printf("Readings: V=%.2f I=%.3f P=%.2f E=%.2f F=%.2f PF=%.2f\n",
    voltaje, corriente, potencia, energia, frecuencia, pf);

  if (!sendReadingWithRetry(voltaje, corriente, potencia, energia, frecuencia, pf, MAX_HTTP_RETRIES)) {
    logMessage("SEND", LOG_ERROR, "Failed to send reading after retries");
    consecutiveHttpFailures++;
  } else {
    consecutiveHttpFailures = 0;
  }
}


bool connectToWifiWithRetry(String ssid, String password, int maxRetries, bool keepAP) {
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    logMessage("WIFI", LOG_INFO, "Connect attempt %d/%d to '%s'", attempt, maxRetries, ssid.c_str());
    
    if (connectToWiFi(ssid, password, keepAP)) {
      logMessage("WIFI", LOG_SUCCESS, "Connected successfully");
      return true;
    }

    if (attempt < maxRetries) {
      unsigned long backoffTime = 1000 * attempt * RETRY_BACKOFF_FACTOR;
      delay(backoffTime);
    }
  }

  return false;
}

/**
 * Conectar a WiFi (intento único)
 */
bool connectToWiFi(String ssid, String password, bool keepAP) {
  // keepAP=true: mantiene AP activo mientras conecta STA (flujo /configure)
  // keepAP=false: conexión normal solo STA
  WiFi.mode(keepAP ? WIFI_AP_STA : WIFI_STA);

  if (ssid.isEmpty()) {
    // Usa credenciales ya provisionadas/guardadas en NVS por el stack WiFi (ej. WiFiProv BLE)
    WiFi.begin();
  } else {
    WiFi.begin(ssid.c_str(), password.c_str());
  }

  unsigned long startTime = millis();
  int dotCount = 0;

  Serial.print("  Conectando");
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - startTime > WIFI_CONNECT_TIMEOUT) {
      Serial.println(" [TIMEOUT]");
      logMessage("WIFI", LOG_ERROR, "Connection timeout after %dms", WIFI_CONNECT_TIMEOUT);
      return false;
    }

    delay(500);
    Serial.print(".");
  }

  Serial.println();
  logMessage("WIFI", LOG_SUCCESS, "Connected");
  return true;
}

// ============== PAIRING ==============

bool pairDeviceWithRetry(String pairingCode, int maxRetries) {
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    logMessage("PAIR", LOG_INFO, "Attempt %d/%d", attempt, maxRetries);
    if (pairDevice(pairingCode)) {
      logMessage("PAIR", LOG_SUCCESS, "OK");
      return true;
    }
    if (attempt < maxRetries) {
      unsigned long backoffTime = 2000 * attempt * RETRY_BACKOFF_FACTOR;
      delay(backoffTime);
    }
  }

  return false;
}

bool pairDevice(String pairingCode) {
  if (WiFi.status() != WL_CONNECTED) {
    logMessage("PAIR", LOG_ERROR, "WiFi not connected");
    return false;
  }

  if (pairingCode.isEmpty()) {
    logMessage("PAIR", LOG_INFO, "Using QR-first flow (no backup code) - backend will resolve by MAC");
  } else {
    logMessage("PAIR", LOG_INFO, "Using backup pairing code");
  }

  HTTPClient http;
  String url = String(BACKEND_URL_BASE) + "/devices/pair";
  http.setTimeout(HTTP_TIMEOUT);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  String macAddress = WiFi.macAddress();
  String payload = "{\"pairingCode\":\"" + pairingCode + "\",\"macAddress\":\"" + macAddress + "\"}";
  int httpCode = http.POST(payload);
  String response = http.getString();
  logMessage("PAIR", LOG_INFO, "HTTP %d", httpCode);
  bool success = false;
  if (httpCode == 200 || httpCode == 201) {
    int deviceIdPos = response.indexOf("deviceId");
    if (deviceIdPos != -1) {
      int colonPos = response.indexOf(":", deviceIdPos);
      if (colonPos != -1) {
        int endPos = response.indexOf(",", colonPos);
        if (endPos == -1) endPos = response.indexOf("}", colonPos);
        if (endPos == -1) endPos = response.length();
        String deviceIdStr = response.substring(colonPos + 1, endPos);
        deviceIdStr.trim();
        if (deviceIdStr.startsWith("\"")) deviceIdStr = deviceIdStr.substring(1);
        if (deviceIdStr.endsWith("\"")) deviceIdStr = deviceIdStr.substring(0, deviceIdStr.length() - 1);
        int newDeviceId = deviceIdStr.toInt();
        if (newDeviceId > 0) {
          deviceId = newDeviceId;
          logMessage("PAIR", LOG_SUCCESS, "DeviceId: %d", deviceId);
          success = true;
        }
      }
    }
  } else if (httpCode == 400) {
    logMessage("PAIR", LOG_ERROR, "HTTP 400 - Invalid pairing code or already used");
  } else if (httpCode == 404) {
    logMessage("PAIR", LOG_ERROR, "HTTP 404 - Invalid or expired pairing code");
    logMessage("PAIR", LOG_INFO, "Backend response: %s", response.c_str());
  } else if (httpCode == 500) {
    logMessage("PAIR", LOG_ERROR, "HTTP 500 - Server error");
  } else if (httpCode == -1) {
    logMessage("PAIR", LOG_ERROR, "HTTP -1 - Connection error (timeout or network issue)");
  } else {
    logMessage("PAIR", LOG_ERROR, "HTTP %d - Unexpected error", httpCode);
  }

  http.end();
  return success;
}

// ============== LECTURAS ==============

bool sendReadingWithRetry(float voltaje, float corriente, float potencia, 
                           float energia, float frecuencia, float pf, int maxRetries) {
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    logMessage("SEND", LOG_INFO, "Attempt %d/%d", attempt, maxRetries);
    if (sendReading(voltaje, corriente, potencia, energia, frecuencia, pf)) {
      logMessage("SEND", LOG_SUCCESS, "OK");
      return true;
    }

    if (attempt < maxRetries) {
      unsigned long backoffTime = 1000 * attempt;
      delay(backoffTime);
    }
  }

  return false;
}

bool sendReading(float voltaje, float corriente, float potencia, 
                 float energia, float frecuencia, float pf) {
  if (WiFi.status() != WL_CONNECTED) {
    logMessage("SEND", LOG_ERROR, "WiFi not connected");
    return false;
  }
  HTTPClient http;
  String url = BACKEND_URL_READINGS;
  http.setTimeout(HTTP_TIMEOUT);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  String payload = "{";
  payload += "\"deviceId\":" + String(deviceId) + ",";
  payload += "\"voltage\":" + String(voltaje, 2) + ",";
  payload += "\"currentAmps\":" + String(corriente, 3) + ",";
  payload += "\"powerWatts\":" + String(potencia, 2) + ",";
  payload += "\"energyKwh\":" + String(energia, 2) + ",";
  payload += "\"frequency\":" + String(frecuencia, 2) + ",";
  payload += "\"powerFactor\":" + String(pf, 2);
  payload += "}";
  int httpCode = http.POST(payload);
  logMessage("SEND", LOG_INFO, "HTTP %d", httpCode);
  
  if (httpCode == 202 || httpCode == 200) {
    http.end();
    return true;
  } else if (httpCode == 400) {
    String response = http.getString();
    logMessage("SEND", LOG_ERROR, "HTTP 400");
    
    if (response.indexOf("deviceId") != -1 || response.indexOf("Device not found") != -1) {
      logMessage("MODE", LOG_ERROR, "Device deleted (reading 400) - resetting to factory");
      WiFi.disconnect();
      resetConfiguration();
      delay(500);
      ESP.restart();
    }
  } else if (httpCode == 401 || httpCode == 403) {
    logMessage("SEND", LOG_ERROR, "HTTP %d - Authentication error (Token invalid?)", httpCode);
  } else if (httpCode == 404) {
    logMessage("SEND", LOG_ERROR, "HTTP 404 - Device deleted - resetting to factory");
    WiFi.disconnect();
    resetConfiguration();
    delay(500);
    ESP.restart();
  } else if (httpCode == 409) {
    logMessage("SEND", LOG_ERROR, "HTTP 409 - MAC conflict - resetting to factory");
    WiFi.disconnect();
    resetConfiguration();
    delay(500);
    ESP.restart();
  } else if (httpCode == 500) {
    logMessage("SEND", LOG_ERROR, "HTTP 500 - Backend error");
  } else if (httpCode == -1) {
    logMessage("SEND", LOG_ERROR, "HTTP -1 - Connection timeout");
  } else {
    logMessage("SEND", LOG_ERROR, "HTTP %d - Unexpected error", httpCode);
  }

  http.end();
  return (httpCode == 202 || httpCode == 200);
}

// ============== TIMESTAMP ==============

String getISO8601Time() {
  time_t now = time(nullptr);
  struct tm timeinfo;
  gmtime_r(&now, &timeinfo);
  
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &timeinfo);
  return String(buf);
}

// ============== RESET CONFIGURATION ==============

/**
 * Borra toda la configuración guardada en la memoria flash
 * Útil cuando el dispositivo fue eliminado del backend
 */
// ============== BLE PROVISIONING ==============

/**
 * Inicia el servidor BLE de provisioning ESP-IDF.
 * El teléfono (app VATTO) se conecta como cliente BLE y envía SSID + password.
 * El ESP32 guarda las credenciales en NVS y se conecta automáticamente.
 */
void startBleProvisioning() {
  String mac = WiFi.macAddress();
  mac.replace(":", "");
  String bleName = String(BLE_SERVICE_PREFIX) + mac.substring(6); // Ej: VATTO_AABBCC

  logMessage("BLE", LOG_INFO, "Starting BLE provisioning: %s", bleName.c_str());

  WiFiProv.beginProvision(
    NETWORK_PROV_SCHEME_BLE,
    NETWORK_PROV_SCHEME_HANDLER_FREE_BLE,
    NETWORK_PROV_SECURITY_1,
    BLE_PROV_POP,
    bleName.c_str()
  );

  bleProvisioningStarted = true;
  logMessage("BLE", LOG_SUCCESS, "BLE ready. Device: %s | PoP: %s", bleName.c_str(), BLE_PROV_POP);
}

/**
 * Detecta si el provisioning BLE completó (WiFi conectado) y hace auto-pairing.
 * Llamado desde loop() en modo configuración.
 */
void handleBleAutoPairing() {
  if (!bleProvisioningStarted) return;
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long now = millis();
  if (now - lastBlePairingAttempt < BLE_PAIRING_RETRY_INTERVAL) return;
  lastBlePairingAttempt = now;

  logMessage("BLE", LOG_INFO, "WiFi connected via BLE provisioning - attempting auto-pairing");

  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  delay(1000);

  if (pairDeviceWithRetry("", MAX_PAIRING_RETRIES)) {
    preferences.begin("pzem_config", false);
    preferences.putInt("deviceId", deviceId);
    preferences.putString("ssid", "");
    preferences.putString("password", "");
    preferences.putString("pairingCode", "");
    preferences.putBool("useStoredWifiCreds", true);
    preferences.end();

    wifiSSID = "";
    wifiPassword = "";
    pairingCodeStored = "";
    useStoredWifiCreds = true;

    lastSuccessfulPairingTime = millis();
    logMessage("BLE", LOG_SUCCESS, "BLE auto-pairing OK. DeviceId: %d - restarting", deviceId);
    delay(1000);
    ESP.restart();
  } else {
    logMessage("BLE", LOG_ERROR, "BLE auto-pairing failed - will retry in %dms", BLE_PAIRING_RETRY_INTERVAL);
  }
}

void resetConfiguration() {
  logMessage("RESET", LOG_WARN, "Factory reset: borrando WiFi, deviceId y pairingCode de flash...");
  preferences.begin("pzem_config", false);
  preferences.clear();   // Borra ssid, password, deviceId, pairingCode
  preferences.end();
  // Borra también credenciales WiFi guardadas en NVS por el stack
  WiFi.disconnect(true, true);
  deviceId = 0;
  wifiSSID = "";
  wifiPassword = "";
  pairingCodeStored = "";
  useStoredWifiCreds = false;
  configurationMode = true;
  logMessage("RESET", LOG_SUCCESS, "Flash borrado. El dispositivo arrancara en modo AP (Vatto-Setup).");
}


