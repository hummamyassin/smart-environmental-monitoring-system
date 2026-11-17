# Validation record

The report's test table is historical project evidence, not a result from this repository recovery. The ZIP's `testing/sensor-tests/test-results.md` was empty.

## Recovery-time checks

- JavaScript syntax check (`node --check`): passed.
- Five dependency-free dashboard tests: passed. They cover no-configuration fallback, current firmware payload mapping, bounded in-memory charts, empty Firebase snapshots, transition back to live state, read errors, safe rendering of error text, threshold boundaries and uploaded fan-state display. Firebase is simulated.
- Firmware configuration static check: passed for required settings and final pin assignments.
- Safe example Firebase payload: matches the firmware's field schema.
- Database rules example: parsed and confirmed deny-by-default.
- `.gitignore`: confirmed to cover local configuration, environment files, credentials and private keys.
- Documentation links and merge-conflict markers: checked by the static script.
- Git object database integrity: `git fsck --full --no-reflogs` reported no errors; one dangling tree was reported and was not part of the proposed branch history.
- Browser automation: not run. Playwright's bundled Chromium executable is unavailable; installed Edge exits during startup in this sandbox. No browser screenshot or visual layout result is claimed.
- Arduino compile, physical sensors/relay, Wi-Fi upload, Firebase permissions and live account data: not tested. Arduino CLI, board, credentials and service access are unavailable in this recovery run.
