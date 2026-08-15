---
name: mediaio-generate
description: |
  Generate images and videos through the currently installed Media.io CLI.
  Use for text-to-image, image-to-image, text-to-video, image-to-video,
  reference-to-video and published workflows that appear in the live
  `mediaio model list` or `mediaio workflow list`. Effects may be used only
  when their parameters have been independently verified because the current
  CLI exposes `effect list` but not `effect get`.
  Always discover the exact job type and schema before submission. Use the
  human-readable discovery output, upload local files before generation,
  submit with `generate create`, and wait with the separate `generate wait` command.
allowed-tools: Bash
---

# Media.io Generate

Submit image and video jobs through the current `mediaio` CLI contract. Treat CLI help, model/workflow/effect discovery, and `model get`/`workflow get` output as the source of truth.

## Step 0 — Bootstrap

Before any generation command:

1. Run `command -v mediaio` and `mediaio version`. If the command is missing, tell the user that the shared Media.io CLI must be installed; do not silently install a second runtime from this skill.
2. Before the first networked `mediaio` command, obtain the host's narrowest native network-only approval, scoped to the required destination when supported. If network-only approval is unavailable, use a general out-of-sandbox approval only after reviewing its wider scope and presenting that approval to the user. A global Codex permission-profile edit is not a prerequisite.
3. Run `mediaio account status`. If authentication is genuinely missing, expired or rejected by the server, run `mediaio auth login` and wait for the browser flow to finish. DNS, TLS, timeout, connection and sandbox-denial errors are network failures, not authentication failures.
4. On a network or permission failure, load `references/troubleshooting.md`. Retry read-only commands only after a clear pre-connection sandbox/DNS failure; never automatically retry a write with an ambiguous result.
5. Run `mediaio config get` when an endpoint or environment mismatch is suspected.

## UX Rules

1. Be concise. Do not paste raw registry output or full response payloads unless the user asks for diagnostics.
2. Do not expose access tokens, credentials, prompts from unrelated tasks, or request debug payloads.
3. Detect the user's language from the first message and reply in it. Technical args (`--aspect_ratio 16:9`) stay English.
4. Don't batch-ask. Pick a sane default model and ask one thing at a time only if genuinely missing.
5. Never invent a job type or parameter. Discover both from the current CLI.
6. Submit first, extract the returned `task_id`, then call `mediaio generate wait <task_id>`. The current `generate create` command does not accept `--wait`.

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

3. **Prepare local media.** The current generator does not auto-upload local paths. Upload each local file first, save the returned `file_id`, then pass that ID using the exact parameter name shown by `model get` or `workflow get`:

   ```bash
   mediaio upload create ./reference.png
   ```

4. **Submit.** Pass only parameters exposed by the live schema:

   ```bash
   mediaio generate create <job_type> [--param value]...
   ```

5. **Wait.** Extract `task_id` from the `data:` line of the create response, then run:

   ```bash
   mediaio generate wait <task_id> --timeout 20m --interval 3s
   ```

6. **Deliver.** Read the terminal response and provide the primary generated asset URL plus a short summary. Keep the full payload only for diagnostics.

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

- workflow-specific create helpers, standalone cost estimation, and retired result helpers
- optional JSON output for model/workflow/effect discovery or schema commands
- one-shot create-and-wait flags
- automatic upload of local paths passed directly to generation parameters
- hard-coded 3D, audio, Virality Predictor, Soul ID, product-photoshoot, game-generation, or video-explainer routes absent from live discovery

## Errors

- `flag provided but not defined: -wait` → remove `--wait`, submit, then call `mediaio generate wait <task_id>`.
- `flag provided but not defined: -json` → remove `--json`; this command currently has no JSON mode.
- `unknown job type` → rerun the relevant live list and use its exact first-column identifier.
- `missing required flag(s)` or `invalid value` → inspect the live schema and pass only exposed values.
- endpoint `404` during create → verify the BIN build routes creation through the configured combo_alg endpoint; do not switch models because this is not a prompt/model-selection error.
- missing credentials, an HTTP 401, or an explicit token-refresh rejection → run `mediaio auth login`.

## Reference docs

Load references on demand:

- `references/prompt-engineering.md` for prompt-writing guidance
- `references/media-inputs.md` when the user provides local or uploaded media
- `references/workflows.md` for a job type returned by live workflow discovery
- `references/troubleshooting.md` after a current command fails
