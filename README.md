# Media.io Agent Skills

`media-plugin-main` 同时维护 `Codex` 与 `Claude Code` 两套插件清单，二者共享同一份
`skills/` 内容，但各自使用独立的插件 manifest：

- `Codex`：`.codex-plugin/plugin.json`
- `Claude Code`：`.claude-plugin/plugin.json`

当前 `Claude Code` 适配复用本机已安装的 `mediaio` CLI，不依赖 `media-plugin-api` /
`media-plugin-mcp` 的远端 MCP 配置。

## 安装

### Codex

通过 `npx skills add <repository>/skills` 安装 Media.io Skills。

### Claude Code

先安装本地 CLI runtime：

```bash
npm install -g @mediaio/cli
mediaio auth login
mediaio version
```

再按 `Claude Code` 的插件安装方式加载本仓库，并使用 `.claude-plugin/` 作为插件清单。

> `Claude Code` 插件不会静默安装第二套 binary；运行 skill 前应确保 `mediaio` 命令已在
> 当前机器可用。

## 当前 Skills

### `mediaio-generate`

复用已安装的共享 `mediaio` CLI，发现并调用当前 BIN 已公开的图片、视频与 workflow 生成能力。effect 当前可发现，但 BIN 尚无 `effect get` 参数查询，不能从列表摘要猜参数。

当前执行 contract：

```text
mediaio model|workflow|effect list
  → mediaio model|workflow get <job_type>
  → mediaio generate create <job_type> [--param value]...
  → mediaio generate wait <task_id>
```

Skill 不内置第二套 binary，不静默安装 CLI，也不调用当前 BIN 尚未实现的 `marketing-studio`、`generate workflow`、`generate cost`、`generate get`、inline `--wait` 或 discovery `--json`。

`skills/mediaio-generate/references/marketing-*.md` 等迁入资料目前仅作为能力盘点素材保留，不代表对应命令已经可用。

## 验证

```bash
mediaio --help
mediaio model list
mediaio model get text2image_gpt_image_2
```
