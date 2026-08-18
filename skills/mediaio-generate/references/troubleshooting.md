# Troubleshooting

## Authentication

- `Session expired.` → `mediaio auth login`
- `Stored credentials are for ... but current environment ...` → `mediaio auth login` for the current API URL.
- `Not authenticated.` → first `mediaio auth login`.
- Only missing credentials, HTTP 401, or an explicit token-refresh rejection should be treated as authentication failures. DNS, TLS, timeout and connection errors do not become valid by logging in again.

## Host network permission

- Treat approval as a pre-execution gate: the first networked `mediaio` Shell/Bash tool call must request host approval before the process starts. Never run the command once in the default sandbox merely to discover whether networking is blocked.
- Approval metadata belongs to the host tool call, not to `mediaio` CLI flags. Wait for acceptance or automatic approval before launching `account status`, `auth login`, discovery, upload, generation, or wait commands.
- Use the host's network-only approval, scoped to the required destination when supported. A global Codex permission-profile edit is not required for normal use.
- Treat general out-of-sandbox approval as a wider fallback, not an equivalent default. Use it only when network-only approval is unavailable, after reviewing the extra filesystem/process scope and presenting the approval to the user.
- If the host cannot request network-only or general out-of-sandbox approval, report the limitation and stop instead of launching a known-to-fail sandboxed request.
- If an unapproved read-only call unexpectedly ran and returned `dial tcp: lookup <host>: no such host`, `Could not resolve host`, or DNS `operation not permitted`, retry it only after obtaining host-native network approval.
- For `upload create` and `generate create`, request approval before execution. Do not automatically retry after timeout, reset, EOF or another ambiguous result because the write may already have reached the server.

## Host file permission

- A local input outside the active workspace requires a separate host-native file-read authorization before `mediaio upload create` starts.
- Name the exact path(s) and explain that the files will be read and uploaded to Media.io. Do not treat network approval as permission to read arbitrary local files.
- If file-read authorization is denied or unavailable, stop the upload and ask the user to grant access or move/copy the input into the workspace.

## Validation

- `Missing required params: prompt` — user gave no prompt. Ask.
- `Missing required params: medias` on Virality Predictor (`brain_activity`) — pass exactly one video via `--video <path-or-id>`. Virality Predictor does not need `--prompt`.
- `Invalid values: <param>=<v> (allowed: ...)` — pick from allowed enum.
- `Unknown params: <name>` — schema doesn't accept this flag. Run `mediaio model get <jst>` and check.

## Job lifecycle

- `Job ended with status "failed"` — server-side failure. Often prompt content / safety. Try rephrasing.
- `nsfw` / `ip_detected` — content policy. Rephrase.
- `Timeout after 10m` — model is slow today. Bump `--timeout 30m` or retry.

## Rate limits

`Media.io API error (HTTP 429)` — too many requests. Back off.

## CloudFlare / DataDome

If `Failed to decode response. Body: <html>...captcha-delivery...` appears, the server's anti-bot fired. Wait 30s and retry. If persistent, ping the team.

## Cost

The current BIN has no standalone pre-submit cost command. `mediaio workflow get <workflow_name>` includes raw workflow credit configuration when the registry provides it. If model or workflow detail does not provide enough data for an exact estimate, report that the exact cost is currently unavailable.
