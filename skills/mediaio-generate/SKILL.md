---
name: mediaio-generate
metadata:
  version: "0.2.3"
description: |
  Generate images and videos through the currently installed Media.io CLI.
  Use for text-to-image, image-to-image, text-to-video, image-to-video,
  reference-to-video and published workflows that appear in the live
  `mediaio model list` or `mediaio workflow list`. Effects may be used only
  when their parameters have been independently verified because the current
  CLI exposes `effect list` but not `effect get`.
  Always discover the exact job type and schema before submission. Use the
  human-readable discovery output, upload local files before generation,
  submit with `generate create`, wait with the separate `generate wait`
  command, and retrieve result files with `generate download` instead of
  reproducing signed result URLs.
  On hosts that sandbox local command networking, the first networked
  `mediaio` or `curl` Shell/Bash tool call must request host approval before process
  launch. Never probe network availability by running it in the default sandbox.
---

# Media.io Generate

Submit image and video jobs through the current `mediaio` CLI contract. Treat CLI help, model/workflow/effect discovery, and `model get`/`workflow get` output as the source of truth.

## Step 0 — Bootstrap

Before any generation command:

1. Run `command -v mediaio` and `mediaio version`. If the command is missing, tell the user that the shared Media.io CLI must be installed; do not silently install a second runtime from this skill.
2. **Network approval gate (hard requirement).** Before launching the first networked `mediaio` process in the current task, submit that Shell/Bash tool call through the host's narrowest native network-only approval mechanism, scoped to the required destination when supported. Do not first run `mediaio account status`, `auth login`, discovery, upload, generation, or wait commands in the default sandbox as a connectivity probe. Approval metadata belongs to the host tool call, not to `mediaio` CLI arguments.
3. Wait until the approval is accepted or automatically approved before launching the process. If network-only approval is unavailable, use a general out-of-sandbox approval only after reviewing its wider scope and presenting that approval to the user. If the command may write local state (including `auth login` persisting credentials), also request filesystem-write authorization; do not infer whether the target is inside the sandbox. If the host cannot request the required approval, report the host limitation and stop instead of attempting a known-to-fail sandboxed request. A global Codex permission-profile edit is not a prerequisite.
4. Run `mediaio account status` using the approved execution path. If authentication is genuinely missing, expired or rejected by the server, run `mediaio auth login` and wait for the browser flow to finish. DNS, TLS, timeout, connection and sandbox-denial errors are network failures, not authentication failures.
5. On a network or permission failure, load `references/troubleshooting.md`. Retry read-only commands only after a clear pre-connection sandbox/DNS failure; never automatically retry a write with an ambiguous result.
6. Run `mediaio config get` when an endpoint or environment mismatch is suspected.

## UX Rules

1. Be concise. Do not paste raw registry output or full response payloads unless the user asks for diagnostics.
2. Do not expose access tokens, credentials, prompts from unrelated tasks, or request debug payloads.
3. Detect the user's language from the first message and reply in it. Technical args (`--aspect_ratio 16:9`) stay English.
4. Don't batch-ask. Pick a sane default model and ask one thing at a time only if genuinely missing.
5. Never invent a job type or parameter. Discover both from the current CLI.
6. Submit first, read the returned `task_id=<id>` line, then call `mediaio generate wait <task_id>`. The current `generate create` command does not accept `--wait`.

## Result URL guardrail (hard rule)

A signed Media.io result URL carries a high-entropy storage credential. Rewriting one character breaks it, and the storage service answers `InvalidAccessKeyId` or `SignatureDoesNotMatch` rather than pointing at the typo. Therefore:

1. **Never retype, re-key, summarise, reformat, or hand-edit a result URL.** Do not strip or add query parameters such as `x-oss-process`, and do not "clean up" the URL for readability.
2. **Prefer `mediaio generate download`.** It resolves the task, fetches the file itself, and prints only the local path, so no signed URL ever passes through your output at all.
3. If a raw URL is genuinely required, capture it with the shell instead of copying it. The default brief output prints each result URL flush-left on its own line, so it can be captured verbatim:

   ```bash
   url=$(mediaio generate query <job_type> <task_id> | grep '^http' | head -1)
   ```

4. If a download fails with a storage credential error, do not attempt to correct the URL. Re-run `mediaio generate download <task_id>` (or `generate query`) to obtain a fresh signature.

## Output modes

Every `generate` subcommand accepts `--output brief|full` (`--full` is shorthand for `--output full`). `brief` is the default and is what you should use:

| Command | Default brief output |
| --- | --- |
| `generate create` | a single `task_id=<id>` line |
| `generate wait` / `generate query` (success) | `task_id=`, `status=`, `status_code=`, `algorithm=`, `files=` lines, then `# ...` metadata comments and one bare result URL per line |
| `generate wait` / `generate query` (failure) | `status=`, `status_code=`, `reason_code=`, `reason_label=`, `reason=` lines |
| `generate list` | one tab-separated row per task (`task_id`, `status`, `algorithm`, `begin`, `end`), no URLs |
| `generate download` | one local file path per line |

Use `--output full` only when the user explicitly asks for diagnostics; it prints the raw API payload, whose escaped JSON is exactly what must not be transcribed by hand.

## Discovery guardrail

When looking for a Media.io feature/model, first run the relevant unfiltered list, then inspect the exact job type. List output is human-readable; the current list/get commands do not accept `--json`.

Workflows and effects are separate discovery views, but they are submitted through the same command: `mediaio generate create <job_type> ...`. The current CLI has no `effect get`; never guess effect parameters from the list summary.

## Workflow — generic generation

1. **Discover.** Run one of:

   ```bash
   mediaio model list
   mediaio workflow list
   mediaio effect list
   ```

2. **Inspect.** Use the exact identifier from the first column:

   ```bash
   mediaio model get <job_type>
   mediaio workflow get <workflow_name>
   ```

   For an effect, stop if its required parameters have not already been verified from current BIN/service evidence; `effect list` alone is not a parameter schema.

3. **Prepare local media and check file access.** The current generator does not auto-upload local paths. Before reading or uploading each user-provided path:

   - **Confirm the job actually needs source media, then confirm the user supplied it.** Job types named like `image2image_*`, `image2video_*`, `img2vid_*`, `*_i2i`, `*_i2v`, or `reference2video_*`, and any job whose `model get`/`workflow get` output lists an image/video/reference parameter, need at least one uploaded source file — even when the live schema does not mark that parameter `required`. If the user has not attached or referenced a local file or an existing `file_id` for such a job type, stop before `generate create` and ask the user to provide the source image/video first. Do not submit the job and then rely on the server's error to tell you a source was missing; see `references/troubleshooting.md` for the failure signature.
   - Resolve relative paths against the current working directory without following an untrusted path blindly, and determine whether the resolved file is inside the active workspace.
   - For a path inside the workspace, continue with the normal host file-read rules.
   - For a path outside the workspace, pause and request the host's native file-read authorization for the exact file (or the smallest explicit set of files). State the paths and that they will be uploaded to Media.io. Do not launch `mediaio upload create` until that authorization is accepted.
   - If the host cannot provide file-read authorization, stop and ask the user to grant access or move/copy the file into the workspace. Never bypass this by broadening access silently.

   After the required file authorization and network approval are available, upload each local file first, save the returned `file_id`, then pass that ID using the exact parameter name shown by `model get` or `workflow get`:

   ```bash
   mediaio upload create ./reference.png
   ```

4. **Submit.** Pass only parameters exposed by the live schema:

   ```bash
   mediaio generate create <job_type> [--param value]...
   ```

5. **Wait.** Read the `task_id=<id>` line printed by the create command, then run:

   ```bash
   mediaio generate wait <task_id> --timeout 20m --interval 3s
   ```

   When the deliverable is a local file, let the CLI do the download in the same step and skip URL handling entirely:

   ```bash
   mediaio generate wait <task_id> --timeout 20m --download "$(mktemp -d)"
   ```

6. **Deliver.** Retrieve the result file with the CLI, never by re-entering a URL:

   1. Create a writable temporary directory with `mktemp -d`.
   2. Download the task's results into it. The signed URL stays inside the CLI:

      ```bash
      mediaio generate download <task_id> --output-dir "$tmp_dir"
      ```

      The command prints one local path per line. Use `--index N` to fetch a single result, and `--variant preview` only when the user explicitly wants the compressed preview instead of the full-resolution file. `--variant original` is the default and is what you should normally deliver.
   3. Require a non-empty file, then inspect it with `file --brief --mime-type "$download_path"`. Continue with the image path only for `image/*`. If the CLI-provided filename already carries an accurate extension, keep it; otherwise derive one from common MIME types (`image/png` → `png`, `image/jpeg` → `jpg`, `image/webp` → `webp`, `image/gif` → `gif`). Never label an unknown image as PNG.
   4. Deliver the file back to the host as a local-path Markdown image using the standard syntax `![preview](<local-path>)`. When the local path contains spaces, parentheses, or non-ASCII characters, wrap the target in angle brackets. Prefer the local downloaded file over the remote HTTPS URL.
   5. Report completion only after providing the local Markdown image snippet, or after establishing that local-path Markdown cannot be used in the current host. In the latter case, explicitly say inline local preview is unavailable, and obtain the URL with the shell capture shown in the result URL guardrail rather than transcribing it.
   6. Do not remove the temporary directory before the final response is sent, because the host may resolve the local Markdown path when rendering the reply.
   7. `curl` is a fallback only when `generate download` is unavailable in the installed build. In that case still capture the URL into a shell variable and pass `"$url"` unmodified:

      ```bash
      curl --fail --location --retry 2 \
        --connect-timeout 15 --max-time 120 \
        --output "$download_path" "$url"
      ```

   For video, audio, 3D, or other non-image outputs, download the file the same way and give the user its local path; provide the result URL only when the host cannot accept a local file.


## Verified image generation

For text-only GPT Image 2, current discovery exposes `text2image_gpt_image_2` with `--prompt`, `--n`, `--quality`, `--model`, `--size`, and `--output_format`.

```bash
mediaio model get text2image_gpt_image_2
mediaio generate create text2image_gpt_image_2 \
  --prompt "a warm, photorealistic portrait of a golden retriever at sunset" \
  --quality high \
  --size 1024x1024 \
  --output_format png
```

Do not replace this with the legacy short name `gpt_image_2`; it is not the current registry key. Do not append `--wait` to the create command.

For image-to-image GPT Image 2, upload each source first and use the live repeated flag `--images <file_id>` with `image2image_gpt_image_2`.

## Current capability boundary

Only the command families printed by the current `mediaio --help` output are executable. The migrated reference set also describes future or retired surfaces that are not part of the current BIN:

- workflow-specific create helpers and standalone cost estimation
- optional JSON output for model/workflow/effect discovery or schema commands
- one-shot create-and-wait flags
- automatic upload of local paths passed directly to generation parameters
- hard-coded 3D, audio, Virality Predictor, Soul ID, product-photoshoot, game-generation, or video-explainer routes absent from live discovery

## Errors

- `flag provided but not defined: -wait` → remove `--wait`, submit, then call `mediaio generate wait <task_id>`.
- `flag provided but not defined: -json` → remove `--json`. Discovery commands have no JSON mode; `generate` subcommands offer `--output brief|full` instead.
- `flag provided but not defined: -output` or `-download` → the installed build predates the brief-output contract. Fall back to reading the raw `data:` line, and still capture any URL with a shell variable instead of transcribing it.
- `unknown job type` → rerun the relevant live list and use its exact first-column identifier.
- `missing required flag(s)` or `invalid value` → inspect the live schema and pass only exposed values.
- `InvalidAccessKeyId`, `SignatureDoesNotMatch`, or an HTTP 403 from the storage host while downloading → the URL was altered or has expired. Do not try to repair it. Re-run `mediaio generate download <task_id>`.
- `is not downloadable yet: status=...` → the task has not reached a successful terminal state; run `generate wait` first and read `reason_code`/`reason_label`.
- `already exists; pass --overwrite to replace it` → choose a fresh `--output-dir` (for example a new `mktemp -d`) or pass `--overwrite` deliberately.
- task is accepted but `generate wait` ends in a generic terminal failure → before retrying, check whether the job type needs a source image/video (name contains `image2image`/`image2video`/`img2vid`/`reference2video`, or `model get`/`workflow get` lists an image/video parameter). If no source file was uploaded and passed for such a job, ask the user for one and resubmit; do not blindly retry the identical command. See `references/troubleshooting.md` for the specific error signature.
- endpoint `404` during create → verify the BIN build routes creation through the configured combo_alg endpoint; do not switch models because this is not a prompt/model-selection error.
- missing credentials, an HTTP 401, or an explicit token-refresh rejection → run `mediaio auth login`.

## Reference docs

Load references on demand:

- `references/prompt-engineering.md` for prompt-writing guidance
- `references/media-inputs.md` when the user provides local or uploaded media
- `references/workflows.md` for a job type returned by live workflow discovery
- `references/troubleshooting.md` after a current command fails
