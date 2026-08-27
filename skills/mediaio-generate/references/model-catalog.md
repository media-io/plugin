# Media.io Model Catalog

> 生成产物，请勿手改。改 `catalog/model-catalog.overlay.json` 后重跑 `sh scripts/model-catalog.sh sync`。

| 元数据 | 值 |
| --- | --- |
| generated_at | 2026-08-27T13:21:28.571Z |
| environment | prod |
| vapi | https://vapi.media.io |
| model_count | 109 |
| snapshot_digest | d19322022f5e9c7d |
| catalog_schema_version | 1 |

## 0. 使用规则

1. **静态优先。** 常规意图路由只读本文件，不要跑 `mediaio model list`。
2. **选型后仍要跑 `mediaio model get <job_type>`** 取参数 schema。本文件不承诺参数，也不得从本文件推断参数。
3. **`job_type` 逐字节复制**，禁止 trim、禁止改大小写、禁止"修正"看起来像笔误的名字。含空格的取值在 shell 里必须加引号。
4. **只能由显示名查 `job_type`，不能反推。** 显示名与 `job_type` 大量不对应（见第 6 节），且有重名；重名时列出候选让用户选。
5. **向用户复述选型时写成 `显示名（job_type）`**，让错位暴露在人眼前。
6. **允许回源的场景只有这几种**，其余一律不许跑 `model list`：
   - 用户点名的模型在第 2、5 节找不到 → `mediaio model list --grep <关键词> --output json`
   - 提交返回 `unknown job type` → 全量 `model list` 复核，并提示目录可能过期
   - 用户明确要"看全部/最新模型"、"有没有新模型" → 全量 `model list`
   - 降级前需确认降级目标仍在线 → `model list --grep` 校验
   - 本文件 `generated_at` 距今超过 30 天，或 `catalog_schema_version` 与 skill 期望不符（**纯本地判断，不发请求**）
   - 本文件缺失或元数据块损坏 → 退化为运行时发现

## 1. 全局默认

| 场景 | 默认模型 | job_type | 降级目标 | job_type |
| --- | --- | --- | --- | --- |
| 纯文生图（无参考图） | ToMoviee Lite | `text2image_soul_character` | ToMoviee Lite | `text2image_soul_character` |
| 图生图（有参考图） | ToMoviee 3.0 Pro | `image2image_media_3.0` | ToMoviee Lite | `image2image_media_1.0` |
| 视频 | Tomoviee 3.0 | `image2video_tomoviee_3.0` | Tomoviee 2.0 Fast | `image2video_tomoviee_2.0_fast` |

## 2. 精选模型

| 显示名 | job_type | 权限等级* | 输入 | 何时选它 |
| --- | --- | --- | --- | --- |
| ToMoviee Lite | `text2image_soul_character` | free | prompt | 纯文生图默认。生产不存在 text2image_media_3.0，这是免费且可直接出图的入口。 |
| ToMoviee 3.0 Pro | `image2image_media_3.0` | unknown | images, prompt | 图生图默认。角色一致性、服装控制与角色编辑的首选。 |
| ToMoviee Lite | `image2image_media_1.0` | unknown | images, prompt | 图生图降级目标。权限不足或额度不够时改用它重试。 |
| GPT Image 2 | `text2image_gpt_image_2` | unknown | prompt | 需要在画面里精准渲染文字、或构图特别复杂时使用。 |
| GPT Image 2 | `image2image_gpt_image_2` | unknown | images, prompt | 带参考图且需要精准文字渲染时使用。 |
| Nano Banana Pro | `text2image_banana_2` | unknown | prompt | 动漫、二次元与创意风格。注意显示名是 Nano Banana Pro，不是 Nano Banana 2。 |
| Nano Banana Pro | `image2image_banana_2` | unknown | images, prompt | 带参考图的动漫与创意风格。显示名是 Nano Banana Pro。 |
| Tomoviee 3.0 | `image2video_tomoviee_3.0` | unknown | image, prompt | 视频默认。没有特殊诉求时一律用它。 |
| Tomoviee 2.0 Fast | `image2video_tomoviee_2.0_fast` | unknown | image, prompt | 视频降级目标。用户要速度、要低成本，或权限/额度不足时改用它。 |
| Seedance 2.5 | `image2video_seedance _2.5` | unknown | image, prompt | 长视频、含音频、电影级质感。job_type 含一个空格，是生产真实取值。 |
| Seedance 2.5 | `image2video_seedance_2.5_reference_image` | unknown | images, prompt | 多模态参考生视频（最多 50 张参考图），属于 reference2video 模块。 |
| Kling 3.0 | `image2video_kling_3.0` | unknown | image, prompt | 强物理规律模拟：破碎、流体、碰撞。 |

\* 权限等级为**人工标注**，registry 无此字段。`unknown` 表示尚未与产品确认。实际是否扣费一律以 `mediaio generate estimate` 与服务端结果为准，不要照本文件向用户承诺免费。

## 3. 场景路由

按顺序匹配，**命中即停**，不要继续往下比。

### 纯文生图（无参考图）

| # | 条件 | 选它 | job_type |
| --- | --- | --- | --- |
| 1 | 画面里要精准渲染文字，或构图特别复杂 | GPT Image 2 | `text2image_gpt_image_2` |
| 2 | 动漫、二次元、创意风格 | Nano Banana Pro | `text2image_banana_2` |
| 3 | 其他所有情况 | ToMoviee Lite | `text2image_soul_character` |

### 图生图（有参考图）

| # | 条件 | 选它 | job_type |
| --- | --- | --- | --- |
| 1 | 画面里要精准渲染文字，或构图特别复杂 | GPT Image 2 | `image2image_gpt_image_2` |
| 2 | 动漫、二次元、创意风格 | Nano Banana Pro | `image2image_banana_2` |
| 3 | 其他所有情况（含角色一致性、换装、角色编辑） | ToMoviee 3.0 Pro | `image2image_media_3.0` |

### 视频

| # | 条件 | 选它 | job_type |
| --- | --- | --- | --- |
| 1 | 多模态参考（多张参考图） | Seedance 2.5 | `image2video_seedance_2.5_reference_image` |
| 2 | 长视频（约 30 秒）、需要音频、电影级质感 | Seedance 2.5 | `image2video_seedance _2.5` |
| 3 | 强物理规律模拟：破碎、流体、碰撞 | Kling 3.0 | `image2video_kling_3.0` |
| 4 | 用户明确要速度或要低成本 | Tomoviee 2.0 Fast | `image2video_tomoviee_2.0_fast` |
| 5 | 其他所有情况 | Tomoviee 3.0 | `image2video_tomoviee_3.0` |

## 4. 降级链

触发条件：服务端返回权限不足、额度不足，或用户明确说要免费/更便宜的。

| 场景 | 从 | 降到 | 说明 |
| --- | --- | --- | --- |
| 纯文生图（无参考图） | `text2image_soul_character` | `text2image_soul_character` | 默认模型本身即降级目标，无需切换 |
| 图生图（有参考图） | `image2image_media_3.0` | `image2image_media_1.0` | 换模型后重新 estimate 再提交 |
| 视频 | `image2video_tomoviee_3.0` | `image2video_tomoviee_2.0_fast` | 换模型后重新 estimate 再提交 |

降级前先按第 0 节规则校验目标仍在线，再重新走一次积分确认。

## 5. 全量索引

快照共 109 个生成类模型。本节只回答"这个模型存不存在、叫什么"，不负责选型。

### text2image — 文生图（12）

| job_type | 显示名 | 描述 |
| --- | --- | --- |
| `text2image_banana` | Nano Banana | Better visuals & image quality. |
| `text2image_banana_2` | Nano Banana Pro | Next-gen AI generation model. |
| `text2image_gpt_image_2` | GPT Image 2 | Superior photorealism, sharp text rendering, and advanced instruction following. |
| `text2image_nano_banana_2` | Nano Banana 2 | Faster generation, great value, and enhanced creative visual features. |
| `text2image_nano_banana_2_lite` | Nano Banana 2 Lite | Fastest, most cost-efficient Gemini Image model. |
| `text2image_seedream_4.0` | Seedream 4.0 | Create images with vivid realism. |
| `text2image_seedream_5.0_lite` | Seedream 5.0 Lite | More accurate instructions, more intelligent outputs. |
| `text2image_seedream_5.0_pro` | Seedream 5.0 Pro | A multimodal image generation model that features advanced reasoning, efficient content creation, and professional production capabilities. |
| `text2image_soul_character` | ToMoviee Lite | Create hyper-realistic characters with unmatched precision and control. |
| `text2image_tomoviee_2.0` | Tomoviee 2.0 | High-res imagery with fast, precise generation. |
| `text2image_wan_2.7` | Wan 2.7 | A streamlined AI model that uses Chain-of-Thought reasoning to efficiently generate high-quality images. |
| `text2image_wan_2.7_pro` | Wan 2.7 Pro | An advanced AI model that utilizes Chain-of-Thought reasoning to generate highly precise, professional-grade images. |

### image2image — 图生图（13）

| job_type | 显示名 | 描述 |
| --- | --- | --- |
| `image2image_banana` | Nano Banana | Better visuals & image quality. |
| `image2image_banana_2` | Nano Banana Pro | Next-gen AI generation model. |
| `image2image_gpt_image_2` | GPT Image 2 | Superior photorealism, sharp text rendering, and advanced instruction following. |
| `image2image_media_1.0` | ToMoviee Lite | Optimized for superior character and clothing control. |
| `image2image_media_2.0` | ToMoviee Pro (ex-Media 2.0) | Pro-grade character consistency, precise clothing control, and semantic accuracy. |
| `image2image_media_3.0` | ToMoviee 3.0 Pro | The ultimate model for character consistency and character editing. |
| `image2image_nano_banana_2` | Nano Banana 2 | Faster generation, great value, and enhanced creative visual features. |
| `image2image_nano_banana_2_lite` | Nano Banana 2 Lite | Fastest, most cost-efficient Gemini Image model. |
| `image2image_seedream_4.0` | Seedream 4.0 | Create images with vivid realism. |
| `image2image_seedream_5.0_lite` | Seedream 5.0 Lite | More accurate instructions, more intelligent outputs. |
| `image2image_seedream_5.0_pro` | Seedream 5.0 Pro | A multimodal image generation model that features advanced reasoning, efficient content creation, and professional production capabilities. |
| `image2image_wan_2.7` | Wan 2.7 | A streamlined AI model that uses Chain-of-Thought reasoning to efficiently generate high-quality images. |
| `image2image_wan_2.7_pro` | Wan 2.7 Pro | An advanced AI model that utilizes Chain-of-Thought reasoning to generate highly precise, professional-grade images. |

### text2video — 文生视频（23）

| job_type | 显示名 | 描述 |
| --- | --- | --- |
| `text2image_gemini_omni_flash` | Gemini Omni Flash | High-performance video model for ultra-fast generation, precise editing, and cinematic control. |
| `text2video_happyhorse_1.0` | HappyHorse 1.0 | A multi-language video generation model with integrated dialogue, ambient sound, and Foley. |
| `text2video_happyhorse_1.5` | HappyHorse 1.1 | A video model featuring realistic physics, consistent characters, and cinematic outputs. |
| `text2video_kling_2.5_turbo` | Kling 2.5 Turbo | Max creativity with Exceptional Value. |
| `text2video_kling_2.6` | Kling 2.6 | See the Sound, Hear the Visual. |
| `text2video_kling_3.0` | Kling 3.0 | The Only Native 4K AI Video Model For Longer, Consistent, Cinematic Generation. |
| `text2video_kling_3.0_fast` | Kling 3.0 Turbo | Speed-optimized variant of Kling 3.0. |
| `text2video_kling_o1` | Kling O1 | All-in-one video model with strong consistency. |
| `text2video_minimax_2.3` | Hailuo 2.3 | Enhanced quality, smoother and truer. |
| `text2video_minimax_h3` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `text2video_seedance _2.0_mini` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `text2video_seedance _2.5` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `text2video_seedance2.0_fast` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `text2video_tomoviee_2.0` | ToMoviee 2.0 | Realism with creative control. |
| `text2video_tomoviee_2.5` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `text2video_veo_3.1` | Google Veo 3.1 | Cinematic video with audio. |
| `text2video_veo_3.1_fast` | Google Veo 3.1 Fast | Speed-optimized video generation. |
| `text2video_veo_3.1_lite` | Google Veo 3.1 Lite | Fast & affordable drafting. Best for simple shots. |
| `text2video_veo_3_fast` | Google Veo 3 Fast | Speed-optimized realism. |
| `text2video_vidu_q3` | Vidu Q3 | Multi-shot, Audio-Video Sync. |
| `text2video_wan_2.5` | Wan 2.5 | High-quality video generation with smooth, stable frames. |
| `text2video_wan_2.6` | Wan 2.6 | Multi-scene videos from visual references, with narration. |
| `text2video_wan_3.0` | Wan 3.0 | Create 30-second stories with expressive character performances. |

### image2video — 图生视频（50）

| job_type | 显示名 | 描述 |
| --- | --- | --- |
| `image2video_gemini_omni_flash` | Gemini Omni Flash | High-performance video model for ultra-fast generation, precise editing, and cinematic control. |
| `image2video_happyhorse_1.0` | HappyHorse 1.0 | A multi-language video generation model with integrated dialogue, ambient sound, and Foley. |
| `image2video_happyhorse_1.5` | HappyHorse 1.1 | A video model featuring realistic physics, consistent characters, and cinematic outputs. |
| `image2video_kling_2.1` | Kling 2.1 | Balanced realism & speed. |
| `image2video_kling_2.1_head_and_tail` | Kling 2.1 | Balanced realism & speed. |
| `image2video_kling_2.1_master` | Kling 2.1 Master | Pro-level realism. |
| `image2video_kling_2.5_turbo` | Kling 2.5 Turbo | Max creativity with Exceptional Value. |
| `image2video_kling_2.5_turbo_head_and_tail` | Kling 2.5 Turbo | Kling 2.5 Turbo. |
| `image2video_kling_2.6` | Kling 2.6 | See the Sound, Hear the Visual. |
| `image2video_kling_3.0` | Kling 3.0 | The Only Native 4K AI Video Model For Longer, Consistent, Cinematic Generation. |
| `image2video_kling_3.0_fast` | Kling 3.0 Turbo | Speed-optimized variant of Kling 3.0. |
| `image2video_kling_3.0_head_and_tail` | Kling 3.0 | The Only Native 4K AI Video Model For Longer, Consistent, Cinematic Generation. |
| `image2video_kling_motion_control_2.6` | Kling Motion Control | Control motion with video references. |
| `image2video_kling_o1` | Kling O1 | All-in-one video model with strong consistency. |
| `image2video_kling_o1_head_and_tail` | Kling O1 | All-in-one video model with strong consistency. |
| `image2video_media_1.0` | ToMoviee 2.0 Pro (ex-Media 1.0) | Master precise motion control with perfect character consistency. |
| `image2video_minimax_02` | Hailuo 02 | Diverse dynamic motions. |
| `image2video_minimax_2.3` | Hailuo 2.3 | Enhanced quality, smoother and truer. |
| `image2video_minimax_h3` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `image2video_minimax_h3_head_and_tail` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `image2video_seedance _2.0_mini` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `image2video_seedance _2.0_mini_head_and_tail` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `image2video_seedance _2.5` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `image2video_seedance _2.5_head_and_tail` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `image2video_seedance2.0_fast` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `image2video_seedance2.0_fast_head_and_tail` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `image2video_tomoviee_2.0` | ToMoviee 2.0 | Realism with creative control. |
| `image2video_tomoviee_2.0_fast` | Tomoviee 2.0 Fast | Fastest video generation. Lowest cost. Unlimited access for Pro users. |
| `image2video_tomoviee_2.5` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `image2video_tomoviee_2.5_head_and_tail` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `image2video_tomoviee_3.0` | Tomoviee 3.0 | Superior character consistency, stronger prompt adherence, and dynamic motion control. |
| `image2video_tomoviee_4.0` | Tomoviee-V4 Pro | Maximum value supporting 2K video with perfectly synchronized audio and dialogue for accessible creation. |
| `image2video_tomusic_1_0` | ToMusic 1.0 | Create cinematic, character-driven music videos with rich emotion and storytelling. |
| `image2video_veo_3.1` | Google Veo 3.1 | Cinematic video with audio. |
| `image2video_veo_3.1_fast` | Google Veo 3.1 Fast | Speed-optimized video generation. |
| `image2video_veo_3.1_lite` | Google Veo 3.1 Lite | Fast & affordable drafting. Best for simple shots. |
| `image2video_veo_3.1_lite_head_and_tail` | Google Veo 3.1 Lite | Fast & affordable drafting. Best for simple shots. |
| `image2video_veo_3_fast` | Google Veo 3 Fast | Speed-optimized realism. |
| `image2video_vidu_2.0` | Vidu 2.0 | Enhanced narrative realism. |
| `image2video_vidu_2.0_head_and_tail` | Vidu 2.0 | Enhanced narrative realism. |
| `image2video_vidu_2.0_reference_image` | Vidu 2.0 | Enhanced narrative realism. |
| `image2video_vidu_q1` | Vidu Q1 | Scene-driven narrative engine. |
| `image2video_vidu_q1_head_and_tail` | Vidu Q1 | Scene-driven narrative engine. |
| `image2video_vidu_q2` | Vidu Q2 | Lively motion, sharp semantics. |
| `image2video_vidu_q3` | Vidu Q3 | Multi-shot, Audio-Video Sync. |
| `image2video_wan_2.2` | Wan 2.2 | Sharp detail, vivid colors. |
| `image2video_wan_2.5` | Wan 2.5 | High-quality video generation with smooth, stable frames. |
| `image2video_wan_2.6` | Wan 2.6 | Create storyboards and stories. |
| `image2video_wan_3.0` | Wan 3.0 | Create 30-second stories with expressive character performances. |
| `image2video_wan_3.0_head_and_tail` | Wan 3.0 | Create 30-second stories with expressive character performances. |

### reference2video — 多参考图生视频（11）

| job_type | 显示名 | 描述 |
| --- | --- | --- |
| `image2video_gemini_omni_flash_reference_image` | Gemini Omni Flash | High-performance video model for ultra-fast generation, precise editing, and cinematic control. |
| `image2video_happyhorse_1.0_reference_image` | HappyHorse 1.0 | A multi-language video generation model with integrated dialogue, ambient sound, and Foley. |
| `image2video_happyhorse_1.5_reference_image` | HappyHorse 1.1 | A video model featuring realistic physics, consistent characters, and cinematic outputs. |
| `image2video_kling_3.0_omni_reference_image` | Kling 3.0 Omni | The Only Native 4K AI Video Model With Multimodal Input, Audio, Voice Characters, And Storyboards. |
| `image2video_kling_o1_reference_image` | Kling O1 | Max creativity with Exceptional Value. |
| `image2video_minimax_h3_reference_image` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `image2video_seedance2.0_fast_reference_image` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `image2video_seedance_2.0_mini_reference_image` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `image2video_seedance_2.5_reference_image` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `image2video_tomoviee_2.5_reference_image` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `image2video_wan_3.0_reference_image` | Wan 3.0 | Create 30-second stories with expressive character performances. |

## 6. 已知陷阱

### 6.1 job_type 内含空格（6 条）

线上真实配置，**不会修改**。写成不带空格的版本会直接 `unknown job type`。shell 里必须加引号。

| job_type | 显示名 |
| --- | --- |
| `image2video_seedance _2.0_mini` | Seedance 2.0 Mini |
| `image2video_seedance _2.0_mini_head_and_tail` | Seedance 2.0 Mini |
| `image2video_seedance _2.5` | Seedance 2.5 |
| `image2video_seedance _2.5_head_and_tail` | Seedance 2.5 |
| `text2video_seedance _2.0_mini` | Seedance 2.0 Mini |
| `text2video_seedance _2.5` | Seedance 2.5 |

```bash
mediaio model get "image2video_seedance _2.0_mini"
```

### 6.2 前缀与 fun_module 不一致（12 条）

不要根据 job_type 前缀推断它属于哪个模块，以本表为准。

| job_type | 实际 fun_module |
| --- | --- |
| `image2video_gemini_omni_flash_reference_image` | reference2video |
| `image2video_happyhorse_1.0_reference_image` | reference2video |
| `image2video_happyhorse_1.5_reference_image` | reference2video |
| `image2video_kling_3.0_omni_reference_image` | reference2video |
| `image2video_kling_o1_reference_image` | reference2video |
| `image2video_minimax_h3_reference_image` | reference2video |
| `image2video_seedance2.0_fast_reference_image` | reference2video |
| `image2video_seedance_2.0_mini_reference_image` | reference2video |
| `image2video_seedance_2.5_reference_image` | reference2video |
| `image2video_tomoviee_2.5_reference_image` | reference2video |
| `image2video_wan_3.0_reference_image` | reference2video |
| `text2image_gemini_omni_flash` | text2video |

### 6.3 显示名重名（37 组）

**显示名不是主键。** 用户说出一个重名显示名时，列出候选让他选，不要自己挑第一个。

| 显示名 | 对应 job_type |
| --- | --- |
| GPT Image 2 | `image2image_gpt_image_2`<br>`text2image_gpt_image_2` |
| Gemini Omni Flash | `image2video_gemini_omni_flash`<br>`image2video_gemini_omni_flash_reference_image`<br>`text2image_gemini_omni_flash` |
| Google Veo 3 Fast | `image2video_veo_3_fast`<br>`text2video_veo_3_fast` |
| Google Veo 3.1 | `image2video_veo_3.1`<br>`text2video_veo_3.1` |
| Google Veo 3.1 Fast | `image2video_veo_3.1_fast`<br>`text2video_veo_3.1_fast` |
| Google Veo 3.1 Lite | `image2video_veo_3.1_lite`<br>`image2video_veo_3.1_lite_head_and_tail`<br>`text2video_veo_3.1_lite` |
| Hailuo 2.3 | `image2video_minimax_2.3`<br>`text2video_minimax_2.3` |
| HappyHorse 1.0 | `image2video_happyhorse_1.0`<br>`image2video_happyhorse_1.0_reference_image`<br>`text2video_happyhorse_1.0` |
| HappyHorse 1.1 | `image2video_happyhorse_1.5`<br>`image2video_happyhorse_1.5_reference_image`<br>`text2video_happyhorse_1.5` |
| Kling 2.1 | `image2video_kling_2.1`<br>`image2video_kling_2.1_head_and_tail` |
| Kling 2.5 Turbo | `image2video_kling_2.5_turbo`<br>`image2video_kling_2.5_turbo_head_and_tail`<br>`text2video_kling_2.5_turbo` |
| Kling 2.6 | `image2video_kling_2.6`<br>`text2video_kling_2.6` |
| Kling 3.0 | `image2video_kling_3.0`<br>`image2video_kling_3.0_head_and_tail`<br>`text2video_kling_3.0` |
| Kling 3.0 Turbo | `image2video_kling_3.0_fast`<br>`text2video_kling_3.0_fast` |
| Kling O1 | `image2video_kling_o1`<br>`image2video_kling_o1_head_and_tail`<br>`image2video_kling_o1_reference_image`<br>`text2video_kling_o1` |
| MiniMax H3 | `image2video_minimax_h3`<br>`image2video_minimax_h3_head_and_tail`<br>`image2video_minimax_h3_reference_image`<br>`text2video_minimax_h3` |
| Nano Banana | `image2image_banana`<br>`text2image_banana` |
| Nano Banana 2 | `image2image_nano_banana_2`<br>`text2image_nano_banana_2` |
| Nano Banana 2 Lite | `image2image_nano_banana_2_lite`<br>`text2image_nano_banana_2_lite` |
| Nano Banana Pro | `image2image_banana_2`<br>`text2image_banana_2` |
| Seedance 2.0 | `image2video_tomoviee_2.5`<br>`image2video_tomoviee_2.5_head_and_tail`<br>`image2video_tomoviee_2.5_reference_image`<br>`text2video_tomoviee_2.5` |
| Seedance 2.0 Fast | `image2video_seedance2.0_fast`<br>`image2video_seedance2.0_fast_head_and_tail`<br>`image2video_seedance2.0_fast_reference_image`<br>`text2video_seedance2.0_fast` |
| Seedance 2.0 Mini | `image2video_seedance _2.0_mini`<br>`image2video_seedance _2.0_mini_head_and_tail`<br>`image2video_seedance_2.0_mini_reference_image`<br>`text2video_seedance _2.0_mini` |
| Seedance 2.5 | `image2video_seedance _2.5`<br>`image2video_seedance _2.5_head_and_tail`<br>`image2video_seedance_2.5_reference_image`<br>`text2video_seedance _2.5` |
| Seedream 4.0 | `image2image_seedream_4.0`<br>`text2image_seedream_4.0` |
| Seedream 5.0 Lite | `image2image_seedream_5.0_lite`<br>`text2image_seedream_5.0_lite` |
| Seedream 5.0 Pro | `image2image_seedream_5.0_pro`<br>`text2image_seedream_5.0_pro` |
| ToMoviee 2.0 | `image2video_tomoviee_2.0`<br>`text2video_tomoviee_2.0` |
| ToMoviee Lite | `image2image_media_1.0`<br>`text2image_soul_character` |
| Vidu 2.0 | `image2video_vidu_2.0`<br>`image2video_vidu_2.0_head_and_tail`<br>`image2video_vidu_2.0_reference_image` |
| Vidu Q1 | `image2video_vidu_q1`<br>`image2video_vidu_q1_head_and_tail` |
| Vidu Q3 | `image2video_vidu_q3`<br>`text2video_vidu_q3` |
| Wan 2.5 | `image2video_wan_2.5`<br>`text2video_wan_2.5` |
| Wan 2.6 | `image2video_wan_2.6`<br>`text2video_wan_2.6` |
| Wan 2.7 | `image2image_wan_2.7`<br>`text2image_wan_2.7` |
| Wan 2.7 Pro | `image2image_wan_2.7_pro`<br>`text2image_wan_2.7_pro` |
| Wan 3.0 | `image2video_wan_3.0`<br>`image2video_wan_3.0_head_and_tail`<br>`image2video_wan_3.0_reference_image`<br>`text2video_wan_3.0` |

### 6.4 显示名与 job_type 语义错位

历史原因造成，`uni_fun_code` 不可改。**只能由显示名查 job_type，不能由 job_type 反推显示名。** 典型例子：

| job_type | 显示名 | 容易误判成 |
| --- | --- | --- |
| `image2image_banana_2` | Nano Banana Pro | Nano Banana 2 |
| `text2image_banana_2` | Nano Banana Pro | Nano Banana 2 |
| `text2image_soul_character` | ToMoviee Lite | Soul / 角色模型 |
| `image2video_tomoviee_2.5` | Seedance 2.0 | ToMoviee 2.5 |

## 7. 回源指令速查

```bash
# 按关键词找模型（第 0 节条件 1 才允许）
mediaio model list --grep seedance --output json

# 只看某个模块
mediaio model list --module image2video --output json

# 取参数 schema（每次选型后都要跑）
mediaio model get image2image_media_3.0

# job_type 含空格时必须加引号
mediaio model get "image2video_seedance _2.5"
```

> `model list` 的默认文本输出只有 `job_type / type / description`，**不含显示名**；需要显示名时必须加 `--output json` 读 `model` 字段。

---

<!-- snapshot_digest: d19322022f5e9c7d -->
