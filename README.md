# Media.io Agent Skills

Agent skills that drive the [Media.io](https://www.media.io/ai/home) CLI from
Codex and Claude Code: discover models and workflows, generate images and
videos, and download the results.

## Install

Both hosts run the Media.io CLI on your machine, so install and sign in first:

```bash
npm install -g @mediaio/cli
mediaio auth login
```

### Codex

```bash
npx skills add <repository>/skills
```

### Claude Code

Install this repository as a plugin and point the host at `.claude-plugin/`.

The plugin never installs or repairs the CLI for you — make sure `mediaio` is
already on your `PATH`.

## Skills

- **`mediaio-generate`** — discover models, workflows, and effects, submit a
  generation job, wait for it, and download the result files.
- **`mediaio-install`** — install or refresh the CLI and the plugin manifests.

## Layout

| Path | Purpose |
|---|---|
| `.codex-plugin/plugin.json` | Codex manifest |
| `.claude-plugin/plugin.json` | Claude Code manifest |
| `skills/` | Shared skills used by both hosts |

Every release keeps both manifests and the shared skills on the same version so
each host loads the same snapshot.

## Links

- Product: <https://www.media.io/ai/home>
- CLI: <https://www.npmjs.com/package/@mediaio/cli>
- Terms of Service: <https://www.media.io/terms-of-service.html>
- Privacy Policy: <https://www.media.io/privacy.html>

## License

MIT — see [LICENSE](LICENSE).
