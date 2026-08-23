# Workflow Generation

Use only workflows exposed by the currently installed BIN. Workflow identifiers and schemas are dynamic; historical names in planning documents are not executable unless they appear in live discovery.

## Discover

```bash
mediaio workflow list
mediaio workflow get <workflow_name>
```

Take the exact identifier from the first column of `workflow list`. `workflow get` prints the accepted parameters, defaults, allowed values, media fields, and raw credit configuration. These commands produce their documented human-readable output and have no optional JSON mode.

## Prepare media

Generation parameters accept uploaded file IDs, not local paths. Upload every local input first:

```bash
mediaio upload create ./source.mp4
mediaio upload create ./reference.png
```

Save each returned `file_id`, then map it to the exact parameter name shown by `workflow get`.

## Submit

Workflows use the same create command as models:

```bash
mediaio generate create <workflow_name> [--param value]...
```

The create response prints a `task_id=<id>` line. Wait separately:

```bash
mediaio generate wait <task_id> --timeout 20m --interval 3s
```

Retrieve the result file with the CLI instead of copying its signed URL:

```bash
mediaio generate download <task_id> --output-dir "$tmp_dir"
```

To query a known task directly when both values are available:

```bash
mediaio generate query <workflow_name> <task_id>
```

## Cost information

Run `mediaio generate estimate <workflow_name> [--param value]... --json` with the exact parameters you are about to submit. It spends nothing and returns the credit cost, the billed fields and the account balance. Show that number to the user and wait for their approval before `generate create`, then submit with `--yes`.

When the estimate returns `known=false`, the cost cannot be resolved locally (for example a rule that depends on server-side media metadata). Tell the user the exact cost is unavailable instead of inventing it, and submit only after they approve.

`mediaio workflow get <workflow_name>` still prints the raw credit configuration for diagnostics.

## Historical inventory

`draw_to_video` and `reframe` were documented by the migrated reference set, but they are not current commands unless live `workflow list` returns those exact identifiers. Preserve their product requirements as planning input only:

- Draw-to-video: source video, edited frame, timestamp, and edit instruction.
- Reframe: source video, target aspect ratio, optional resolution, and optional reference media.

## Maintainer rule

For every documented workflow:

1. Confirm its exact identifier in live `mediaio workflow list`.
2. Confirm its complete schema with `mediaio workflow get <workflow_name>`.
3. Build examples only with `mediaio generate estimate`, then `mediaio generate create --yes`, then `mediaio generate wait`.
4. Keep result lookup on `mediaio generate query <workflow_name> <task_id>` and result retrieval on `mediaio generate download <task_id>`.
5. Document cost only from `mediaio generate estimate` output returned by the live BIN.
