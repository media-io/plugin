# Claude Code 适配落地说明

## 适用范围

本说明用于 `media-plugin-main` 的 Claude Code 适配落地。目标不是重新设计插件体系，而是把当前仓库已经存在的两套宿主元数据和共享技能，整理成可执行、可维护、不会互相覆盖的本地适配方式。

## 当前仓库状态

仓库已经同时维护两套宿主入口：

- Codex：`.codex-plugin/plugin.json`
- Claude Code：`.claude-plugin/plugin.json`
- 共享能力：`skills/`

当前实现已经表明两边不应共享同一套宿主升级动作。Codex 侧依赖本地开发部署和插件缓存刷新，Claude Code 侧则应直接消费仓库内的本地 checkout 和对应 manifest。

## 落地原则

1. Codex 和 Claude Code 各自保留独立宿主入口。
2. `skills/` 目录共享，不复制出两套技能源码。
3. 版本可以在本地开发态短暂不一致，但每次安装或刷新都必须明确显示当前宿主版本。
4. 不把 Codex 的 marketplace 升级语义复用到 Claude Code。
5. 发布态只接受显式对齐，不接受“一个命令顺手改两边”。

## Claude Code 适配结果

Claude Code 适配应满足以下状态：

- 读取 `.claude-plugin/plugin.json` 作为宿主 manifest。
- 使用仓库中的 `skills/` 作为共享技能来源。
- 依赖已安装的 `mediaio` CLI，不在仓库内重新包装第二个二进制。
- 安装和升级动作只影响 Claude Code 自己的插件视图，不改写 Codex 侧配置。

## Codex 侧保持不变

Codex 继续沿用现有的本地开发路径：

- `scripts/deploy-local.sh`
- `scripts/setup-local-mediaio.sh`

这条路径负责本地构建、技能部署、插件缓存刷新和 Codex 侧安装，不应被 Claude Code 的适配过程反向改写。

## Claude Code 侧约束

Claude Code 的适配不要做下面这些事：

- 不调用 `codex plugin marketplace upgrade media-io`
- 不调用 `codex plugin add media-io@media-io`
- 不把本地 checkout 强制切回远端发布版
- 不把 Codex 的插件缓存行为当成 Claude Code 的默认升级语义

Claude Code 的宿主逻辑只需要围绕本地 checkout、`mediaio` CLI 和 `.claude-plugin/` 展开。

## 版本规则

建议按两层处理版本：

### 本地开发态

- 允许 `.codex-plugin/plugin.json` 和 `.claude-plugin/plugin.json` 暂时不同。
- 每次安装、刷新或校验时都打印当前宿主和对应版本。
- 版本不一致时，只提示状态，不自动跨宿主修正。

### 发布对齐态

以下文件需要保持同版本：

- `.codex-plugin/plugin.json`
- `.claude-plugin/plugin.json`
- `skills/mediaio-install/SKILL.md`

这代表同一轮发布的宿主元数据和安装说明。

## 安装语义

### Codex

Codex 侧使用现有本地开发部署流程，保留 marketplace 和本地插件缓存的更新方式。

### Claude Code

Claude Code 侧以本地 checkout 为准：

- 使用 `.claude-plugin/plugin.json`
- 读取共享 `skills/`
- 依赖本机已安装的 `mediaio`
- 只刷新 Claude Code 自己看到的插件状态

## 验收标准

- Claude Code 能独立识别并使用本仓库的插件元数据。
- Codex 的升级动作不会误改 Claude Code 的安装态。
- 两边都能清楚看到当前版本。
- 共享技能只维护一份。
- 本地开发态和发布对齐态的边界清楚，没有混用。

## 结论

这个仓库的 Claude Code 适配，不是再加一套插件体系，而是把现有双宿主结构明确成：

- Codex 负责本地开发和 marketplace 语义
- Claude Code 负责本地 checkout 语义
- `skills/` 负责共享能力

这样后续无论是升级、发布还是排查问题，边界都能保持清晰。
