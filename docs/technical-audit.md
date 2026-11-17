# Technical audit

## Firmware and schema

The outer ZIP sketch contains `WiFi.h`, `HTTPClient.h`, `DHT.h` and `config.h`. It samples sensors nominally every 1000 ms, reads DHT at a minimum interval of 2000 ms, uses a 30000 ms MQ warmup and attempts latest uploads every 5000 ms while connected. Dust LED timing is 280 us to sampling, 40 us to LED-off and 9680 us remainder. Sound and MQ inputs average eight ADC reads each.

`sendToFirebase()` builds JSON manually and issues a PUT to `/sensors/latest.json`. Fields are `temperature`, `humidity`, `airQuality`, `dust`, `dustRaw`, `dustVoltage`, `sound`, `fan`, `dhtOk`, `mqWarmupDone`, `wifiRssi` and `timestamp`. Temperature is Celsius, humidity is percent, air/sound are raw ADC indicators, dust is an approximate mg/m³-labelled estimate, and timestamp is board uptime in milliseconds. It resets on reboot and wraps with the board counter; it is not a globally sortable wall-clock timestamp.

No POST, history upload, server timestamp, authentication token or offline buffering is implemented. No Firebase database rules were recovered. The browser subscribes only to `sensors/latest`; its charts retain 20 in-memory readings and seed them with defaults. The example payload contains illustrative synthetic values, not a measured dataset.

## Conflicts deliberately left visible

| Setting | Matching recovered firmware configuration | Deployed dashboard |
|---|---|---|
| Temperature warning / danger | 30 / 35 °C | 25 / 28 °C |
| Dust warning / danger | 0.600 / 0.700 | 0.400 / 0.500 |
| MQ warning / danger | 1000 / 1200 raw | 1000 / 1200 raw |
| Sound warning / danger | 800 / 900 raw | 800 / 900 raw |
| Humidity boundaries | Warning below 50 or above 65 | Warning at or outside 50 and 65 |

The firmware includes temperature, sound, dust and warmed-up MQ danger in the relay decision, with hysteresis down to warning thresholds. Humidity is printed but does not control the relay. The dashboard's live fan display uses the uploaded Boolean, while fallback calculates a simulated state from its own thresholds. It should not be assumed that an alert badge and fan state use identical thresholds.

With `ADC_VREF=3.3`, `ADC_MAX_RAW=4095` and `DUST_CLEAN_AIR_VOLTAGE=0.17`, the firmware computes `(voltage - 0.17) / 5`, clamped at zero. Its nominal full-scale maximum is 0.626, below the configured 0.700 dust danger threshold. This is a static inconsistency requiring calibration and a deliberate threshold decision, not evidence that the sensor can reliably distinguish particulate concentrations.

## Runtime and security limitations

- Wi-Fi startup precedes relay initialization and waits up to approximately 15 seconds. The loop does not explicitly reconnect after connection loss. Synchronous HTTP operations delay local sampling; local logic is not a real-time safety guarantee.
- Any positive HTTP code is logged as “Data sent,” including 401/403. Only actual 2xx responses establish an accepted upload. TLS certificate behavior was not verified against an installed ESP32 toolchain; no explicit trust configuration is present.
- The firmware has no authenticated cloud write path. A safe deny-by-default rules example will reject both original clients; access architecture must be implemented before live use.
- DHT failure retains previous numeric values and sets `dhtOk=false`; the dashboard records metadata but does not visually invalidate those values. It does not suppress MQ cards during warmup.
- Dashboard conversion uses `Number()`/`Boolean()` without a strict schema. For example, a string “false” is truthy; missing fields retain old readings. Do not treat arbitrary payloads as validated sensor measurements.
- There is no stale-data timer or `.info/connected` subscription. A previously populated snapshot or interrupted connection may leave an apparently live screen. Fallback can also simulate readings after an empty snapshot or error. Recovery fixes the fallback label, not full data-quality handling.
- Fan event logging can repeat entries because alert de-duplication and fan state share a set. Startup chart samples are defaults rather than historical data.
- Original dependency versions are retained; no package lock or firmware board/library version pins were recovered. CDN outages can prevent initialization.

## Report versus recovery

The report describes successful end-to-end demonstrations, four passed integration tests and partial physical actuation. Its history claims are qualified by its own future-work section and by the absence of history writes/queries in recovered source. The report is evidence of the team's academic results; these results were not reproduced with hardware during recovery.

The final report and matching firmware configuration agree on the current pin map. Earlier committed examples and the mock dashboard are obsolete references, preserved only for provenance. No MQ-2 implementation is selected despite its appearance in the initial README.
