# Media.io Agent Skills

通过 `npx skills add <repository>/skills` 安装 Media.io Skills。

## Skills

### `mediaio-combo-alg-transformer`

将 Media.io `/v1/workflow/list` 配置、已确认的 `uni_fun_code` 和用户输入转换为 `combo_alg` JSON body。

```text
skills/mediaio-combo-alg-transformer/
├── SKILL.md
├── references/
│   ├── workflow-combo-alg.md
│   └── 测试说明.md
└── scripts/
    └── combo-alg-transformer.mjs
```

该 skill 只做数据转换，不获取模型配置、不选择模型、不执行生图/生视频、不上传媒体、不发 HTTP 请求，也不提交或查询任务。

## 验证

```bash
node --check skills/mediaio-combo-alg-transformer/scripts/combo-alg-transformer.mjs
node --test tests/mediaio-combo-alg-transformer/combo-alg-transformer.test.mjs
node tests/mediaio-combo-alg-transformer/run-live-test.mjs
```

真实 list 接口测试与手工输入步骤见 `skills/mediaio-combo-alg-transformer/references/测试说明.md`。联网逻辑只存在于 `tests/` 下的测试运行器，正式转换脚本仍保持离线纯转换。
