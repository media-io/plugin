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

## Upload local files

The current generator does not auto-upload paths passed to generation parameters. Upload every local file first:

```bash
mediaio upload create ./reference.png
mediaio upload create ./source.mp4
mediaio upload create ./reference.wav
```

Each call prints a `file_id`. Pass that ID through the exact parameter exposed by `model get` or `workflow get`.

## Submit and wait

```bash
mediaio generate create <job_type> [--param value]...
mediaio generate wait <task_id> --timeout 20m --interval 3s
```

Run these as two steps. Extract `task_id` from the create response before calling `generate wait`.

## Verified GPT Image 2 image-to-image flow

The current registry exposes `image2image_gpt_image_2`. Upload every source image, then pass each returned ID with the repeated `--images` parameter:

```bash
mediaio model get image2image_gpt_image_2
mediaio upload create ./reference.png
mediaio generate create image2image_gpt_image_2 \
  --prompt "preserve the subject and change the setting to a warm studio" \
  --images <file_id>
```

Wait with the returned task ID:

```bash
mediaio generate wait <task_id> --timeout 20m --interval 3s
```

## Repeated inputs

Repeat a parameter only when the live schema marks it as repeated. For example, the verified GPT Image 2 image-to-image schema accepts repeated `--images` values:

```bash
mediaio generate create image2image_gpt_image_2 \
  --prompt "combine these references into one coherent product scene" \
  --images <first_file_id> \
  --images <second_file_id>
```

## Error recovery

- `unknown job type` — rerun the relevant live list and use its exact first-column identifier.
- `unknown parameter` — inspect the live detail output and remove or rename the parameter.
- `missing required parameter` — provide the exact required value shown by the schema.
- Media-count or media-role errors — use only the role and repetition limits exposed by the current schema.
- A local path rejected during create — upload it first and retry with the returned `file_id`.
