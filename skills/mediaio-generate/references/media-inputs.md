# Media Inputs

Use the installed BIN schema as the authority for image, video, and audio parameters. Product labels and historical model IDs in migration documents are not accepted evidence for an executable command.

## Discover accepted inputs

```bash
mediaio model list
mediaio model get <job_type>
```

For a published workflow, use:

```bash
mediaio workflow list
mediaio workflow get <workflow_name>
```

The detail output identifies the exact parameter names, whether each one is required or repeated, defaults, and allowed values. Use the spelling printed by the BIN; do not infer a media role from a product name.

## Confirm source media before submitting

Some job types functionally need a source image/video even when the live schema does not mark that parameter `required` — the server still fails the task after accepting it. Treat a job type as needing source media when either is true:

- Its name matches a pattern like `image2image_*`, `image2video_*`, `img2vid_*`, `*_i2i`, `*_i2v`, or `reference2video_*`.
- `model get`/`workflow get` lists an image/video/reference parameter in its schema, regardless of whether it is flagged required.

Before uploading anything or calling `generate create` for such a job type, confirm the user has already attached a local file or given an existing `file_id`. If not, stop and ask for the source image/video — do not submit and wait for the server to reject it. A missing source for these models typically surfaces as a generic terminal failure after submission succeeds (e.g. `status=4`, a numeric `reason_code` such as `680100`, a non-specific system-error message), not as a clear `missing required parameter` error.

## Upload local files

The current generator does not auto-upload paths passed to generation parameters. Before upload, resolve each user-provided path and check it against the active workspace:

- Paths inside the workspace use the host's normal file-read rules.
- Paths outside the workspace require an explicit host-native file-read authorization for the exact path (or the smallest explicit set of paths). Tell the user which files will be read and uploaded to Media.io, and wait for approval before starting `mediaio upload create`.
- If file-read authorization is unavailable or denied, do not try the upload. Ask the user to grant access or move/copy the file into the workspace.

After file access and network approval are granted, upload every local file first:

```bash
mediaio upload create ./reference.png
mediaio upload create ./source.mp4
mediaio upload create ./reference.wav
```

Each call prints a `file_id`. Pass that ID through the exact parameter exposed by `model get` or `workflow get`.

## Submit, wait, and retrieve

```bash
mediaio generate create <job_type> [--param value]... --yes
mediaio generate wait <task_id> --timeout 20m --interval 3s
mediaio generate download <task_id> --output-dir "$tmp_dir"
```

Run these as separate steps. The create command prints a `task_id=<id>`
line; read the ID from there before calling `generate wait`.

Use `generate download` to obtain the result file. Its non-comment lines are
local paths, and each file is preceded by a `# file[N] ...` metadata line and a
`# url[N] <url>` line, so the URL is available for display without ever being
retyped. `generate wait <task_id> --download "$tmp_dir"` combines the last two
steps.

## Verified GPT Image 2 image-to-image flow

The current registry exposes `image2image_gpt_image_2`. Upload every source image, then pass each returned ID with the repeated `--images` parameter:

```bash
mediaio model get image2image_gpt_image_2
mediaio upload create ./reference.png
mediaio generate create image2image_gpt_image_2 \
  --prompt "preserve the subject and change the setting to a warm studio" \
  --images <file_id> \
  --yes
```

Wait with the returned task ID, then download the result:

```bash
mediaio generate wait <task_id> --timeout 20m --interval 3s
mediaio generate download <task_id> --output-dir "$tmp_dir"
```

## Repeated inputs

Repeat a parameter only when the live schema marks it as repeated. For example, the verified GPT Image 2 image-to-image schema accepts repeated `--images` values:

```bash
mediaio generate create image2image_gpt_image_2 \
  --prompt "combine these references into one coherent product scene" \
  --images <first_file_id> \
  --images <second_file_id> \
  --yes
```

## Error recovery

- `unknown job type` — rerun the relevant live list and use its exact first-column identifier.
- `unknown parameter` — inspect the live detail output and remove or rename the parameter.
- `missing required parameter` — provide the exact required value shown by the schema.
- Media-count or media-role errors — use only the role and repetition limits exposed by the current schema.
- A local path rejected during create — upload it first and retry with the returned `file_id`.
- A storage credential error (`InvalidAccessKeyId`, `SignatureDoesNotMatch`) while fetching a result — the URL was altered or expired. Never repair it by hand; re-run `mediaio generate download <task_id>`.
