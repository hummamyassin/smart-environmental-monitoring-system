// Recovery: derived from the matching private config.h; connection values replaced.
// Copy to config.h locally. Thresholds are prototype settings, not certified limits.
#ifndef CONFIG_H
#define CONFIG_H

// ================================================================
// Board: Seeed Studio XIAO ESP32-C6
// ================================================================

// -------------------- WiFi --------------------
#define WIFI_SSID       "YOUR_WIFI_SSID"
#define WIFI_PASSWORD   "YOUR_WIFI_PASSWORD"

// -------------------- Firebase --------------------
// Important: Do not add "/" at the end of the URL
#define FIREBASE_DATABASE_URL "https://YOUR_PROJECT-default-rtdb.firebaseio.com"

// -------------------- DHT11 --------------------
#define PIN_DHT11  22
#define DHTTYPE    DHT11

// -------------------- GP2Y1014AU0F Dust Sensor --------------------
#define PIN_DUST_AOUT  0     // A0 / GPIO0
#define PIN_DUST_LED   23    // GPIO23

#define ADC_VREF       3.3f
#define ADC_MAX_RAW    4095.0f

#define DUST_CLEAN_AIR_VOLTAGE  0.17f

#define DUST_SAMPLE_DELAY_US    280
#define DUST_LED_OFF_DELAY_US   40
#define DUST_CYCLE_US           9680

// Thresholds for dust density
#define THRESH_DUST_WARNING     0.600f
#define THRESH_DUST_DANGER      0.700f

// -------------------- KY-038 Sound Sensor --------------------
#define PIN_SOUND  1

#define THRESH_SOUND_WARNING  800
#define THRESH_SOUND_DANGER   900

// -------------------- MQ-135 Air Quality Sensor --------------------
#define PIN_MQ135  2

#define THRESH_MQ135_WARNING  1000
#define THRESH_MQ135_DANGER   1200

// MQ warmup time
#define MQ_WARMUP_MS  30000

// -------------------- DHT11 Thresholds --------------------
#define THRESH_TEMP_WARNING  30.0f
#define THRESH_TEMP_DANGER   35.0f

#define THRESH_HUM_WARNING   50.0f
#define THRESH_HUM_DANGER    65.0f

// -------------------- Relay / Fan --------------------
#define PIN_RELAY  21

// true if your relay is Active LOW
// false if your relay is Active HIGH
#define RELAY_ACTIVE_LOW  true

// -------------------- Timing --------------------
#define SENSOR_READ_MS        1000
#define DHT_MIN_INTERVAL_MS   2000

// Send data to Firebase every 5 seconds
#define FIREBASE_SEND_MS      5000

// -------------------- Serial Output --------------------
#define SERIAL_DIVIDER true

#endif