#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <PZEM004Tv30.h>
#include <Preferences.h>
#include <time.h>

// ============== CONFIGURACIÓN GENERAL ==============
#define BACKEND_URL_BASE          "http://217.71.203.129/api/v1"
#define BACKEND_URL_READINGS      "http://217.71.203.129/api/v1/readings"
#define AP_SSID                   "Vatto-Setup"
#define AP_PASSWORD               "12345678"
#define RXD2                      16
#define TXD2                      17

// ============== CONSTANTES DE TIEMPO (ms) ==============
#define WIFI_CONNECT_TIMEOUT      15000    // 15 segundos máximo para conectar
#define HTTP_TIMEOUT              10000    // 10 segundos máximo para requests HTTP
#define READING_INTERVAL          10000    // 10 segundos entre lecturas
#define SENSOR_READ_TIMEOUT       5000     // 5 segundos máximo para leer sensor
#define WIFI_RECONNECT_INTERVAL   30000    // 30 segundos entre reintentos de reconexión
#define PZEM_BAUD_RATE            9600

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
bool sensorHealthy = false;

// ============== FORWARD DECLARATIONS ==============
bool connectToWiFi(String ssid, String password, bool keepAP);
bool connectToWifiWithRetry(String ssid, String password, int maxRetries, bool keepAP);
bool pairDeviceWithRetry(String pairingCode, int maxRetries);
bool pairDevice(String pairingCode);
bool validateDeviceStillExists();
void handleNormalMode();
void readAndSendSensorData();
void resetConfiguration();

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

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n=== ESP32 PZEM Power Monitor v3.1 - Initialization ===");

  preferences.begin("pzem_config", false);
  deviceId = preferences.getInt("deviceId", 0);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  pairingCodeStored = preferences.getString("pairingCode", "");
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
      logMessage("WIFI", LOG_INFO, "Connecting to: %s", wifiSSID.c_str());
    
    if (!connectToWifiWithRetry(wifiSSID, wifiPassword, MAX_WIFI_RETRIES, false)) {
      logMessage("WIFI", LOG_ERROR, "WiFi failed after %d attempts", MAX_WIFI_RETRIES);
      delay(3000);
      ESP.restart();
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
        logMessage("VALIDATE", LOG_ERROR, "Device validation failed");
        WiFi.disconnect();
        resetConfiguration();
        configurationMode = true;
        startConfigurationMode();
        return;  // Salir del setup, enter loop() en modo configuración
      }
      
      logMessage("VALIDATE", LOG_SUCCESS, "Device %d validated successfully", deviceId);
    }
  }
}

void loop() {
  if (configurationMode) {
    server.handleClient();
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

  server.on("/", HTTP_GET, handleWebRoot);
  server.on("/configure", HTTP_POST, handleConfigure);
  server.onNotFound([]() {
    server.send(404, "text/plain", "Not found");
  });

  server.begin();
  logMessage("WEB", LOG_SUCCESS, "Web server started");
}

/**
 * GET /
 * Sirve la página HTML/CSS/JS de configuración responsiva y profesional
 */
void handleWebRoot() {
  // Si ya está configurado, mostrar página de éxito
  if (deviceId > 0) {
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
  
  String html = R"(
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
      <p>Conecta tu dispositivo al WiFi y vinculalo</p>
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
        <label for="pairingCode">Código de Vinculación</label>
        <input type="text" id="pairingCode" name="pairingCode" 
               placeholder="000000" pattern="[0-9]{6}" maxlength="6" required>
        <div class="info-text">6 dígitos (del dispositivo creado)</div>
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
      if (!pairingCode || pairingCode.length !== 6 || !/^\d{6}$/.test(pairingCode)) {
        showStatus('Codigo debe ser 6 digitos', 'error');
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
          errorMsg = 'Codigo de vinculación invalido o expirado';
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
  )";

  server.send(200, "text/html; charset=utf-8", html);
}

/**
 * POST /configure
 * Recibe { ssid, password, pairingCode }
 * Intenta conectar a WiFi y hacer pairing con reintentos
 */
void handleConfigure() {
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

  if (pairingCode.isEmpty() || pairingCode.length() != 6 || !isNumeric(pairingCode)) {
    server.send(400, "application/json", "{\"error\":\"Pairing code must be 6 digits\"}");
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
    server.send(400, "application/json", "{\"error\":\"Pairing failed. Invalid or expired code.\"}");
    return;
  }

  preferences.begin("pzem_config", false);
  preferences.putInt("deviceId", deviceId);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.putString("pairingCode", pairingCode);
  preferences.end();

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
      
      if (!connectToWifiWithRetry(wifiSSID, wifiPassword, MAX_WIFI_RETRIES, false)) {
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
      logMessage("MODE", LOG_ERROR, "Device not found");
      WiFi.disconnect();
      resetConfiguration();
      startConfigurationMode();
      configurationMode = true;
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
  WiFi.begin(ssid.c_str(), password.c_str());

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
      WiFi.disconnect();
      resetConfiguration();
      startConfigurationMode();
      configurationMode = true;
      logMessage("MODE", LOG_SUCCESS, "Now in configuration mode");
    }
  } else if (httpCode == 401 || httpCode == 403) {
    logMessage("SEND", LOG_ERROR, "HTTP %d - Authentication error (Token invalid?)", httpCode);
  } else if (httpCode == 404) {
    logMessage("SEND", LOG_ERROR, "HTTP 404 - Device not found");
    WiFi.disconnect();
    resetConfiguration();
    startConfigurationMode();
    configurationMode = true;
    logMessage("MODE", LOG_SUCCESS, "Now in configuration mode");
  } else if (httpCode == 409) {
    logMessage("SEND", LOG_ERROR, "HTTP 409 - Conflict");
    WiFi.disconnect();
    resetConfiguration();
    startConfigurationMode();
    configurationMode = true;
    logMessage("MODE", LOG_SUCCESS, "Now in configuration mode");
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
void resetConfiguration() {
  logMessage("RESET", LOG_WARN, "Clearing config");
  preferences.begin("pzem_config", false);
  preferences.clear();
  preferences.end();
  deviceId = 0;
  wifiSSID = "";
  wifiPassword = "";
  pairingCodeStored = "";
  configurationMode = true;
  logMessage("RESET", LOG_SUCCESS, "Config cleared");
}
