# Media.io Agent Skills

`media-plugin-main` maintains plugin manifests for both `Codex` and `Claude Code`.
They share the same `skills/` directory, but each host uses its own manifest:

- `Codex`: `.codex-plugin/plugin.json`
- `Claude Code`: `.claude-plugin/plugin.json`

The current `Claude Code` integration reuses a locally installed `mediaio` CLI
and does not depend on remote MCP configuration from `media-plugin-api` or
`media-plugin-mcp`.

## Image result delivery

Generated image delivery is host-dependent:

- For image results, download the HTTPS result to a local file, validate it is
  `image/*`, and return that file using standard Markdown image syntax such as
  `![preview](</tmp/generated.png>)`.
- When the local path contains spaces, parentheses, or non-ASCII characters,
  wrap the Markdown target in angle brackets.
- Keep the downloaded local file available until the response is rendered.
- If a host does not render local-path Markdown images, fall back to the HTTPS
  result URL.

## Installation

### Codex

Install the Media.io skills with:

```bash
npx skills add <repository>/skills
```

### Claude Code

Install the local CLI runtime first:

```bash
npm install -g @mediaio/cli
mediaio auth login
mediaio version
```

Then install this repository as a `Claude Code` plugin and use
`.claude-plugin/` as the plugin manifest directory.

> The `Claude Code` plugin does not silently install a second binary. Make sure
> the `mediaio` command is already available on the current machine before
> running the skill.

## Current Skills

### `mediaio-generate`

This skill reuses the installed shared `mediaio` CLI to discover and invoke the
image, video, and workflow generation capabilities currently exposed by the
binary. Effects can be discovered, but the current BIN still has no `effect get`
parameter inspection command, so parameter schemas must not be inferred from
list summaries.

Current execution contract:

```text
mediaio model|workflow|effect list
  → mediaio model|workflow get <job_type>
  → mediaio generate create <job_type> [--param value]...
  → mediaio generate wait <task_id>
```

The skill does not bundle a second binary, does not silently install the CLI,
and does not call commands that the current BIN does not yet implement,
including `marketing-studio`, `generate workflow`, `generate cost`,
`generate get`, inline `--wait`, or discovery `--json`.

Files such as `skills/mediaio-generate/references/marketing-*.md` are retained
only as reference material for capability inventory and do not mean the
corresponding commands are currently available.

## Verification

```bash
mediaio --help
mediaio model list
mediaio model get text2image_gpt_image_2
```
