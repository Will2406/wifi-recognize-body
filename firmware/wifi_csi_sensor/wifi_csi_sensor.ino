/*
 * WiFi Sense Lab — CSI Sensor Firmware
 * =====================================
 * ESP32-WROOM-32 DevKit v1
 * Arduino ESP32 Core 3.x (ESP-IDF 5.x)
 *
 * Captures WiFi Channel State Information (CSI) and outputs
 * subcarrier amplitudes over serial in CSV format.
 *
 * Network-agnostic: works with ANY 2.4GHz WiFi access point.
 *
 * Boot sequence:
 *   1. Serial init at 921600 baud
 *   2. Scan available 2.4GHz APs (helps user pick SSID)
 *   3. Connect to configured WiFi SSID
 *   4. Register CSI callback
 *   5. Loop: keep-alive + LED status blink
 *
 * Serial output lines:
 *   INFO,<message>
 *   AP,<index>,<ssid>,<mac>,<rssi>,<channel>
 *   CSI,<timestamp_ms>,<mac_src>,<rssi>,<channel>,<num_subcarriers>,<amp1>,<amp2>,...
 */

#include <WiFi.h>
#include "esp_wifi.h"
#include <math.h>

// ============================================================
// USER CONFIGURATION — Change these for your network
// ============================================================
#define WIFI_SSID     "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ============================================================
// HARDWARE / PROTOCOL SETTINGS
// ============================================================
#define SERIAL_BAUD   921600
#define LED_PIN       2        // Built-in LED on most ESP32 DevKit boards

// ============================================================
// TIMING
// ============================================================
#define WIFI_CONNECT_TIMEOUT_MS  10000
#define WIFI_RETRY_BASE_MS       1000
#define WIFI_RETRY_MAX_MS        30000
#define LED_BLINK_CONNECTING_MS  200
#define LED_BLINK_CAPTURING_MS   1000

// ============================================================
// GLOBALS
// ============================================================
static bool wifi_connected = false;
static bool csi_registered = false;
static unsigned long last_led_toggle = 0;
static bool led_state = false;
static unsigned long csi_packet_count = 0;
static unsigned long last_stats_print = 0;

// ============================================================
// FORWARD DECLARATIONS
// ============================================================
void scan_aps();
bool connect_wifi();
void register_csi();
void wifi_csi_callback(void *ctx, wifi_csi_info_t *info);
void update_led();
void print_mac(const uint8_t *mac, char *buf);

// ============================================================
// SETUP
// ============================================================
void setup() {
  // 1. Serial init
  Serial.begin(SERIAL_BAUD);
  delay(500);

  Serial.println();
  Serial.println("INFO,========================================");
  Serial.println("INFO,WiFi Sense Lab — CSI Sensor v1.0");
  Serial.println("INFO,========================================");
  Serial.printf("INFO,Chip: %s | Cores: %d | Freq: %d MHz\n",
                ESP.getChipModel(), ESP.getChipCores(), ESP.getCpuFreqMHz());
  Serial.printf("INFO,Flash: %d MB | Free heap: %d bytes\n",
                ESP.getFlashChipSize() / (1024 * 1024), ESP.getFreeHeap());
  Serial.println();

  // Configure LED
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // 2. Scan available APs
  scan_aps();

  // 3. Connect to WiFi
  Serial.println();
  Serial.printf("INFO,Connecting to SSID: %s\n", WIFI_SSID);

  if (connect_wifi()) {
    Serial.println("INFO,WiFi connected successfully!");
    Serial.printf("INFO,IP: %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("INFO,Channel: %d\n", WiFi.channel());
    Serial.printf("INFO,RSSI: %d dBm\n", WiFi.RSSI());

    // Print connected AP's BSSID
    char bssid_str[18];
    uint8_t *bssid = WiFi.BSSID();
    print_mac(bssid, bssid_str);
    Serial.printf("INFO,BSSID: %s\n", bssid_str);

    wifi_connected = true;
  } else {
    Serial.println("INFO,WARNING: WiFi connection failed — will keep retrying in loop");
    wifi_connected = false;
  }

  // 4. Register CSI callback (only if connected)
  if (wifi_connected) {
    register_csi();
  }

  Serial.println();
  Serial.println("INFO,Setup complete. Entering main loop...");
  Serial.println("INFO,CSI data lines begin with 'CSI,'");
  Serial.println();

  last_stats_print = millis();
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  // Auto-reconnect if WiFi drops
  if (WiFi.status() != WL_CONNECTED) {
    if (wifi_connected) {
      Serial.println("INFO,WiFi disconnected! Attempting reconnect...");
      wifi_connected = false;
      csi_registered = false;
    }

    // Try to reconnect
    if (connect_wifi()) {
      Serial.println("INFO,WiFi reconnected!");
      wifi_connected = true;
      register_csi();
    }
  }

  // Print throughput stats every 10 seconds
  unsigned long now = millis();
  if (now - last_stats_print >= 10000) {
    float pps = (float)csi_packet_count / ((now - last_stats_print) / 1000.0);
    Serial.printf("INFO,CSI stats: %.1f pkt/s (total %lu in last 10s)\n", pps, csi_packet_count);
    csi_packet_count = 0;
    last_stats_print = now;
  }

  // LED status indicator
  update_led();

  delay(10);  // Small delay to prevent watchdog issues
}

// ============================================================
// AP SCANNER
// ============================================================
void scan_aps() {
  Serial.println("INFO,Scanning 2.4GHz networks...");

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  int num_networks = WiFi.scanNetworks();

  if (num_networks == 0) {
    Serial.println("INFO,No networks found");
    return;
  }

  Serial.printf("INFO,Found %d networks:\n", num_networks);

  for (int i = 0; i < num_networks; i++) {
    // Get BSSID as string
    char mac_str[18];
    uint8_t *bssid = WiFi.BSSID(i);
    print_mac(bssid, mac_str);

    // Only show 2.4GHz networks (channels 1-14)
    int ch = WiFi.channel(i);
    if (ch >= 1 && ch <= 14) {
      Serial.printf("AP,%d,%s,%s,%d,%d\n",
                     i,
                     WiFi.SSID(i).c_str(),
                     mac_str,
                     WiFi.RSSI(i),
                     ch);
    }
  }

  WiFi.scanDelete();
}

// ============================================================
// WIFI CONNECTION WITH EXPONENTIAL BACKOFF
// ============================================================
bool connect_wifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  int attempt = 0;
  unsigned long retry_delay = WIFI_RETRY_BASE_MS;

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");

    // Check timeout for this attempt
    if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
      attempt++;
      if (attempt >= 5) {
        Serial.println();
        Serial.printf("INFO,Connection failed after %d attempts\n", attempt);
        return false;
      }

      Serial.println();
      Serial.printf("INFO,Attempt %d failed, retrying in %lu ms...\n", attempt, retry_delay);
      delay(retry_delay);

      // Exponential backoff
      retry_delay = min(retry_delay * 2, (unsigned long)WIFI_RETRY_MAX_MS);

      // Restart connection
      WiFi.disconnect();
      delay(100);
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      start = millis();
    }

    // Blink LED fast while connecting
    if (millis() - last_led_toggle > LED_BLINK_CONNECTING_MS) {
      led_state = !led_state;
      digitalWrite(LED_PIN, led_state ? HIGH : LOW);
      last_led_toggle = millis();
    }
  }

  Serial.println();
  return true;
}

// ============================================================
// CSI CALLBACK REGISTRATION
// ============================================================
void register_csi() {
  if (csi_registered) return;

  // Configure which CSI data to capture
  wifi_csi_config_t csi_config;
  csi_config.lltf_en = true;     // Legacy Long Training Field
  csi_config.htltf_en = true;    // HT Long Training Field
  csi_config.stbc_htltf2_en = true;
  csi_config.ltf_merge_en = true;
  csi_config.channel_filter_en = false;  // Get raw data
  csi_config.manu_scale = false;

  // Enable CSI collection
  esp_err_t err;

  err = esp_wifi_set_csi(true);
  if (err != ESP_OK) {
    Serial.printf("INFO,ERROR: esp_wifi_set_csi failed: %s\n", esp_err_to_name(err));
    return;
  }

  err = esp_wifi_set_csi_config(&csi_config);
  if (err != ESP_OK) {
    Serial.printf("INFO,ERROR: esp_wifi_set_csi_config failed: %s\n", esp_err_to_name(err));
    return;
  }

  err = esp_wifi_set_csi_rx_cb(wifi_csi_callback, NULL);
  if (err != ESP_OK) {
    Serial.printf("INFO,ERROR: esp_wifi_set_csi_rx_cb failed: %s\n", esp_err_to_name(err));
    return;
  }

  csi_registered = true;
  Serial.println("INFO,CSI callback registered successfully");
}

// ============================================================
// CSI CALLBACK — Called on every WiFi packet with CSI data
// ============================================================
void wifi_csi_callback(void *ctx, wifi_csi_info_t *info) {
  if (!info || !info->buf) return;

  // Extract metadata
  unsigned long timestamp = millis();
  int rssi = info->rx_ctrl.rssi;
  int channel = info->rx_ctrl.channel;
  int data_len = info->len;

  // Source MAC address
  char mac_str[18];
  print_mac(info->mac, mac_str);

  // CSI buffer contains pairs of [imaginary, real] int8 values
  // Each pair represents one subcarrier
  int num_subcarriers = data_len / 2;

  if (num_subcarriers <= 0) return;

  // Start building the output line
  // Format: CSI,<timestamp>,<mac>,<rssi>,<channel>,<num_subcarriers>,<amp1>,<amp2>,...
  Serial.printf("CSI,%lu,%s,%d,%d,%d",
                timestamp, mac_str, rssi, channel, num_subcarriers);

  // Calculate amplitude for each subcarrier: sqrt(real^2 + imag^2)
  int8_t *buf = (int8_t *)info->buf;
  for (int i = 0; i < num_subcarriers; i++) {
    int8_t imag = buf[i * 2];
    int8_t real = buf[i * 2 + 1];
    // Use integer approximation for speed: |amplitude| ~ max(|r|,|i|) + min(|r|,|i|)/2
    // Or use proper sqrt for accuracy
    int amplitude = (int)sqrtf((float)(real * real + imag * imag));
    Serial.printf(",%d", amplitude);
  }

  Serial.println();

  // Track packet count for stats
  csi_packet_count++;
}

// ============================================================
// LED STATUS INDICATOR
// ============================================================
void update_led() {
  unsigned long interval;

  if (!wifi_connected) {
    interval = LED_BLINK_CONNECTING_MS;  // Fast blink: connecting
  } else if (csi_registered) {
    interval = LED_BLINK_CAPTURING_MS;   // Slow blink: connected + capturing
  } else {
    interval = 500;                       // Medium blink: connected, no CSI
  }

  if (millis() - last_led_toggle > interval) {
    led_state = !led_state;
    digitalWrite(LED_PIN, led_state ? HIGH : LOW);
    last_led_toggle = millis();
  }
}

// ============================================================
// UTILITY: Format MAC address as string
// ============================================================
void print_mac(const uint8_t *mac, char *buf) {
  sprintf(buf, "%02X:%02X:%02X:%02X:%02X:%02X",
          mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}
