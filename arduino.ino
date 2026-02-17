#include <WiFi.h>
#include <HTTPClient.h>
#include <WebServer.h>
#include <PZEM004Tv30.h>
#include <Preferences.h>
#include <time.h>

// ============== CONFIGURACIÓN GENERAL ==============
#define BACKEND_URL_BASE          "http://217.71.203.129/api/v1"
#define BACKEND_URL_READINGS      "http://217.71.203.129/api/v1/readings"
#define AP_SSID                   "PZEM-Setup"
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
int consecutiveReadingFailures = 0;
int consecutiveHttpFailures = 0;

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
    case LOG_INFO:    prefix = "ℹ️  "; break;
    case LOG_WARN:    prefix = "⚠️  "; break;
    case LOG_ERROR:   prefix = "❌ "; break;
    case LOG_SUCCESS: prefix = "✅ "; break;
  }

  Serial.printf("[%s] %s%s\n", tag, prefix, buffer);
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n╔════════════════════════════════════════════════════╗");
  Serial.println("║    ESP32 PZEM Power Monitor v3.1 (Professional)    ║");
  Serial.println("║              Firmware Initialization                ║");
  Serial.println("╚════════════════════════════════════════════════════╝\n");

  // Cargar configuración guardada
  preferences.begin("pzem_config", false);
  deviceId = preferences.getInt("deviceId", 0);
  wifiSSID = preferences.getString("ssid", "");
  wifiPassword = preferences.getString("password", "");
  pairingCodeStored = preferences.getString("pairingCode", "");
  preferences.end();

  logMessage("INIT", LOG_INFO, "Loaded configuration: deviceId=%d, SSID=%s", deviceId, wifiSSID.c_str());

  // Inicializar PZEM
  Serial2.begin(PZEM_BAUD_RATE, SERIAL_8N1, RXD2, TXD2);
  logMessage("PZEM", LOG_INFO, "Serial initialized (BAUD=%d)", PZEM_BAUD_RATE);
  
  // Esperar a que el sensor se estabilice
  delay(2000);
  logMessage("PZEM", LOG_INFO, "Waiting for sensor to stabilize...");

  // Determinar modo
  if (deviceId == 0) {
    configurationMode = true;
    logMessage("MODE", LOG_WARN, "Configuration mode (no deviceId found)");
    logMessage("MODE", LOG_INFO, "AP: SSID=%s, Password=%s", AP_SSID, AP_PASSWORD);
    logMessage("MODE", LOG_INFO, "Web: http://192.168.4.1");
    startConfigurationMode();
  } else {
    configurationMode = false;
    logMessage("MODE", LOG_SUCCESS, "Normal mode (deviceId=%d)", deviceId);
    
  // Prueba inicial del sensor
    logMessage("PZEM", LOG_INFO, "Testing sensor communication...");
    float testVoltage = pzem.voltage();
    float testCurrent = pzem.current();
    float testPower = pzem.power();
    
    // Si alguna lectura es válida, el sensor está respondiendo
    if (!isnan(testVoltage) || !isnan(testCurrent) || !isnan(testPower)) {
      sensorHealthy = true;
      logMessage("PZEM", LOG_SUCCESS, "Sensor OK - V=%.2fV I=%.2fA P=%.2fW", testVoltage, testCurrent, testPower);
    } else {
      sensorHealthy = false;
      logMessage("PZEM", LOG_ERROR, "Sensor NOT responding!");
      logMessage("PZEM", LOG_ERROR, "REVISAR: RXD2(pin16), TXD2(pin17), conexión serial y voltaje");
      logMessage("PZEM", LOG_ERROR, "Reiniciando en 5 segundos...");
      Serial2.end();
      delay(5000);
      ESP.restart();
    }
    
    logMessage("WIFI", LOG_INFO, "Attempting to connect to: %s", wifiSSID.c_str());
    
    if (!connectToWifiWithRetry(wifiSSID, wifiPassword, MAX_WIFI_RETRIES)) {
      logMessage("WIFI", LOG_ERROR, "Failed after %d retries. Restarting...", MAX_WIFI_RETRIES);
      delay(3000);
      ESP.restart();
    }
    
    logMessage("NTP", LOG_INFO, "Syncing time with NTP server...");
    configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
    delay(2000);
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

/**
 * MODO CONFIGURACIÓN - Iniciar Access Point y servidor web
 */
void startConfigurationMode() {
  // Desactivar STA y activar AP
  WiFi.mode(WIFI_AP_STA);
  delay(100);

  // Iniciar Access Point
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    logMessage("AP", LOG_ERROR, "Failed to start Access Point");
    delay(3000);
    ESP.restart();
  }

  IPAddress apIP = WiFi.softAPIP();
  logMessage("AP", LOG_SUCCESS, "Access Point started");
  logMessage("AP", LOG_INFO, "IP: %s", apIP.toString().c_str());
  logMessage("AP", LOG_INFO, "SSID: %s", AP_SSID);
  logMessage("AP", LOG_INFO, "Password: %s", AP_PASSWORD);

  // Configurar rutas del servidor web
  server.on("/", HTTP_GET, handleWebRoot);
  server.on("/configure", HTTP_POST, handleConfigure);

  server.onNotFound([]() {
    server.send(404, "text/plain", "Not found");
  });

  // Iniciar servidor web
  server.begin();
  logMessage("WEB", LOG_SUCCESS, "Web server started on port 80");
  logMessage("WEB", LOG_INFO, "Open: http://192.168.4.1");
}

/**
 * GET /
 * Sirve la página HTML/CSS/JS de configuración responsiva y profesional
 */
void handleWebRoot() {
  // Si ya está configurado, mostrar página de éxito
  if (deviceId > 0) {
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
    server.send(200, "text/html; charset=utf-8", successHtml);
    return;
  }

  // Página de configuración
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
        showStatus('⚠️ SSID inválido', 'error');
        return;
      }
      if (!password || password.length < 8 || password.length > 64) {
        showStatus('⚠️ Contraseña debe tener 8-64 caracteres', 'error');
        return;
      }
      if (!pairingCode || pairingCode.length !== 6 || !/^\d{6}$/.test(pairingCode)) {
        showStatus('⚠️ Código debe ser 6 dígitos', 'error');
        return;
      }

      submitBtn.disabled = true;
      showStatus('<span class="spinner"></span>Configurando dispositivo...', 'loading');

      try {
        const response = await fetch('/configure', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeout: 60000,
          body: JSON.stringify({ ssid, password, pairingCode })
        });

        const data = await response.json();

        if (response.ok) {
          showStatus('✅ Éxito! Dispositivo reiniciando...', 'success');
          setTimeout(() => { window.location.reload(); }, 3000);
        } else {
          showStatus('❌ ' + (data.error || data.message || 'Error en configuración'), 'error');
          submitBtn.disabled = false;
        }
      } catch (error) {
        showStatus('❌ Error: ' + error.message, 'error');
        submitBtn.disabled = false;
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

  // Extraer y validar campos
  String ssid = extractJsonString(body, "ssid");
  String password = extractJsonString(body, "password");
  String pairingCode = extractJsonString(body, "pairingCode");

  // Validaciones
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

  logMessage("CONFIG", LOG_INFO, "Configuration request: SSID=%s, Code=%s", ssid.c_str(), pairingCode.c_str());

  // Cambiar a modo STA
  WiFi.mode(WIFI_STA);
  delay(100);

  // Conectar a WiFi con reintentos
  if (!connectToWifiWithRetry(ssid, password, MAX_WIFI_RETRIES)) {
    logMessage("CONFIG", LOG_ERROR, "WiFi connection failed");
    WiFi.mode(WIFI_AP);
    server.send(400, "application/json", "{\"error\":\"WiFi connection failed\"}");
    return;
  }

  logMessage("CONFIG", LOG_SUCCESS, "WiFi connected, syncing NTP...");
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  delay(2000);

  // Hacer pairing con reintentos
  if (!pairDeviceWithRetry(pairingCode, MAX_PAIRING_RETRIES)) {
    logMessage("CONFIG", LOG_ERROR, "Pairing failed");
    WiFi.mode(WIFI_AP);
    server.send(400, "application/json", "{\"error\":\"Pairing failed. Invalid or expired code.\"}");
    return;
  }

  // Guardar configuración en persistencia
  preferences.begin("pzem_config", false);
  preferences.putInt("deviceId", deviceId);
  preferences.putString("ssid", ssid);
  preferences.putString("password", password);
  preferences.putString("pairingCode", pairingCode);
  preferences.end();

  logMessage("CONFIG", LOG_SUCCESS, "Configuration saved. DeviceId=%d", deviceId);
  logMessage("CONFIG", LOG_INFO, "Restarting in normal mode...");

  server.send(200, "application/json", "{\"success\":true,\"deviceId\":" + String(deviceId) + "}");

  delay(1500);
  ESP.restart();
}

/**
 * Verificar si un string contiene solo dígitos
 */
bool isNumeric(String str) {
  for (int i = 0; i < str.length(); i++) {
    if (!isdigit(str[i])) return false;
  }
  return true;
}



/**
 * Extrae un valor string de un JSON simple
 * Ejemplo: extractJsonString("{\"ssid\":\"MiWiFi\"}", "ssid") -> "MiWiFi"
 */
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


/**
 * MODO NORMAL - Lectura periódica y envío al backend
 */
void handleNormalMode() {
  // Sincronizar WiFi
  unsigned long now = millis();
  
  if (WiFi.status() != WL_CONNECTED) {
    if (now - lastWifiReconnectAttempt >= WIFI_RECONNECT_INTERVAL) {
      logMessage("WIFI", LOG_WARN, "Disconnected. Attempting reconnect...");
      lastWifiReconnectAttempt = now;
      
      if (!connectToWifiWithRetry(wifiSSID, wifiPassword, MAX_WIFI_RETRIES)) {
        logMessage("WIFI", LOG_ERROR, "Reconnect failed. Retry in %ds", WIFI_RECONNECT_INTERVAL / 1000);
        return;
      }
    }
    return;
  }

  // Lectura periódica
  if (now - lastReadingTime >= READING_INTERVAL) {
    lastReadingTime = now;
    readAndSendSensorData();
  }

  delay(100); // Evitar busy loop
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
    logMessage("SENSOR", LOG_ERROR, "Invalid reading (NaN). Failures: %d/5", consecutiveReadingFailures);
    
    // Debug: mostrar qué valores son válidos
    if (!isnan(voltaje)) logMessage("SENSOR", LOG_INFO, "  V=%.2f ✓", voltaje);
    if (!isnan(corriente)) logMessage("SENSOR", LOG_INFO, "  I=%.3f ✓", corriente);
    if (!isnan(potencia)) logMessage("SENSOR", LOG_INFO, "  P=%.2f ✓", potencia);
    if (isnan(voltaje)) logMessage("SENSOR", LOG_WARN, "  V=NaN ✗");
    if (isnan(corriente)) logMessage("SENSOR", LOG_WARN, "  I=NaN ✗");
    if (isnan(potencia)) logMessage("SENSOR", LOG_WARN, "  P=NaN ✗");
    
    if (consecutiveReadingFailures >= 5) {
      logMessage("SENSOR", LOG_ERROR, "Too many failures. Restarting...");
      delay(1000);
      ESP.restart();
    }
    return;
  }

  consecutiveReadingFailures = 0;

  // Mostrar datos leídos
  Serial.println("\n╔══════════════════════════════════════╗");
  Serial.println("║         MEDICIÓN DEL SENSOR (PZEM)   ║");
  Serial.printf("║  Voltaje:        %7.2f V           ║\n", voltaje);
  Serial.printf("║  Corriente:      %7.3f A           ║\n", corriente);
  Serial.printf("║  Potencia:       %7.2f W           ║\n", potencia);
  Serial.printf("║  Energía:        %7.2f Wh          ║\n", energia);
  Serial.printf("║  Frecuencia:     %7.2f Hz          ║\n", frecuencia);
  Serial.printf("║  Factor Potencia:%7.2f             ║\n", pf);
  Serial.printf("║  Lectura: %ldms                       ║\n", sensorReadTime);
  Serial.println("╚══════════════════════════════════════╝\n");

  // Enviar con reintentos
  if (!sendReadingWithRetry(voltaje, corriente, potencia, energia, frecuencia, pf, MAX_HTTP_RETRIES)) {
    logMessage("SEND", LOG_ERROR, "Failed to send reading after retries");
    consecutiveHttpFailures++;
  } else {
    consecutiveHttpFailures = 0;
  }
}

// ============== WIFI ==============

/**
 * Conectar a WiFi con reintentos y backoff exponencial
 */
bool connectToWifiWithRetry(String ssid, String password, int maxRetries) {
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    logMessage("WIFI", LOG_INFO, "Connect attempt %d/%d to '%s'", attempt, maxRetries, ssid.c_str());
    
    if (connectToWiFi(ssid, password)) {
      logMessage("WIFI", LOG_SUCCESS, "Connected successfully");
      return true;
    }

    if (attempt < maxRetries) {
      unsigned long backoffTime = 1000 * attempt * RETRY_BACKOFF_FACTOR;
      logMessage("WIFI", LOG_WARN, "Retrying in %lds...", backoffTime / 1000);
      delay(backoffTime);
    }
  }

  return false;
}

/**
 * Conectar a WiFi (intento único)
 */
bool connectToWiFi(String ssid, String password) {
  WiFi.mode(WIFI_STA);
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
    if (++dotCount % 20 == 0) Serial.print("\n  ");
  }

  Serial.println(" [OK]");
  logMessage("WIFI", LOG_SUCCESS, "IP: %s", WiFi.localIP().toString().c_str());
  return true;
}

// ============== PAIRING ==============

/**
 * Emparejar con reintentos y backoff
 */
bool pairDeviceWithRetry(String pairingCode, int maxRetries) {
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    logMessage("PAIR", LOG_INFO, "Pairing attempt %d/%d", attempt, maxRetries);
    
    if (pairDevice(pairingCode)) {
      logMessage("PAIR", LOG_SUCCESS, "Pairing successful");
      return true;
    }

    if (attempt < maxRetries) {
      unsigned long backoffTime = 2000 * attempt * RETRY_BACKOFF_FACTOR;
      logMessage("PAIR", LOG_WARN, "Retrying in %lds...", backoffTime / 1000);
      delay(backoffTime);
    }
  }

  return false;
}

/**
 * Hacer pairing (intento único)
 */
bool pairDevice(String pairingCode) {
  if (WiFi.status() != WL_CONNECTED) {
    logMessage("PAIR", LOG_ERROR, "WiFi not connected");
    return false;
  }

  String macAddress = WiFi.macAddress();
  HTTPClient http;
  String url = String(BACKEND_URL_BASE) + "/devices/pair";

  http.setTimeout(HTTP_TIMEOUT);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  String payload = "{\"pairingCode\":\"" + pairingCode + "\",\"macAddress\":\"" + macAddress + "\"}";

  logMessage("PAIR", LOG_INFO, "POST %s", url.c_str());
  logMessage("PAIR", LOG_INFO, "Code=%s, MAC=%s", pairingCode.c_str(), macAddress.c_str());

  int httpCode = http.POST(payload);
  String response = http.getString();

  if (httpCode == 200) {
    logMessage("PAIR", LOG_SUCCESS, "HTTP 200 - Parsing response");
    logMessage("PAIR", LOG_INFO, "Response: %s", response.c_str());

    int deviceIdPos = response.indexOf("\"deviceId\":");
    if (deviceIdPos != -1) {
      int colonPos = response.indexOf(":", deviceIdPos);
      int endPos = response.indexOf(",", colonPos);
      if (endPos == -1) endPos = response.indexOf("}", colonPos);

      String deviceIdStr = response.substring(colonPos + 1, endPos);
      deviceIdStr.trim();
      logMessage("PAIR", LOG_INFO, "Parsed deviceIdStr: '%s'", deviceIdStr.c_str());
      
      int newDeviceId = deviceIdStr.toInt();
      logMessage("PAIR", LOG_INFO, "Converted to int: %d", newDeviceId);

      if (newDeviceId > 0) {
        deviceId = newDeviceId;
        logMessage("PAIR", LOG_SUCCESS, "DeviceId obtained: %d", deviceId);
        http.end();
        return true;
      } else {
        logMessage("PAIR", LOG_ERROR, "Parsed deviceId is not positive: %d", newDeviceId);
      }
    } else {
      logMessage("PAIR", LOG_ERROR, "Could not find \"deviceId\" in response");
    }
    logMessage("PAIR", LOG_ERROR, "Valid response but no deviceId found");
  } else if (httpCode == 400) {
    logMessage("PAIR", LOG_ERROR, "HTTP 400 - Invalid pairing code or already used");
  } else if (httpCode == 404) {
    logMessage("PAIR", LOG_ERROR, "HTTP 404 - Endpoint not found. Backend updated?");
  } else if (httpCode == 500) {
    logMessage("PAIR", LOG_ERROR, "HTTP 500 - Server error. Check backend logs");
  } else if (httpCode == -1) {
    logMessage("PAIR", LOG_ERROR, "HTTP -1 - Connection error");
    logMessage("PAIR", LOG_ERROR, "Check: BACKEND_URL, firewall, server running");
  } else {
    logMessage("PAIR", LOG_ERROR, "HTTP %d - Unexpected error", httpCode);
  }

  http.end();
  return false;
}

// ============== LECTURAS ==============

/**
 * Enviar lectura con reintentos
 */
bool sendReadingWithRetry(float voltaje, float corriente, float potencia, 
                           float energia, float frecuencia, float pf, int maxRetries) {
  for (int attempt = 1; attempt <= maxRetries; attempt++) {
    logMessage("SEND", LOG_INFO, "Send attempt %d/%d", attempt, maxRetries);
    
    if (sendReading(voltaje, corriente, potencia, energia, frecuencia, pf)) {
      logMessage("SEND", LOG_SUCCESS, "Reading sent successfully");
      return true;
    }

    if (attempt < maxRetries) {
      unsigned long backoffTime = 1000 * attempt;
      logMessage("SEND", LOG_WARN, "Retry in %lds...", backoffTime / 1000);
      delay(backoffTime);
    }
  }

  return false;
}

/**
 * Enviar lectura (intento único) con timeout
 */
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

  // Construir payload con todos los campos requeridos
  String payload = "{";
  payload += "\"deviceId\":" + String(deviceId) + ",";
  payload += "\"voltage\":" + String(voltaje, 2) + ",";
  payload += "\"current\":" + String(corriente, 3) + ",";
  payload += "\"powerWatts\":" + String(potencia, 2) + ",";
  payload += "\"energy\":" + String(energia, 2) + ",";
  payload += "\"frequency\":" + String(frecuencia, 2) + ",";
  payload += "\"powerFactor\":" + String(pf, 2) + ",";
  payload += "\"timestamp\":\"" + getISO8601Time() + "\"";
  payload += "}";

  logMessage("SEND", LOG_INFO, "Payload: %s", payload.c_str());
  logMessage("SEND", LOG_INFO, "DeviceId value: %d", deviceId);

  unsigned long startTime = millis();
  int httpCode = http.POST(payload);
  unsigned long sendTime = millis() - startTime;

  logMessage("SEND", LOG_INFO, "HTTP %d (%ldms)", httpCode, sendTime);

  if (httpCode == 202 || httpCode == 200) {
    logMessage("SEND", LOG_SUCCESS, "Backend accepted reading");
  } else if (httpCode == 400) {
    String response = http.getString();
    logMessage("SEND", LOG_ERROR, "HTTP 400 - Invalid data: %s", response.c_str());
    
    // Si el deviceId no existe en el backend, resetear configuración
    if (response.indexOf("deviceId") != -1 || response.indexOf("Device not found") != -1) {
      logMessage("SEND", LOG_WARN, "DeviceId %d not found in backend. Resetting configuration...", deviceId);
      resetConfiguration();
      delay(2000);
      ESP.restart();
    }
  } else if (httpCode == 401 || httpCode == 403) {
    logMessage("SEND", LOG_ERROR, "HTTP %d - Authentication error (Token invalid?)", httpCode);
  } else if (httpCode == 404) {
    logMessage("SEND", LOG_ERROR, "HTTP 404 - Device not found in backend. Resetting configuration...");
    resetConfiguration();
    delay(2000);
    ESP.restart();
  } else if (httpCode == 500) {
    logMessage("SEND", LOG_ERROR, "HTTP 500 - Backend error. Check server logs");
  } else if (httpCode == -1) {
    logMessage("SEND", LOG_ERROR, "HTTP -1 - Connection timeout (%dms)", HTTP_TIMEOUT);
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
  logMessage("RESET", LOG_WARN, "Clearing all saved configuration...");
  
  preferences.begin("pzem_config", false);
  preferences.clear(); // Borra todo el namespace
  preferences.end();
  
  // Resetear variables globales
  deviceId = 0;
  wifiSSID = "";
  wifiPassword = "";
  pairingCodeStored = "";
  configurationMode = true;
  
  logMessage("RESET", LOG_SUCCESS, "Configuration cleared. Will restart in AP mode.");
}
