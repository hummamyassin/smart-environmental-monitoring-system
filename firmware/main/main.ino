#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include "config.h"

// ----------------------------------------------------------------
//  DHT11 instance
// ----------------------------------------------------------------
DHT dht(PIN_DHT11, DHTTYPE);

// ----------------------------------------------------------------
//  Sensor data structure
// ----------------------------------------------------------------
struct SensorReading {
  // GP2Y dust sensor
  int   dust_raw;
  float dust_v;
  float dust_mgm3;

  // KY-038 sound sensor — ANALOG MODE
  int   sound_raw;

  // MQ-135 air quality
  int   mq135_raw;

  // DHT11
  float temperature;
  float humidity;
  bool  dht_ok;

  // Relay / fan state
  bool  fan_on;
};

// ----------------------------------------------------------------
//  State
// ----------------------------------------------------------------
static SensorReading  g_reading;
static unsigned long  g_boot_ms             = 0;
static unsigned long  g_last_read_ms        = 0;
static unsigned long  g_last_dht_ms         = 0;
static unsigned long  g_last_firebase_ms    = 0;
static bool           g_warmup_done         = false;
static bool           g_fan_state           = false;

// ----------------------------------------------------------------
//  Forward declarations
// ----------------------------------------------------------------
void          connectWiFi();
void          sendToFirebase(const SensorReading &r);

void          readDust(SensorReading &r);
void          readSound(SensorReading &r);
void          readMQ135(SensorReading &r);
void          readDHT11(SensorReading &r);

bool          evaluateFan(const SensorReading &r);
void          setRelay(bool on);
void          printReading(const SensorReading &r);

const char*   levelLabel(float val, float warn, float danger);
const char*   levelLabelInt(int val, int warn, int danger);

// ================================================================
//  SETUP
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println(F("================================================"));
  Serial.println(F("  Smart Environmental Monitoring System"));
  Serial.println(F("  Bahcesehir University — Capstone 2"));
  Serial.println(F("  Phase 2: Sensors + WiFi + Firebase"));
  Serial.println(F("================================================"));
  Serial.println();

  // WiFi connection
  connectWiFi();

  // Relay pin
  pinMode(PIN_RELAY, OUTPUT);
  setRelay(false);
  Serial.println(F("[RELAY]  Pin configured. Relay/Fan OFF."));

  // GP2Y1014AU0F dust sensor
  pinMode(PIN_DUST_LED, OUTPUT);
  pinMode(PIN_DUST_AOUT, INPUT);

  // GP2Y LED OFF
  digitalWrite(PIN_DUST_LED, HIGH);

  Serial.println(F("[GP2Y]   Dust sensor ready."));
  Serial.println(F("[GP2Y]   LED pin HIGH (off). Analog pin ready."));
  Serial.println(F("[GP2Y]   Clean-air baseline: 0.17V"));

  // KY-038 sound sensor — analog input
  pinMode(PIN_SOUND, INPUT);
  Serial.println(F("[KY-038] Sound pin configured as ANALOG input."));

  // MQ-135 analog input
  pinMode(PIN_MQ135, INPUT);
  Serial.println(F("[MQ-135] Analog pin ready."));

  // DHT11
  dht.begin();
  Serial.println(F("[DHT11]  Sensor initialised."));

  // Initial safe values
  g_reading = {0, 0.0f, 0.0f, 0, 0, 0.0f, 0.0f, false, false};

  // First DHT read
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t) && !isnan(h)) {
    g_reading.temperature = t;
    g_reading.humidity    = h;
    g_reading.dht_ok      = true;
  }

  g_last_dht_ms       = millis();
  g_boot_ms           = millis();
  g_last_read_ms      = millis();
  g_last_firebase_ms  = millis();

  Serial.println();
  Serial.print(F("[WARMUP] MQ-135 preheat started. MQ readings will be trusted after "));
  Serial.print(MQ_WARMUP_MS / 1000);
  Serial.println(F(" seconds."));
  Serial.println(F("         Dust, sound, temperature, and humidity can affect the relay now."));
  Serial.println();
}

// ================================================================
//  MAIN LOOP
// ================================================================
void loop() {
  unsigned long now = millis();

  // MQ-135 warmup status
  if (!g_warmup_done) {
    if (now - g_boot_ms >= (unsigned long)MQ_WARMUP_MS) {
      g_warmup_done = true;
      Serial.println(F("[WARMUP] Complete. MQ-135 readings are now trusted."));
      Serial.println();
    }
  }

  // Sensor read cycle
  if (now - g_last_read_ms >= (unsigned long)SENSOR_READ_MS) {
    g_last_read_ms = now;

    readDust(g_reading);
    readSound(g_reading);
    readMQ135(g_reading);

    if (now - g_last_dht_ms >= (unsigned long)DHT_MIN_INTERVAL_MS) {
      readDHT11(g_reading);
      g_last_dht_ms = now;
    }

    bool fan_should_be = evaluateFan(g_reading);

    if (fan_should_be != g_fan_state) {
      g_fan_state = fan_should_be;
      setRelay(g_fan_state);
    }

    g_reading.fan_on = g_fan_state;

    printReading(g_reading);

    // Send to Firebase every FIREBASE_SEND_MS
    if (WiFi.status() == WL_CONNECTED && now - g_last_firebase_ms >= (unsigned long)FIREBASE_SEND_MS) {
      g_last_firebase_ms = now;
      sendToFirebase(g_reading);
    } else if (WiFi.status() != WL_CONNECTED) {
      Serial.println(F("[WIFI] Not connected. Firebase upload skipped."));
    }
  }
}

// ================================================================
//  WIFI CONNECTION
// ================================================================
void connectWiFi() {
  Serial.print(F("[WIFI] Connecting to: "));
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;

  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(F("."));
    attempts++;
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("[WIFI] Connected successfully."));
    Serial.print(F("[WIFI] IP Address: "));
    Serial.println(WiFi.localIP());
    Serial.print(F("[WIFI] RSSI: "));
    Serial.println(WiFi.RSSI());
  } else {
    Serial.println(F("[WIFI] Connection failed. System will continue locally."));
  }
}

// ================================================================
//  FIREBASE UPLOAD
// ================================================================
void sendToFirebase(const SensorReading &r) {
  HTTPClient http;

  String url = String(FIREBASE_DATABASE_URL) + "/sensors/latest.json";

  String json = "{";
  json += "\"temperature\":" + String(r.temperature, 1) + ",";
  json += "\"humidity\":" + String(r.humidity, 1) + ",";
  json += "\"airQuality\":" + String(r.mq135_raw) + ",";
  json += "\"dust\":" + String(r.dust_mgm3, 4) + ",";
  json += "\"dustRaw\":" + String(r.dust_raw) + ",";
  json += "\"dustVoltage\":" + String(r.dust_v, 3) + ",";
  json += "\"sound\":" + String(r.sound_raw) + ",";
  json += "\"fan\":" + String(r.fan_on ? "true" : "false") + ",";
  json += "\"dhtOk\":" + String(r.dht_ok ? "true" : "false") + ",";
  json += "\"mqWarmupDone\":" + String(g_warmup_done ? "true" : "false") + ",";
  json += "\"wifiRssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"timestamp\":" + String(millis());
  json += "}";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.PUT(json);

  if (httpCode > 0) {
    Serial.print(F("[FIREBASE] Data sent. HTTP code: "));
    Serial.println(httpCode);
  } else {
    Serial.print(F("[FIREBASE] Failed to send data. Error: "));
    Serial.println(http.errorToString(httpCode));
  }

  http.end();
}

// ================================================================
//  SENSOR READERS
// ================================================================

// GP2Y1014AU0F dust sensor
void readDust(SensorReading &r) {
  // Turn GP2Y LED ON
  digitalWrite(PIN_DUST_LED, LOW);

  // Wait before reading analog output
  delayMicroseconds(DUST_SAMPLE_DELAY_US);

  // Read GP2Y Vo analog output
  r.dust_raw = analogRead(PIN_DUST_AOUT);

  // Wait before turning LED off
  delayMicroseconds(DUST_LED_OFF_DELAY_US);

  // Turn GP2Y LED OFF
  digitalWrite(PIN_DUST_LED, HIGH);

  // Complete the 10 ms sensor cycle
  delayMicroseconds(DUST_CYCLE_US);

  // Convert ESP32 ADC raw value to voltage using 3.3V reference
  r.dust_v = r.dust_raw * (ADC_VREF / ADC_MAX_RAW);

  // Approximate dust density calculation
  r.dust_mgm3 = (r.dust_v - DUST_CLEAN_AIR_VOLTAGE) / 5.0f;

  if (r.dust_mgm3 < 0.0f) {
    r.dust_mgm3 = 0.0f;
  }
}

// KY-038 sound sensor — ANALOG MODE
void readSound(SensorReading &r) {
  long sum = 0;

  for (int i = 0; i < 8; i++) {
    sum += analogRead(PIN_SOUND);
    delay(2);
  }

  r.sound_raw = (int)(sum / 8);
}

// MQ-135 air quality sensor
void readMQ135(SensorReading &r) {
  long sum = 0;

  for (int i = 0; i < 8; i++) {
    sum += analogRead(PIN_MQ135);
    delay(2);
  }

  r.mq135_raw = (int)(sum / 8);
}

// DHT11 temperature and humidity
void readDHT11(SensorReading &r) {
  float t = dht.readTemperature();
  float h = dht.readHumidity();

  if (!isnan(t) && !isnan(h)) {
    r.temperature = t;
    r.humidity    = h;
    r.dht_ok      = true;
  } else {
    r.dht_ok = false;
  }
}

// ================================================================
//  RELAY / FAN LOGIC
// ================================================================
bool evaluateFan(const SensorReading &r) {
  // MQ-135 should only affect relay after warmup
  bool mq_danger = false;

  if (g_warmup_done) {
    mq_danger = (r.mq135_raw >= THRESH_MQ135_DANGER);
  }

  // Dust danger
  bool dust_danger = (r.dust_mgm3 >= THRESH_DUST_DANGER);

  // Temperature danger
  bool temp_danger = false;

  if (r.dht_ok) {
    temp_danger = (r.temperature >= THRESH_TEMP_DANGER);
  }

  // Sound danger
  bool sound_danger = (r.sound_raw >= THRESH_SOUND_DANGER);

  // Relay turns ON if ANY sensor reaches danger
  bool danger = mq_danger || dust_danger || temp_danger || sound_danger;

  if (danger) {
    return true;
  }

  // Hysteresis:
  // If relay is already ON, keep it ON until all values go below warning level
  if (g_fan_state) {
    bool mq_still_high = false;

    if (g_warmup_done) {
      mq_still_high = (r.mq135_raw >= THRESH_MQ135_WARNING);
    }

    bool dust_still_high = (r.dust_mgm3 >= THRESH_DUST_WARNING);

    bool temp_still_high = false;

    if (r.dht_ok) {
      temp_still_high = (r.temperature >= THRESH_TEMP_WARNING);
    }

    bool sound_still_high = (r.sound_raw >= THRESH_SOUND_WARNING);

    return mq_still_high || dust_still_high || temp_still_high || sound_still_high;
  }

  return false;
}

// ================================================================
//  RELAY CONTROL
// ================================================================
void setRelay(bool on) {
  if (RELAY_ACTIVE_LOW) {
    digitalWrite(PIN_RELAY, on ? LOW : HIGH);
  } else {
    digitalWrite(PIN_RELAY, on ? HIGH : LOW);
  }
}

// ================================================================
//  SERIAL OUTPUT
// ================================================================
void printReading(const SensorReading &r) {
  if (SERIAL_DIVIDER) {
    Serial.println(F("------------------------------------------------"));
  }

  // Warmup output
  if (!g_warmup_done) {
    unsigned long elapsed = millis() - g_boot_ms;
    unsigned long remaining = 0;

    if (elapsed < MQ_WARMUP_MS) {
      remaining = (MQ_WARMUP_MS - elapsed) / 1000;
    }

    Serial.print(F("[WARMUP] "));
    Serial.print(remaining);
    Serial.print(F("s left | Dust raw="));
    Serial.print(r.dust_raw);
    Serial.print(F("  Dust V="));
    Serial.print(r.dust_v, 3);
    Serial.print(F("V  Dust="));
    Serial.print(r.dust_mgm3, 4);
    Serial.print(F(" mg/m3  Sound="));
    Serial.print(r.sound_raw);
    Serial.print(F(" raw  MQ135="));
    Serial.print(r.mq135_raw);
    Serial.print(F(" not trusted yet  T="));

    if (r.dht_ok) {
      Serial.print(r.temperature, 1);
      Serial.print(F("C  H="));
      Serial.print(r.humidity, 1);
      Serial.print(F("%  Relay="));
      Serial.println(r.fan_on ? F("ON") : F("off"));
    } else {
      Serial.print(F("DHT read failed  Relay="));
      Serial.println(r.fan_on ? F("ON") : F("off"));
    }

    return;
  }

  // MQ-135
  Serial.print(F("  Air quality (MQ-135) : "));
  Serial.print(r.mq135_raw);
  Serial.print(F(" raw    ["));
  Serial.print(levelLabelInt(r.mq135_raw, THRESH_MQ135_WARNING, THRESH_MQ135_DANGER));
  Serial.println(F("]"));

  // Dust
  Serial.print(F("  Dust PM2.5  (GP2Y)   : "));
  Serial.print(r.dust_raw);
  Serial.print(F(" raw | "));
  Serial.print(r.dust_v, 3);
  Serial.print(F(" V | "));
  Serial.print(r.dust_mgm3, 4);
  Serial.print(F(" mg/m3  ["));
  Serial.print(levelLabel(r.dust_mgm3, THRESH_DUST_WARNING, THRESH_DUST_DANGER));
  Serial.println(F("]"));

  // Sound
  Serial.print(F("  Sound level (KY-038) : "));
  Serial.print(r.sound_raw);
  Serial.print(F(" raw    ["));
  Serial.print(levelLabelInt(r.sound_raw, THRESH_SOUND_WARNING, THRESH_SOUND_DANGER));
  Serial.println(F("]"));

  // Temperature
  Serial.print(F("  Temperature (DHT11)  : "));
  if (r.dht_ok) {
    Serial.print(r.temperature, 1);
    Serial.print(F(" C        ["));
    Serial.print(levelLabel(r.temperature, THRESH_TEMP_WARNING, THRESH_TEMP_DANGER));
    Serial.println(F("]"));
  } else {
    Serial.println(F("DHT read failed"));
  }

  // Humidity
  Serial.print(F("  Humidity    (DHT11)  : "));
  if (r.dht_ok) {
    Serial.print(r.humidity, 1);
    Serial.print(F(" %        ["));

    if (r.humidity < THRESH_HUM_WARNING || r.humidity > THRESH_HUM_DANGER) {
      Serial.print(F("warning"));
    } else {
      Serial.print(F("safe"));
    }

    Serial.println(F("]"));
  } else {
    Serial.println(F("DHT read failed"));
  }

  // Relay / fan
  Serial.print(F("  Relay / Fan          : "));
  Serial.println(r.fan_on ? F("ON  <<< ACTIVE") : F("off"));

  if (SERIAL_DIVIDER) {
    Serial.println(F("------------------------------------------------"));
  }
}

// ================================================================
//  LEVEL HELPERS
// ================================================================
const char* levelLabel(float val, float warn, float danger) {
  if (val >= danger) {
    return "DANGER";
  }

  if (val >= warn) {
    return "warning";
  }

  return "safe";
}

const char* levelLabelInt(int val, int warn, int danger) {
  if (val >= danger) {
    return "DANGER";
  }

  if (val >= warn) {
    return "warning";
  }

  return "safe";
}