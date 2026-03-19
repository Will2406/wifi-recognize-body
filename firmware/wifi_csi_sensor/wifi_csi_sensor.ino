/*
 * WiFi Sense Lab — CSI Sensor Firmware v2.0
 * ==========================================
 * ESP32-WROOM-32 DevKit v1
 * Arduino ESP32 Core 3.x (ESP-IDF 5.x)
 *
 * Captures WiFi Channel State Information (CSI) and outputs
 * subcarrier amplitudes over serial in CSV format.
 *
 * Network-agnostic: works with ANY 2.4GHz WiFi access point.
 * Uses serial commands (CMD:/RSP: protocol) for network configuration —
 * no credentials are hardcoded in the source code.
 *
 * Boot sequence:
 *   1. Serial init at 921600 baud
 *   2. Check for saved WiFi credentials (Preferences/NVS)
 *   3. If saved credentials → attempt connection
 *   4. If no credentials or connection fails → wait for CMD:WIFI_SET
 *   5. Once connected → register CSI callback
 *   6. Loop: serial commands + heartbeat + reconnect + LED status
 *
 * Serial protocol:
 *   Commands IN:   CMD:WIFI_SCAN | CMD:WIFI_SET,ssid_b64,pass_b64 | CMD:WIFI_STATUS | CMD:WIFI_RESET
 *   Responses OUT: RSP:<response>
 *   CSI data:      CSI,<timestamp_ms>,<mac_src>,<rssi>,<channel>,<num_subcarriers>,<amp1>,<amp2>,...
 *   Heartbeat:     HB,<timestamp_ms>,<free_heap>,<wifi_status>
 *   Info:          INFO,<message>
 *   AP scan line:  AP,<index>,<ssid>,<mac>,<rssi>,<channel>
 *
 * To reset saved WiFi: hold BOOT button for 5+ seconds at startup
 */

#include <WiFi.h>
#include <Preferences.h>
#include "esp_wifi.h"
#include <math.h>

// ============================================================
// SETTINGS
// ============================================================
#define SERIAL_BAUD           921600
#define LED_PIN               2
#define BOOT_PIN              0         // BOOT button on most DevKit boards
#define WIFI_CONNECT_TIMEOUT  15000     // 15 seconds per attempt
#define RESET_HOLD_MS         5000      // Hold BOOT 5s to reset WiFi
#define LED_FAST_MS           150       // Fast blink: waiting for config
#define LED_SLOW_MS           1000      // Slow blink: capturing CSI
#define LED_MEDIUM_MS         500       // Medium blink: connecting
#define HEARTBEAT_INTERVAL_MS 5000     // Heartbeat every 5 seconds

// ============================================================
// GLOBALS
// ============================================================
Preferences prefs;

static String saved_ssid = "";
static String saved_pass = "";
static bool wifi_connected = false;
static bool csi_registered = false;
static unsigned long last_led_toggle = 0;
static bool led_state = false;
static unsigned long csi_packet_count = 0;
static unsigned long last_stats_print = 0;
static unsigned long last_heartbeat = 0;

// ============================================================
// FORWARD DECLARATIONS
// ============================================================
void load_credentials();
void save_credentials(String ssid, String pass);
void clear_credentials();
bool connect_wifi(String ssid, String pass);
void process_command(String cmd);
void cmd_wifi_scan();
void cmd_wifi_set(String args);
void cmd_wifi_status();
void cmd_wifi_reset();
int  base64_decode(const char *input, char *output, int max_len);
void register_csi();
void wifi_csi_callback(void *ctx, wifi_csi_info_t *info);
void update_led();
void print_mac(const uint8_t *mac, char *buf);
bool check_reset_button();

// ============================================================
// BASE64 DECODER
// ============================================================
static const int B64_LOOKUP[] = {
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,
  -1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,62,-1,-1,-1,63,
  52,53,54,55,56,57,58,59,60,61,-1,-1,-1,-1,-1,-1,
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9,10,11,12,13,14,
  15,16,17,18,19,20,21,22,23,24,25,-1,-1,-1,-1,-1,
  -1,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,
  41,42,43,44,45,46,47,48,49,50,51,-1,-1,-1,-1,-1
};

int base64_decode(const char *input, char *output, int max_len) {
  int len = strlen(input);
  int out_idx = 0;

  for (int i = 0; i < len; i += 4) {
    int vals[4] = {0, 0, 0, 0};
    int pad = 0;

    for (int j = 0; j < 4 && (i + j) < len; j++) {
      char c = input[i + j];
      if (c == '=') {
        pad++;
        vals[j] = 0;
      } else if (c >= 0 && c < 128) {
        vals[j] = B64_LOOKUP[(int)c];
        if (vals[j] < 0) vals[j] = 0;
      }
    }

    int triple = (vals[0] << 18) | (vals[1] << 12) | (vals[2] << 6) | vals[3];

    if (out_idx < max_len - 1) output[out_idx++] = (triple >> 16) & 0xFF;
    if (pad < 2 && out_idx < max_len - 1) output[out_idx++] = (triple >> 8) & 0xFF;
    if (pad < 1 && out_idx < max_len - 1) output[out_idx++] = triple & 0xFF;
  }

  output[out_idx] = '\0';
  return out_idx;
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(500);

  Serial.println();
  Serial.println("INFO,========================================");
  Serial.println("INFO,WiFi Sense Lab — CSI Sensor v2.0");
  Serial.println("INFO,========================================");
  Serial.printf("INFO,Chip: %s | Cores: %d | Freq: %d MHz\n",
                ESP.getChipModel(), ESP.getChipCores(), ESP.getCpuFreqMHz());
  Serial.printf("INFO,Flash: %d MB | Free heap: %d bytes\n",
                ESP.getFlashChipSize() / (1024 * 1024), ESP.getFreeHeap());
  Serial.println();

  pinMode(LED_PIN, OUTPUT);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  digitalWrite(LED_PIN, LOW);

  // Check if user wants to reset WiFi (hold BOOT at startup)
  if (check_reset_button()) {
    Serial.println("INFO,WiFi credentials cleared by user");
  }

  // Load saved credentials
  load_credentials();

  if (saved_ssid.length() > 0) {
    Serial.printf("INFO,Saved network: %s\n", saved_ssid.c_str());
    Serial.println("INFO,Attempting connection...");

    if (connect_wifi(saved_ssid, saved_pass)) {
      Serial.println("INFO,WiFi connected successfully!");
      wifi_connected = true;

      Serial.printf("INFO,IP: %s\n", WiFi.localIP().toString().c_str());
      Serial.printf("INFO,Channel: %d\n", WiFi.channel());
      Serial.printf("INFO,RSSI: %d dBm\n", WiFi.RSSI());

      char bssid_str[18];
      print_mac(WiFi.BSSID(), bssid_str);
      Serial.printf("INFO,BSSID: %s\n", bssid_str);

      // Register CSI
      register_csi();
    } else {
      Serial.println("INFO,Saved network failed — waiting for CMD:WIFI_SET");
    }
  } else {
    Serial.println("INFO,No saved network — waiting for CMD:WIFI_SET");
  }

  Serial.println();
  Serial.println("INFO,Ready for commands (CMD:WIFI_SCAN, CMD:WIFI_SET, CMD:WIFI_STATUS, CMD:WIFI_RESET)");
  Serial.println();

  last_stats_print = millis();
  last_heartbeat = millis();
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  // Check for incoming serial commands
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    line.trim();
    if (line.startsWith("CMD:")) {
      process_command(line.substring(4));  // Remove "CMD:" prefix
    }
  }

  // Auto-reconnect if WiFi drops
  if (WiFi.status() != WL_CONNECTED) {
    if (wifi_connected) {
      Serial.println("INFO,WiFi disconnected! Attempting reconnect...");
      wifi_connected = false;
      csi_registered = false;
    }

    if (saved_ssid.length() > 0) {
      if (connect_wifi(saved_ssid, saved_pass)) {
        Serial.println("INFO,WiFi reconnected!");
        wifi_connected = true;
        register_csi();
      }
    }
  }

  // Throughput stats every 10 seconds
  unsigned long now = millis();
  if (now - last_stats_print >= 10000) {
    float pps = (float)csi_packet_count / ((now - last_stats_print) / 1000.0);
    Serial.printf("INFO,CSI stats: %.1f pkt/s (total %lu in last 10s)\n", pps, csi_packet_count);
    csi_packet_count = 0;
    last_stats_print = now;
  }

  // Heartbeat every 5 seconds
  if (now - last_heartbeat >= HEARTBEAT_INTERVAL_MS) {
    Serial.printf("HB,%lu,%d,%s\n",
                  now,
                  ESP.getFreeHeap(),
                  wifi_connected ? "connected" : "disconnected");
    last_heartbeat = now;
  }

  update_led();
  delay(10);
}

// ============================================================
// SERIAL COMMAND DISPATCHER
// ============================================================
void process_command(String cmd) {
  if (cmd == "WIFI_SCAN") {
    cmd_wifi_scan();
  } else if (cmd.startsWith("WIFI_SET,")) {
    cmd_wifi_set(cmd.substring(9));
  } else if (cmd == "WIFI_STATUS") {
    cmd_wifi_status();
  } else if (cmd == "WIFI_RESET") {
    cmd_wifi_reset();
  } else {
    Serial.printf("RSP:ERROR,Unknown command: %s\n", cmd.c_str());
  }
}

// ============================================================
// CMD: WIFI_SCAN
// ============================================================
void cmd_wifi_scan() {
  Serial.println("RSP:SCAN_START");

  int n = WiFi.scanNetworks(false, false, false, 300);
  int count = 0;

  for (int i = 0; i < n; i++) {
    int ch = WiFi.channel(i);
    if (ch >= 1 && ch <= 14) {  // Only 2.4GHz
      char mac_str[18];
      print_mac(WiFi.BSSID(i), mac_str);
      Serial.printf("AP,%d,%s,%s,%d,%d\n", i, WiFi.SSID(i).c_str(), mac_str, WiFi.RSSI(i), ch);
      count++;
    }
  }
  WiFi.scanDelete();

  Serial.printf("RSP:SCAN_END,%d\n", count);
}

// ============================================================
// CMD: WIFI_SET  (args = "ssid_base64,pass_base64")
// ============================================================
void cmd_wifi_set(String args) {
  int comma = args.indexOf(',');
  if (comma < 0) {
    Serial.println("RSP:WIFI_FAIL,Invalid format — expected ssid_b64,pass_b64");
    return;
  }

  String ssid_b64 = args.substring(0, comma);
  String pass_b64 = args.substring(comma + 1);

  // Decode Base64
  char ssid[64], pass[64];
  base64_decode(ssid_b64.c_str(), ssid, sizeof(ssid));
  base64_decode(pass_b64.c_str(), pass, sizeof(pass));

  Serial.printf("INFO,Connecting to '%s'...\n", ssid);

  // Disconnect current if any
  if (wifi_connected) {
    esp_wifi_set_csi(false);
    csi_registered = false;
    WiFi.disconnect();
    wifi_connected = false;
  }

  // Try to connect
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_CONNECT_TIMEOUT) {
    delay(500);
    update_led();
  }

  if (WiFi.status() == WL_CONNECTED) {
    // Save credentials
    save_credentials(String(ssid), String(pass));
    wifi_connected = true;

    // Get connection info
    char bssid_str[18];
    print_mac(WiFi.BSSID(), bssid_str);

    Serial.printf("RSP:WIFI_OK,%s,%d,%s\n",
                  WiFi.localIP().toString().c_str(),
                  WiFi.channel(),
                  bssid_str);

    // Start CSI capture
    register_csi();
  } else {
    WiFi.disconnect();
    Serial.println("RSP:WIFI_FAIL,Connection timeout");
  }
}

// ============================================================
// CMD: WIFI_STATUS
// ============================================================
void cmd_wifi_status() {
  if (WiFi.status() == WL_CONNECTED) {
    char bssid_str[18];
    print_mac(WiFi.BSSID(), bssid_str);
    Serial.printf("RSP:STATUS,connected,%s,%s,%d,%d\n",
                  WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI(),
                  WiFi.channel());
  } else {
    Serial.println("RSP:STATUS,disconnected,,,,");
  }
}

// ============================================================
// CMD: WIFI_RESET
// ============================================================
void cmd_wifi_reset() {
  if (csi_registered) {
    esp_wifi_set_csi(false);
    csi_registered = false;
  }
  WiFi.disconnect();
  wifi_connected = false;
  clear_credentials();
  Serial.println("RSP:RESET_OK");
}

// ============================================================
// CREDENTIALS (NVS / Preferences)
// ============================================================
void load_credentials() {
  prefs.begin("wifisetup", true);  // read-only
  saved_ssid = prefs.getString("ssid", "");
  saved_pass = prefs.getString("pass", "");
  prefs.end();
}

void save_credentials(String ssid, String pass) {
  prefs.begin("wifisetup", false);
  prefs.putString("ssid", ssid);
  prefs.putString("pass", pass);
  prefs.end();
  saved_ssid = ssid;
  saved_pass = pass;
}

void clear_credentials() {
  prefs.begin("wifisetup", false);
  prefs.clear();
  prefs.end();
  saved_ssid = "";
  saved_pass = "";
}

// ============================================================
// CHECK RESET BUTTON (hold BOOT for 5s)
// ============================================================
bool check_reset_button() {
  if (digitalRead(BOOT_PIN) == LOW) {
    Serial.println("INFO,BOOT button held — hold 5s to reset WiFi...");
    unsigned long start = millis();

    // Fast blink while waiting
    while (digitalRead(BOOT_PIN) == LOW) {
      if (millis() - start > RESET_HOLD_MS) {
        clear_credentials();
        // Rapid flash to confirm
        for (int i = 0; i < 10; i++) {
          digitalWrite(LED_PIN, i % 2); delay(100);
        }
        return true;
      }
      digitalWrite(LED_PIN, ((millis() / 100) % 2) ? HIGH : LOW);
      delay(10);
    }
    Serial.println("INFO,BOOT button released early — keeping credentials");
  }
  return false;
}

// ============================================================
// WIFI CONNECTION
// ============================================================
bool connect_wifi(String ssid, String pass) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");

    if (millis() - start > WIFI_CONNECT_TIMEOUT) {
      Serial.println();
      return false;
    }

    // Medium blink while connecting
    if (millis() - last_led_toggle > LED_MEDIUM_MS) {
      led_state = !led_state;
      digitalWrite(LED_PIN, led_state);
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

  wifi_csi_config_t csi_config;
  csi_config.lltf_en = true;
  csi_config.htltf_en = true;
  csi_config.stbc_htltf2_en = true;
  csi_config.ltf_merge_en = true;
  csi_config.channel_filter_en = false;
  csi_config.manu_scale = false;

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
// CSI CALLBACK
// ============================================================
void wifi_csi_callback(void *ctx, wifi_csi_info_t *info) {
  if (!info || !info->buf) return;

  unsigned long timestamp = millis();
  int rssi = info->rx_ctrl.rssi;
  int channel = info->rx_ctrl.channel;
  int data_len = info->len;

  char mac_str[18];
  print_mac(info->mac, mac_str);

  int num_subcarriers = data_len / 2;
  if (num_subcarriers <= 0) return;

  Serial.printf("CSI,%lu,%s,%d,%d,%d", timestamp, mac_str, rssi, channel, num_subcarriers);

  int8_t *buf = (int8_t *)info->buf;
  for (int i = 0; i < num_subcarriers; i++) {
    int8_t imag = buf[i * 2];
    int8_t real = buf[i * 2 + 1];
    int amplitude = (int)sqrtf((float)(real * real + imag * imag));
    Serial.printf(",%d", amplitude);
  }

  Serial.println();
  csi_packet_count++;
}

// ============================================================
// LED STATUS
// ============================================================
void update_led() {
  unsigned long interval;

  if (!wifi_connected && saved_ssid.length() == 0) {
    interval = LED_FAST_MS;            // Fast blink: waiting for config
  } else if (!wifi_connected) {
    interval = LED_MEDIUM_MS;          // Medium blink: connecting
  } else if (csi_registered) {
    interval = LED_SLOW_MS;            // Slow blink: capturing CSI
  } else {
    interval = LED_MEDIUM_MS;
  }

  if (millis() - last_led_toggle > interval) {
    led_state = !led_state;
    digitalWrite(LED_PIN, led_state);
    last_led_toggle = millis();
  }
}

// ============================================================
// UTILITY
// ============================================================
void print_mac(const uint8_t *mac, char *buf) {
  sprintf(buf, "%02X:%02X:%02X:%02X:%02X:%02X",
          mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
}
