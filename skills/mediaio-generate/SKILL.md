---
name: mediaio-generate
metadata:
  version: "0.2.5"
description: |
  Generate images and videos through the currently installed Media.io CLI.
  Use for text-to-image, image-to-image, text-to-video, image-to-video,
  reference-to-video and published workflows that appear in the live
  `mediaio model list` or `mediaio workflow list`. Effects may be used only
  when their parameters have been independently verified because the current
  CLI exposes `effect list` but not `effect get`.
  Always discover the exact job type and schema before submission. Every
  submission spends the user's credits, so always run `generate estimate`,
  show the cost to the user, and stop until they explicitly approve.
  Use the human-readable discovery output, upload local files before
  generation, submit with `generate create`, wait with the separate
  `generate wait` command, and retrieve result files with `generate download`
  instead of reproducing signed result URLs.
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
3. Don't batch-ask. Pick a sane default model and ask one thing at a time only if genuinely missing.
4. Never invent a job type or parameter. Discover both from the current CLI.
5. Submit first, read the returned `task_id=<id>` line, then call `mediaio generate wait <task_id>`. The current `generate create` command does not accept `--wait`.
6. Never spend credits without an explicit user approval in the conversation. See the credit confirmation gate below; it outranks every other rule in this skill.

## Credit confirmation gate (hard requirement)

`generate create` charges the user's Media.io credits. Before every submission:

1. **Estimate.** After the parameters are final and any source media is uploaded, run the estimate with the exact same job type and parameters you are about to submit:

   ```bash
   mediaio generate estimate <job_type> [--param value]... 
   ```

   The estimate spends nothing. It reports `credit`, `known`, `rule_type`, the billed `fields`, and the account `balance`.

2. **Ask.** Stop and tell the user the job type, the estimated credit cost, their remaining balance, and that the actual charge is resolved server-side and may be lower. Then ask for approval and **end your turn**. Do not chain the submission into the same turn.

3. **Wait for a real answer.** Only a fresh, explicit user message approving this specific job counts. None of the following is approval:

   - the host running in an auto-approve / YOLO mode
   - a shell-command permission prompt the host approved on your behalf
   - the user's earlier request to generate something
   - your own reasoning that the cost is small

   If the host cannot surface an interactive question to the user, do not submit. Report that the job is ready and is waiting for the user's credit approval.

4. **Submit only after the approval, with `--yes`.**

   ```bash
   mediaio generate create <job_type> [--param value]... --yes
   ```

   `--yes` means "the user approved this exact job in this conversation". It is not a way to get past the prompt — attaching it without a real answer from step 3 is the single worst failure mode of this skill.

   Optionally add `--expect-credit <N>` with the number the user approved. The CLI then re-checks the cost and aborts if the parameters drifted. Use it when the cost is large or the parameters were assembled from several steps.

5. **Never use `--skip-estimate`.** It suppresses the cost line entirely and is for interactive human terminals only.

6. If you passed `--expect-credit` and `generate create` aborts with a mismatch error, re-run the estimate, show the new number, and ask again. Do not "fix" a mismatch by changing the number yourself.

7. On a retry after a failure, treat every resubmission as a new charge and repeat this gate.

### When the user does not want to be asked

Some users do not care about per-job credit costs. Confirmation can be granted at two scopes:

| Scope | How | Applies to |
| --- | --- | --- |
| One call | `--yes` | that single submission |
| The account | `mediaio generate auto-confirm on` | every session, until turned off |

Use the narrowest scope that matches what the user said:

- "yes, go ahead" about one job → `--yes` on that call only.
- "don't ask me again in this chat" → keep submitting with `--yes` on each call; there is no session-only switch.
- "never ask me again" → `mediaio generate auto-confirm on`, after stating plainly that every later session will spend credits without asking and that `auto-confirm off` reverts it.

Rules for the wider scope:

- **Only widen the scope when the user asks for it in their own words.** Never enable the account switch because a job was blocked, because the host is in auto-approve mode, or to work around a `confirmation required` error. That is the exact bug this gate exists to prevent.
- Run `mediaio generate auto-confirm status` if you need to know what is currently in effect. Do not assume.
- Even with a switch on, keep `generate estimate` in the flow and report the cost in your reply, so the user can see what was spent.

## Result URL guardrail (hard rule)

A signed Media.io result URL carries a high-entropy storage credential. Rewriting one character breaks it, and the storage service answers `InvalidAccessKeyId` or `SignatureDoesNotMatch` rather than pointing at the typo. Therefore:

1. **Never retype, re-key, summarise, reformat, or hand-edit a result URL.** Do not strip or add query parameters such as `x-oss-process`, and do not "clean up" the URL for readability.
2. **Prefer `mediaio generate download`.** It resolves the task and fetches the file itself, so the download never depends on you reproducing a signed URL. It echoes the source URL on a `# url[N] <url>` comment line for reference; copy that line verbatim if the user asks for the link.
3. If a raw URL is genuinely required, capture it with the shell instead of copying it. The default brief output prints each result URL flush-left on its own line, so it can be captured verbatim:

   ```bash
   url=$(mediaio generate query <job_type> <task_id> | grep '^http' | head -1)
   ```

4. If a download fails with a storage credential error, do not attempt to correct the URL. Re-run `mediaio generate download <task_id>` (or `generate query`) to obtain a fresh signature.

## Output modes

**Do not pass `--output`.** Every `generate` subcommand defaults to `brief`, which is the only mode you should read:

| Command | Default brief output |
| --- | --- |
| `generate create` | `uni_fun_code=<job_type>` and `task_id=<id>` lines |
| `generate wait` / `generate query` (success) | `task_id=`, `uni_fun_code=`, `algorithm_name=`, `module=`, `status=`, `status_code=`, `files=` lines, then `# ...` metadata comments and one bare result URL per line |
| `generate wait` / `generate query` (failure) | `status=`, `status_code=`, `reason_code=`, `reason_label=`, `reason=` lines |
| `generate list` | one tab-separated row per task (`task_id`, `status`, `uni_fun_code`, `algorithm_name`, `module`, `begin`, `end`), no URLs |
| `generate estimate` | `job type:`, `rule type:`, `billed fields:`, `estimate:`, `balance:`, `note:` lines |
| `generate download` | one local file path per non-comment line, preceded by a `# uni_fun_code <code>` line and per-file `# file[N] ...` metadata and `# url[N] <url>` lines |

`uni_fun_code` is the only field that identifies which model produced a task. The raw `algorithm` field is `combo_alg` for every workflow task, so it is omitted from brief output unless it holds a real value (`tts`, `agent2mv`, ...). Likewise `generate list --algorithm` filters by algorithm channel, not by model.

The other two modes exist for scripts and diagnostics, not for you: `--output json` emits one machine-readable document, `--output full` emits the raw API payload whose escaped JSON is exactly what must never be transcribed by hand. There is no `--json` flag. See `references/troubleshooting.md` if a script needs the JSON contract.

## Discovery guardrail

When looking for a Media.io feature/model, first run the relevant unfiltered list, then inspect the exact job type. List output is human-readable by default; pass `--output json` for a machine-readable form. `mediaio model list` additionally accepts `--module MODULE` (text2image, image2image, text2video, image2video, reference2video) and `--grep SUBSTR` to narrow the catalog without paging through it. `mediaio model get <job_type>` marks parameters as `[workflow-default]` when the workflow supplies a value if the flag is omitted.

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

4. **Estimate and get approval.** Apply the credit confirmation gate above. Run `mediaio generate estimate <job_type> [--param value]...` with the final parameters, show the cost and balance to the user, and stop until they approve. Skip the pause only when the user already opted out for this session or account.

5. **Submit.** Pass only parameters exposed by the live schema, plus `--yes` to record the approval you just received:

   ```bash
   mediaio generate create <job_type> [--param value]... --yes
   ```

6. **Wait.** Read the `task_id=<id>` line printed by the create command, then run:

   ```bash
   mediaio generate wait <task_id> --timeout 20m --interval 3s
   ```

   When the deliverable is a local file, let the CLI do the download in the same step and skip URL handling entirely:

   ```bash
   mediaio generate wait <task_id> --timeout 20m --download "$(mktemp -d)"
   ```

7. **Deliver.** Retrieve every result file with the CLI, never by re-entering, re-fetching, or hand-copying a URL. Do not run `curl`/`wget`/a browser against a result URL yourself, even to "double check" it — that is exactly how a 430-510 character signed URL gets corrupted. If a fetch fails, re-run `generate download`/`generate query` for a fresh signature instead of retrying your own copy of the URL.

   1. Create a writable temporary directory with `mktemp -d`.
   2. Download the task's results into it:

      ```bash
      mediaio generate download <task_id> --output-dir "$tmp_dir"
      ```

      Every non-comment line is a local path; each file is preceded by a `# file[N] ...` metadata line and a `# url[N] <url>` line carrying the source URL. Use `grep -v '^#'` to keep only the paths. Omit `--index` so every result file is downloaded — a task can produce more than one. Use `--index N` only when the user explicitly wants a single specific result, and `--variant preview` only when they explicitly want the compressed preview instead of the full-resolution file. `--variant original` is the default and is what you should normally deliver.
   3. For **each** downloaded path (not just the first), require a non-empty file, then inspect it with `file --brief --mime-type "$download_path"`. Continue with the image path only for `image/*`. If the CLI-provided filename already carries an accurate extension, keep it; otherwise derive one from common MIME types (`image/png` → `png`, `image/jpeg` → `jpg`, `image/webp` → `webp`, `image/gif` → `gif`). Never label an unknown image as PNG.
   4. Deliver **every** verified file back to the host as its own local-path Markdown image, in the same order `generate download` printed them, using the standard syntax `![preview](<local-path>)`. A task with N result files means N images in the reply — never stop after the first one. When a local path contains spaces, parentheses, or non-ASCII characters, wrap the target in angle brackets. Prefer the local downloaded file over the remote HTTPS URL.
   5. Report completion only after providing the local Markdown image snippet, or after establishing that local-path Markdown cannot be used in the current host. In the latter case, explicitly say inline local preview is unavailable, and reuse the `# url[N]` line printed by `generate download` (or the shell capture shown in the result URL guardrail) rather than transcribing the URL.
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
mediaio generate estimate text2image_gpt_image_2 \
  --prompt "a warm, photorealistic portrait of a golden retriever at sunset" \
  --quality high \
  --size 1024x1024 \
  --output_format png
# show the estimate to the user, wait for their approval, then submit
mediaio generate create text2image_gpt_image_2 \
  --prompt "a warm, photorealistic portrait of a golden retriever at sunset" \
  --quality high \
  --size 1024x1024 \
  --output_format png \
  --yes
```

Do not replace this with the legacy short name `gpt_image_2`; it is not the current registry key. Do not append `--wait` to the create command. `--yes` above records the approval the user gave after seeing the estimate; never attach it before that answer arrives.

For image-to-image GPT Image 2, upload each source first and use the live repeated flag `--images <file_id>` with `image2image_gpt_image_2`.

## Current capability boundary

Only the command families printed by the current `mediaio --help` output are executable. The migrated reference set also describes future or retired surfaces that are not part of the current BIN:

- workflow-specific create helpers
- optional JSON output for model/workflow/effect discovery or schema commands
- one-shot create-and-wait flags
- automatic upload of local paths passed directly to generation parameters
- hard-coded 3D, audio, Virality Predictor, Soul ID, product-photoshoot, game-generation, or video-explainer routes absent from live discovery

## Errors

- `flag provided but not defined: -wait` → remove `--wait`, submit, then call `mediaio generate wait <task_id>`.
- `credit confirmation required: ... rerun with --yes only after they approve` → the CLI blocked an unconfirmed charge. Show the printed estimate to the user, wait for a real answer, then resubmit with `--yes`. Never satisfy this error by attaching `--yes`, `--skip-estimate`, or an auto-confirm switch on your own.
- `credit estimate mismatch: --expect-credit X but the current parameters estimate to Y` → the parameters changed after the approval. Show Y to the user and ask again; never silently resubmit with Y.
- `--skip-estimate is only allowed on an interactive terminal` → drop the flag so the cost is printed.
- `--json is not supported; use --output json instead` or `flag provided but not defined: -json` → drop `--json`; you should not be passing an output flag at all.
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
