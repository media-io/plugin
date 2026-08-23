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
- Network approval does not authorize local state writes; request filesystem-write authorization before commands such as `mediaio auth login` that persist credentials. Do not infer whether the target is inside the sandbox.

## Validation

- `Missing required params: prompt` — user gave no prompt. Ask.
- `Missing required params: medias` on Virality Predictor (`brain_activity`) — pass exactly one video via `--video <path-or-id>`. Virality Predictor does not need `--prompt`.
- `Invalid values: <param>=<v> (allowed: ...)` — pick from allowed enum.
- `Unknown params: <name>` — schema doesn't accept this flag. Run `mediaio model get <jst>` and check.

## Host image delivery

- The preferred image delivery path is: download to a verified local file, then return a standard Markdown image using that local path, for example `![preview](</tmp/generated.png>)`.
- If the local path contains spaces, parentheses, or non-ASCII characters, wrap it in angle brackets in the Markdown target.
- Keep the downloaded file available until after the final response is rendered; deleting it too early can break the preview.
- If the current host does not render local-path Markdown images, state that inline local preview is unavailable and return the HTTPS result URL as the fallback.

## Job lifecycle

- `Job ended with status "failed"` — server-side failure. Often prompt content / safety. Try rephrasing.
- `nsfw` / `ip_detected` — content policy. Rephrase.
- `Timeout after 10m` — model is slow today. Bump `--timeout 30m` or retry.
- Submission succeeds but `generate wait` reports `status=4` with a generic `reason_code` (e.g. `680100`) and a non-specific `系统错误`/system-error message — for `image2image_*`, `image2video_*`, `img2vid_*`, or `reference2video_*` job types this usually means no source image/video was uploaded and passed. Check the command actually included an uploaded `file_id` for the image/video parameter; if not, ask the user for the source file and resubmit instead of retrying the same command.

## Rate limits

`Media.io API error (HTTP 429)` — too many requests. Back off.

## CloudFlare / DataDome

If `Failed to decode response. Body: <html>...captcha-delivery...` appears, the server's anti-bot fired. Wait 30s and retry. If persistent, ping the team.

## Cost and credit confirmation

`mediaio generate estimate <job_type> [--param value]... --json` returns the pre-submit credit cost without spending anything. `mediaio workflow get <workflow_name>` still prints the raw credit configuration for diagnostics.

- `credit confirmation required: ... rerun with --yes only after they approve` — the CLI refused to spend credits without the user seeing the cost. Show the estimate printed above the error to the user, wait for an explicit approval, then resubmit with `--yes`. Never satisfy this error by attaching `--yes`, `--skip-estimate` or an auto-confirm switch on your own initiative.
- `credit estimate mismatch: --expect-credit X but the current parameters estimate to Y` — the parameters changed after the approval. Show Y to the user and ask again.
- `--skip-estimate is only allowed on an interactive terminal` — drop the flag and run the estimate.
- estimate returns `known=false` — the cost depends on data only the server can resolve. Report that the exact cost is currently unavailable instead of inventing it; submit with `--yes` only after the user approves an unknown cost.
- the user says they do not want to approve every job — match the scope to what they said: `--yes` for one call, `export MEDIAIO_AUTO_CONFIRM=1` for this session only, `mediaio generate auto-confirm on` for every session. Explain the consequence before widening the scope, and never widen it on your own initiative. `mediaio generate auto-confirm status` shows what is in effect.
