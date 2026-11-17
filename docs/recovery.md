# Recovery and provenance

Recovery date: 18 November 2026. The supplied final report was read in full (24 pages), including the contribution table, figures and poster. It is the authority for academic context and reported capstone results; source inspection determines what is present in this recovery.

## Sources and selection

The ZIP contains an outer `smart-environment-monitoring-system` repository and a nested clone of the same name. Both point to `74e340a09294ea531a006625907ef52f94e46b2c` and contain the same 11-commit graph. All objects, including unreachable objects if present, were included in the security inspection. Git integrity checking reported no errors.

The nested copy is the committed sensor-only version. The outer copy contains uncommitted Phase 2 Wi-Fi/Firebase firmware and a matching ignored private `config.h`. The outer sketch is the selected firmware: it adds REST latest uploads, analog sound input and separate dust LED/ADC pins. Its bytes are preserved in `firmware/main/main.ino`. The old committed firmware remains in Git history.

The two working copies' frontend files differ only in line endings. Both are the earlier simulated dashboard. The outer `main/config.example.h` has analog-sound edits but is incompatible with the final sketch: it lacks cloud settings and final macro names and has older pin assignments. It was not combined blindly with the final firmware. The new example is derived from the matching private configuration, replacing only connection settings and adding explanatory comments.

Both copies contain empty documentation/image directories, an empty Firebase configuration example and an empty sensor test-results file. No executable tests, actual screenshots, circuit drawing files or report PDF are in the ZIP. The separately supplied PDF provides the report and original figures.

The report's Appendix A deploy-specific URL returned HTTP 404. Its page-24 poster also identifies `https://semsp.netlify.app/`; its `index.html`, `script.js` and `style.css` returned HTTP 200. These are authentic deployed assets recovered on the recovery date. They implement the Firebase listener and the same dashboard design seen in the report. There is no evidence tying their exact current bytes to a June deployment commit, so they are identified as a recovery-date snapshot, not an invented final Git revision.

See [the manifest](recovery-manifest.json) for source paths, sizes and SHA-256 hashes. Original archive and extracted copies remain untouched in the private local recovery workspace. Original deployed downloads are also retained locally; project-specific browser settings are omitted from the published copy.

## History preservation

The existing target repository contained only README.md and two commits, ending at `e44bdaa8b4bb90f7de2cd634043eab1a088aaecf`. Its README was reviewed: claims about history POSTs and broad Firebase authorship were corrected against the code and report.

The recovered 11-commit history is merged as a second parent into the existing target history. Original authors, dates and commit IDs are preserved; no force push or history rewrite is needed. The README add/add conflict is resolved with the report-validated documentation. No unrelated source files existed in the target checkout. Old `hardware/` and empty placeholder directories are replaced in the current tree by `firmware/`, `firebase/`, `docs/` and `tests/`; prior versions remain accessible in history.

## Recovery-authored changes

- Documentation, provenance manifest, automated checks, example database payload/rules and Netlify configuration are new recovery work, not original capstone artifacts.
- `firmware/main/main.ino` is the unchanged outer ZIP sketch. Its matching private settings were converted to a public configuration example. No missing firmware logic was fabricated.
- Deployed frontend source replaces the earlier mock-only working tree. The CSS is unchanged from the deployed download.
- The embedded Firebase project settings were replaced with an ignored external configuration file and a safe example. Missing/example configuration deliberately uses the existing simulated fallback.
- Obsolete Phase 1 header/integration-guide comments were removed from the deployed JavaScript; they described field names and timestamps that no longer matched the executable implementation.
- Entering fallback now always clears the live state/label, including an empty snapshot after a successful reading. Event-log messages are inserted as text rather than HTML.
- Initial connection labels say Connecting/Waiting for data. Temperature, humidity and dust bar marker positions were corrected to the deployed dashboard's own thresholds; the dust scale maximum now matches its 1.0 scale and its unsupported PM2.5 label is replaced with “Uncalibrated dust estimate.” Actual recovered threshold values were not silently reconciled with firmware.
- Report figures were extracted from the supplied PDF; the local fallback screenshot is newly captured and explicitly labelled. The PDF is preserved unchanged.

The recovered code still has the limitations listed in [technical-audit.md](technical-audit.md). Recovery does not imply a completed production hardening or a new end-to-end hardware test.
