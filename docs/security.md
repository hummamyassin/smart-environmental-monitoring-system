# Security review

## Scope and findings

The recovery inspected all ZIP files, both Git object databases (57 objects each), and all six objects in the existing two-commit target repository. Checks included credential-related assignments, private-key/token patterns and exact matching against values recovered from local private configuration. The publication tree and reachable history are checked again before pushing. Pattern scanning has limits and is not a guarantee against every possible encoded secret.

The outer ZIP's ignored `hardware/arduino-code/main/config.h` contains a real Wi-Fi SSID/password and Firebase endpoint. These values were not found in either recovered Git object database or the target history. An older `config.h` did exist in original history, but it contains sensor constants, not Wi-Fi credentials. It is therefore safe to preserve the original commit graph without rewriting it. The original archive and extracted backup are kept locally and must not be uploaded wholesale.

**Rotate the Wi-Fi password if it is still in use**, because the archive containing it has been shared. The SSID and database endpoint are also omitted from published examples. The deployed frontend contained Firebase browser app identifiers; these are not privileged server credentials, but this recovery removes deployment-specific values so clones do not target the team's project by default. No service-account private key or privileged Firebase token was found. No credential rotation was performed by this recovery.

## Cloud access is unfinished

The recovered firmware sends unauthenticated REST PUTs and the dashboard reads without user sign-in. The archive contains no deployed database rules, so their current permissions cannot be inferred. The recovery did not probe write permissions, change rules, write sensor data or access account settings.

`firebase/database.rules.example.json` is a newly authored deny-all baseline. It intentionally prevents the original clients from reading/writing until appropriate access is implemented. Do not loosen public write access to reproduce a demonstration. Add an authenticated device identity/write mechanism and a deliberate read policy; never embed service-account keys or database secrets in browser JavaScript.

Local `config.h`, `.env*`, browser settings, credential files and private-key formats are ignored. `.gitignore` does not remove previously tracked files; inspect staged contents and history when adding new files. Public browser settings are visible after deployment regardless of Git exclusions.

## Publication safeguards

The publication checkout is separate from the extracted backup. Original local configurations, archive files, raw deployed downloads and private audit files are outside that checkout. Only the existing GitHub repository's main branch is updated with a normal fast-forward push after a history-preserving merge. No database, Wi-Fi or hosting configuration is changed by that push.
