# workflow → combo_alg 字段转换规则

本文只描述 `combo-alg-transformer.mjs` 的数据输入、映射规则和输出。脚本不负责获取配置、选择模型、调用接口或执行生图/生视频任务。

## 转换 contract

```text
workflow/list JSON + uni_fun_code + inputs/context
→ combo_alg JSON body
```

脚本接受以下任一种 workflow 来源：

- `/v1/workflow/list` 的完整响应，例如 `{ "data": { "list": [...] } }`。
- workflow 记录数组。
- 单个包含 `uni_fun_code` 的 workflow 记录。

`aigc_config`、`ui_config`、`action_config` 和 `credit_config` 可以是已经解析的 JSON，也可以是 JSON 字符串。

## 用户数据格式

推荐输入：

```json
{
  "inputs": {
    "prompt": "A cinematic portrait with soft natural light",
    "ratio": "2:3",
    "concurrency_patterns": 4
  },
  "context": {
    "countryLimited": "not_t3",
    "isPublic": true,
    "isSubscribed": true,
    "templateId": "60005280"
  }
}
```

`inputs` 的 key 来自当前 workflow 的 `ui_config.params_ui[].param`。脚本也接受 `fields` 数组，或直接将字段放在输入对象顶层。

## 输出格式

脚本只输出 body，不包含 `method`、URL、endpoint、header 或 task ID：

```json
{
  "data": {
    "ai_config": [],
    "action_config": {},
    "uni_fun_code": "text2image_soul_character",
    "fun_module": "text2image"
  },
  "prev_task": "",
  "explore": false,
  "user_data": {},
  "module": "text2image"
}
```

## 字段映射

### `normal`

UI 字段名与算法参数名相同时，用户值写入同名 `paraslist[].input`。

```text
inputs.prompt → ai_config...paraslist[prompt].input
```

### `backfill`

一个 UI 字段按 `backfill` 顺序拆分为多个算法参数。比例可以使用展示值，脚本先按 option 转为真实值，再拆分宽高。

```json
{
  "param": "ratio",
  "type": "backfill",
  "backfill": ["width", "height"],
  "options": [{ "name": "2:3", "value": [848, 1264] }]
}
```

输入 `"2:3"` 后得到：

```text
width.input  = "848"
height.input = "1264"
```

对象形式适合混合媒体：

```json
{
  "inputs": {
    "mixMedia": {
      "reference_images": ["image-1", "image-2"],
      "reference_videos": ["video-1"],
      "reference_audios": []
    }
  }
}
```

### `used_array`

当配置设置 `used_array=true` 时，数组会序列化为算法参数需要的 JSON 数组字符串：

```text
["file-1", "file-2"] → "[\"file-1\",\"file-2\"]"
```

### `prefix`

`prefix` 会放在用户值之前，并用逗号连接：

```text
prefix="cinematic", prompt="a dancer"
→ "cinematic,a dancer"
```

### `append`

`append.param` 指定目标参数；`append.mode` 为 `front` 时前置，否则后置。

### option 与显示规则

- option 可通过 `value`、`name` 或 `alias` 匹配。
- `rule.show` 不满足时，对应字段不参与本次转换。
- option 自身的 `rule.show` 不满足时返回 `OPTION_NOT_AVAILABLE`。
- 必填字段没有输入且没有默认值时返回 `REQUIRED_INPUT_MISSING`。

### 自动尺寸

当 backfill 值为 `autoWidth` / `autoHeight` 时，`context.uploads[0]` 或 `context.upload` 必须提供原始 `width` 和 `height`：

```json
{
  "inputs": {
    "ratio": "autoWidth:autoHeight"
  },
  "context": {
    "uploads": [{ "width": 2000, "height": 1000 }]
  }
}
```

脚本按约 1MP、8 像素对齐、默认不放大的规则计算目标尺寸。这仍是纯数据计算，不读取媒体文件。

## context 映射

| 字段 | 转换用途 |
|---|---|
| `countryLimited` / `country_limited` | 写入 `data.country_limited`；只接受 `t3` 或 `not_t3`。 |
| `isT3Country` | 国家分段的布尔替代输入。 |
| `isPublic` / `publish` | 计算 `explore`、`need_publish`、`slugs`。 |
| `publishZone` | 计算 Explore 专区字段。 |
| `isSubscribed` / `isPremium` | 参与发布字段和 unlimited 展示积分转换。 |
| `creditsNumber` | 显式写入 `user_data.credits_number`。 |
| `free` | 将展示积分转换为 `0`。 |
| `templateId`、`thumbnailUrl`、`capId` | 写入对应 `user_data` 元数据。 |
| `tracking` | 将调用方提供的跟踪字段合并进 `user_data`。 |
| `prevTask` / `prev_task` | 写入顶层及 `user_data.prev_task`。 |
| `uploads` / `upload` | 仅为自动尺寸提供宽高元数据。 |

`user_data.credits_number` 是转换结果中的展示/归档值，不代表实际扣费结果。

## 覆盖的配置机制

转换器不硬编码模型清单，而是按传入配置处理生图、生视频及相关模块。当前实现覆盖：

- `normal`
- `backfill`
- `append`
- `prefix`
- `used_array`
- `ui_2image` / `ui_3image`
- `ui_images_videos_audios`
- `concurrency_patterns`、`idle`、`unlimit`
- `country_limited`
- `fixed` 和 `field_conf` 积分展示值

## 边界

- 不读取媒体内容，只消费输入 JSON 中已经存在的 ID、URL 或尺寸元数据。
- 不获取 workflow 配置，不决定 `uni_fun_code`。
- 不生成 endpoint descriptor，不处理认证或 header。
- 不发起 HTTP 请求，不创建、等待、查询或取消任务。
- 不维护另一套完整的 Media.io 生成编排。
