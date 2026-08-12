---
name: mediaio-combo-alg-transformer
description: "Converts Media.io workflow/list configuration plus a confirmed uni_fun_code and user inputs into a combo_alg JSON body. Use when 用户明确要求转换 workflow/list、uni_fun_code、用户表单数据或 combo_alg payload/body；不用于模型推荐、生成图片/视频、上传、HTTP 请求、任务提交或状态查询。"
---

<CONTEXT>
Read `references/workflow-combo-alg.md` when field mapping or conversion errors need explanation. Read `references/测试说明.md` when manually testing this skill.
</CONTEXT>

# Media.io combo_alg 数据转换器

## 接收输入

调用方必须提供：

- `/v1/workflow/list` 的完整 JSON 响应、其中的 `list` 数组，或单个 workflow 配置。
- 已由调用方确认的 `uni_fun_code`。
- `{ "inputs": {...}, "context": {...} }` 格式的用户数据。

本 skill 不获取 workflow 配置，不推荐或选择模型，也不收集用户表单。

## 执行转换

在 skill 目录中运行：

```bash
node scripts/combo-alg-transformer.mjs \
  --workflow-list <workflow-list.json> \
  --model <uni_fun_code> \
  --input <input.json> \
  --pretty
```

脚本只执行确定性数据转换：

- 按 `uni_fun_code` 定位 workflow 配置。
- 解析 `aigc_config`、`ui_config`、`action_config` 和 `credit_config`。
- 应用 `normal`、`backfill`、`append`、`prefix`、`used_array` 和 option 映射。
- 将用户值回填到 `ai_config`，并组装 `data`、`user_data` 等 body 字段。
- 输出转换后的 `combo_alg` JSON body。

## 校验输出

确认输出顶层包含：

- `data`
- `prev_task`
- `explore`
- `user_data`
- `module`

同时确认 `data.uni_fun_code` 等于调用方传入的 code。脚本不会输出 `method`、endpoint、认证信息或任务结果。

## 处理失败

- `MODEL_REQUIRED`：补充已确认的 `uni_fun_code`。
- `MODEL_NOT_FOUND`：传入的 code 不在本次 workflow 配置中。
- `REQUIRED_INPUT_MISSING`：补充错误指出的用户字段。
- `UNKNOWN_INPUT_FIELD`：修正字段名，禁止静默透传。
- `COUNTRY_SEGMENT_REQUIRED`：由调用方提供国家分段，不得猜测。
- `INVALID_WORKFLOW_CONFIG`：配置字段不是合法 JSON 或缺少必要结构。

## 遵守边界

- 不联网，不调用 `/v1/workflow/list`。
- 不推荐模型，不执行完整的生图或生视频流程。
- 不上传媒体，不读取凭据，不发 HTTP 请求。
- 不提交 `/v1/ai/create/combo_alg`，不等待或查询任务。

字段转换规则见 `references/workflow-combo-alg.md`；手工验证步骤见 `references/测试说明.md`。
