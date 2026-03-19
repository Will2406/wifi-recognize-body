/*
 * ESP32-WROOM-32 - Test de funcionamiento
 *
 * Prueba 1: Blink del LED integrado
 * Prueba 2: Escaneo de redes WiFi
 *
 * Si ves el LED parpadeando y las redes en el Serial Monitor,
 * tu board funciona correctamente.
 */

#include <WiFi.h>

// LED integrado del ESP32 (GPIO 2 en la mayoria de boards)
#define LED_PIN 2

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("================================");
  Serial.println("  ESP32 - Test de funcionamiento");
  Serial.println("================================");
  Serial.println();

  // Configurar LED
  pinMode(LED_PIN, OUTPUT);
  Serial.println("[OK] LED configurado en GPIO 2");

  // Info del chip
  Serial.printf("[INFO] Chip: %s\n", ESP.getChipModel());
  Serial.printf("[INFO] Cores: %d\n", ESP.getChipCores());
  Serial.printf("[INFO] Frecuencia: %d MHz\n", ESP.getCpuFreqMHz());
  Serial.printf("[INFO] Flash: %d MB\n", ESP.getFlashChipSize() / (1024 * 1024));
  Serial.printf("[INFO] RAM libre: %d bytes\n", ESP.getFreeHeap());
  Serial.println();

  // Escaneo WiFi
  Serial.println("[WiFi] Escaneando redes...");
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);

  int numRedes = WiFi.scanNetworks();

  if (numRedes == 0) {
    Serial.println("[WiFi] No se encontraron redes");
  } else {
    Serial.printf("[WiFi] Se encontraron %d redes:\n", numRedes);
    for (int i = 0; i < numRedes; i++) {
      Serial.printf("  %d) %s (RSSI: %d dBm) %s\n",
                     i + 1,
                     WiFi.SSID(i).c_str(),
                     WiFi.RSSI(i),
                     WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "[Abierta]" : "[Protegida]");
    }
  }

  Serial.println();
  Serial.println("[OK] Todas las pruebas completadas!");
  Serial.println("[OK] LED parpadeando cada 500ms...");
  Serial.println();
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED: ON");
  delay(500);

  digitalWrite(LED_PIN, LOW);
  Serial.println("LED: OFF");
  delay(500);
}
