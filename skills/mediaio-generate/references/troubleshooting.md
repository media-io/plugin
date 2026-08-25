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

- The preferred image delivery path is: `mediaio generate download <task_id> --output-dir "$tmp_dir"`, then return a standard Markdown image using the printed local path, for example `![preview](</tmp/generated.png>)`.
- If the local path contains spaces, parentheses, or non-ASCII characters, wrap it in angle brackets in the Markdown target.
- Keep the downloaded file available until after the final response is rendered; deleting it too early can break the preview.
- If the current host does not render local-path Markdown images, state that inline local preview is unavailable and return the HTTPS result URL. Take it from the `# url[N] <url>` line printed by `generate download`, or capture it with the shell (`url=$(mediaio generate query ... | grep '^http' | head -1)`); never retype it.

## Result URLs and downloads

Signed Media.io result URLs are hosted on the shared drive storage and carry an Alibaba OSS v4 signature: `x-oss-credential=<AccessKeyId>/<date>/<region>/oss/aliyun_v4_request`, `x-oss-date`, `x-oss-expires`, `x-oss-signature` (64 hex characters) and `x-oss-signature-version=OSS4-HMAC-SHA256`. The whole URL is typically 430-510 characters of opaque high-entropy text.

- **A single wrong character breaks the URL.** Reproducing such a URL from memory or by retyping is unreliable; treat it as copy-only data. Use `mediaio generate download` so the fetch itself never depends on transcribing the URL.
- `InvalidAccessKeyId` (OSS error code `0002-00000902`) — the `x-oss-credential` AccessKeyId was altered. This is not an account problem and re-authenticating will not help. Re-run `mediaio generate download <task_id>`.
- `SignatureDoesNotMatch` — either `x-oss-signature` was altered, or a query parameter such as `x-oss-process` was added, removed, or reordered after signing. Never edit a signed URL to change image processing; request the variant you want with `--variant original|preview`.
- `AccessDenied` / `Request has expired` — `x-oss-expires` elapsed. Re-run `generate query` or `generate download` to obtain a fresh signature.
- A downloaded image that is much smaller than the reported `width`x`height` means the compressed preview was fetched instead of the original. Use `--variant original` (the default) and check the `# file[N] ...` metadata comment for the expected dimensions.
- `... is not downloadable yet: status=<label> (<code>)` — the task has not succeeded. Run `generate wait` first, then read `reason_code`/`reason_label`.
- `... already exists; pass --overwrite to replace it` — pick a fresh directory (a new `mktemp -d`) or pass `--overwrite` deliberately.
- If host output truncation is likely (long transcripts, low `max_output_tokens`), keep the URL out of the transcript: run `generate download` (or `generate wait --download DIR`) and pipe it through `grep -v '^#'` so only the short local paths remain.
- The same result file can appear both in the top-level `list` and in `result.data.after`. The CLI merges them by object path, so a single generated file is reported and downloaded once. Seeing the same path twice means an outdated build.

## Output modes

SKILL.md already states the rule: pass no `--output`, read the default `brief`. The rest of this section only matters when a script needs the machine contract or when the installed build is out of date.

- `--output json` prints exactly one JSON document on stdout, starting with `"schema_version": 1` and `"command": "generate.<sub>"`; failures use the same shape with `"error": {"kind", "message"}` and leave the exit code unchanged. Credit estimates, confirmation prompts and `generate wait` progress lines all go to stderr, so the document stays pipeable into `jq`. Discovery and other non-`generate` commands (`model list`, `model get`, `workflow list`, `workflow get`, `effect list`, `account status`, `account transactions`, `upload create`, `upload list`, `whoami`, `config get`) also accept `--output json`, but use a simpler shared envelope (same `schema_version`/`command`/`error` shape, without the richer `generate`-specific fields like `task`/`estimate`/`paginate`).
- `--output full` prints the raw API payload. Its escaped JSON (`\u0026` for `&`, `\"` for quotes) is exactly how result URLs get corrupted when decoded by hand, so use it for diagnostics only.
- `flag provided but not defined: -output` or `-download` means the installed BIN predates the brief-output contract. Fall back to reading the raw `data:` line, and still capture URLs with a shell variable rather than transcribing them.

## Job lifecycle

- `Job ended with status "failed"` — server-side failure. Often prompt content / safety. Try rephrasing.
- `nsfw` / `ip_detected` — content policy. Rephrase.
- `Timeout after 10m` — model is slow today. Bump `--timeout 30m` or retry.
- Submission succeeds but `generate wait` reports a failing terminal status with a generic `reason_code` (e.g. `680100`, shown as `reason_label=system_error_generic`) and a non-specific system-error message — for `image2image_*`, `image2video_*`, `img2vid_*`, or `reference2video_*` job types this usually means no source image/video was uploaded and passed. `680100` is the server's catch-all code and carries no specific cause, so do not read a content-policy or model problem into it. Check the command actually included an uploaded `file_id` for the image/video parameter; if not, ask the user for the source file and resubmit instead of retrying the same command.

### Status and reason codes

`generate wait`/`generate query` print both the numeric code and a readable label. Known values:

| status | label |
| --- | --- |
| 1 | `waiting` |
| 2 | `processing` |
| 3 | `success` |
| 4 | `fail` |
| 5 | `closed` |
| 6 | `timeout` |
| 10 | `cancelled` |
| 15 / 16 | `text_sensitive` / `image_sensitive` |
| 97 / 98 / 99 | `server_fail` / `server_timeout` / `abnormal` |

| reason_code | label | meaning |
| --- | --- | --- |
| 680100 | `system_error_generic` | server catch-all; no specific cause |
| 680201 | `no_human_voice` | no human voice detected in the input |
| 680202 | `no_human_face` | no human face detected in the input |
| 680203 | `content_sensitive` | content policy |
| 680204 | `drive_space_full` | cloud drive space exhausted |
| 680205 | `pds_transfer_failed` | storage transfer failure |
| 680206 | `thumbnail_failed` | thumbnail generation failure |
| 680207 | `stt_failed` | speech-to-text failure |

An unmapped code prints without a `reason_label`; report the number as-is rather than guessing its meaning.

## Rate limits

`Media.io API error (HTTP 429)` — too many requests. Back off.

## CloudFlare / DataDome

If `Failed to decode response. Body: <html>...captcha-delivery...` appears, the server's anti-bot fired. Wait 30s and retry. If persistent, ping the team.

## Cost and credit confirmation

`mediaio generate estimate <job_type> [--param value]...` returns the pre-submit credit cost without spending anything. `mediaio workflow get <workflow_name>` still prints the raw credit configuration for diagnostics.

- `credit confirmation required: ... rerun with --yes only after they approve` — the CLI refused to spend credits without the user seeing the cost. Show the estimate printed above the error to the user, wait for an explicit approval, then resubmit with `--yes`. Never satisfy this error by attaching `--yes`, `--skip-estimate` or an auto-confirm switch on your own initiative.
- `credit estimate mismatch: --expect-credit X but the current parameters estimate to Y` — the parameters changed after the approval. Show Y to the user and ask again.
- `--skip-estimate is only allowed on an interactive terminal` — drop the flag and run the estimate.
- estimate returns `known=false` — the cost depends on data only the server can resolve. Report that the exact cost is currently unavailable instead of inventing it; submit with `--yes` only after the user approves an unknown cost.
- the user says they do not want to approve every job — match the scope to what they said: `--yes` for one call, `mediaio generate auto-confirm on` for every session. Explain the consequence before widening the scope, and never widen it on your own initiative. `mediaio generate auto-confirm status` shows what is in effect.
