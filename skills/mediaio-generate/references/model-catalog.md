# Media.io Model Catalog

> Generated artifact — do not edit by hand. Change `catalog/model-catalog.overlay.json`, then re-run `sh scripts/model-catalog.sh sync`.

| Field | Value |
| --- | --- |
| generated_at | 2026-09-22T02:41:16.857Z |
| environment | prod |
| vapi | https://vapi.media.io |
| model_count | 115 |
| snapshot_digest | 290dbb71acf797e9 |
| catalog_schema_version | 1 |

## 0. How to use this file

1. **Static first.** Route ordinary intent from this file alone; do not run `mediaio model list`.
2. **After selecting, still run `mediaio model get <job_type>`** for the parameter schema. This file makes no promise about parameters and must not be used to infer them.
3. **Copy `job_type` byte for byte.** Never trim it, never change case, never "fix" a name that looks like a typo. Values containing a space must be quoted in the shell.
4. **Map display name to `job_type` only, never the reverse.** Display names and `job_type` disagree in many cases (see section 6) and some names are shared. When a name is ambiguous, list the candidates and let the user choose.
5. **Report your choice as `Display Name (job_type)`** so any mismatch is visible to the user.
6. **A live lookup is allowed only in these cases**; otherwise never run `model list`:
   - A model the user named is not in section 2 or 5 → `mediaio model list --grep <keyword> --output json`
   - Submission returned `unknown job type` → full `model list` to re-check, and warn that this catalog may be stale
   - The user explicitly asks to see all/latest models, or whether new models exist → full `model list`
   - You need to confirm a fallback target is still online before switching → `model list --grep`
   - This file's `generated_at` is more than 30 days old, or `catalog_schema_version` does not match what the skill expects (**decided locally, no request**)
   - This file is missing or its metadata block is corrupt → fall back to runtime discovery

## 1. Global defaults

| Scenario | Default model | job_type | Fallback | job_type |
| --- | --- | --- | --- | --- |
| Text to image (no reference image) | ToMoviee Lite | `text2image_soul_character` | ToMoviee Lite | `text2image_soul_character` |
| Image to image (with reference image) | ToMoviee 3.0 Pro | `image2image_media_3.0` | ToMoviee Lite | `image2image_media_1.0` |
| Video | ToMoviee 3.0 | `image2video_tomoviee_3.0` | ToMoviee 2.0 Fast | `image2video_tomoviee_2.0_fast` |

## 2. Featured models

| Display name | job_type | Access tier* | Inputs | When to pick it |
| --- | --- | --- | --- | --- |
| ToMoviee Lite | `text2image_soul_character` | free | prompt | Default for pure text-to-image. text2image_media_3.0 does not exist in production; this is the free entry point that returns an image directly. Display name is ToMoviee Lite. |
| ToMoviee 3.0 Pro | `image2image_media_3.0` | vip_free | images, prompt | Default for image-to-image. First choice for character consistency, outfit control and character editing. Free for members; non-members are charged. |
| ToMoviee Pro (ex-Media 2.0) | `image2image_media_2.0` | vip_free | images, prompt | Member-free alternative to ToMoviee 3.0 Pro. Prefer it when a member wants another free option; non-members are charged. |
| ToMoviee Lite | `image2image_media_1.0` | free | images, prompt | Fallback target for image-to-image, and the free option in this module. Retry with this when permission or credits are insufficient. Display name is ToMoviee Lite. |
| GPT Image 2.5 Sunburst | `text2image_gpt_image_2.5_sunburst` | unknown | prompt | Newest GPT Image generation, quality-first variant. Pick it when the user asks for the best achievable quality or names Sunburst. A bare `GPT Image 2.5` is ambiguous between the two variants — list both and let the user choose. |
| GPT Image 2.5 Flare | `text2image_gpt_image_2.5` | unknown | prompt | Newest GPT Image generation, speed-first variant (display name GPT Image 2.5 Flare). Pick it when the user wants a strong everyday image quickly or names Flare. Note the job_type has no `_flare` suffix. |
| GPT Image 2.5 Sunburst | `image2image_gpt_image_2.5_sunburst` | unknown | images, prompt | Newest GPT Image generation with a reference image, quality-first variant. Pick it for precise, instruction-faithful edits to an existing image, or when the user names Sunburst. |
| GPT Image 2.5 Flare | `image2image_gpt_image_2.5` | unknown | images, prompt | Newest GPT Image generation with a reference image, speed-first variant (display name GPT Image 2.5 Flare). Pick it for fast everyday edits or when the user names Flare. Note the job_type has no `_flare` suffix. |
| GPT Image 2 | `text2image_gpt_image_2` | unknown | prompt | Previous GPT Image generation. Use when text must be rendered accurately inside the image, or the composition is unusually complex. |
| GPT Image 2 | `image2image_gpt_image_2` | unknown | images, prompt | Previous GPT Image generation. Use with a reference image when text must be rendered accurately. |
| Nano Banana Pro | `text2image_banana_2` | unknown | prompt | Anime, illustration and creative styles. Note the display name is Nano Banana Pro, not Nano Banana 2. |
| Nano Banana Pro | `image2image_banana_2` | unknown | images, prompt | Anime and creative styles with a reference image. Display name is Nano Banana Pro. |
| ToMoviee 3.0 | `image2video_tomoviee_3.0` | unknown | image, prompt | Default for video. Use it whenever there is no special requirement. |
| ToMoviee 2.0 Fast | `image2video_tomoviee_2.0_fast` | unknown | image, prompt | Fallback target for video. Use it when the user wants speed or lower cost, or when permission/credits are insufficient. |
| Seedance 2.5 | `image2video_seedance _2.5` | unknown | image, prompt | Long video, audio included, cinematic quality. The job_type contains one space; that is the real production value. |
| Seedance 2.5 | `image2video_seedance_2.5_reference_image` | unknown | images, prompt | Multi-reference video generation (up to 50 reference images); belongs to the reference2video module. |
| Kling 3.0 | `image2video_kling_3.0` | unknown | image, prompt | Strong physical simulation: shattering, fluids, collisions. |
| MiniMax H3 | `text2video_minimax_h3_switch` | unknown | prompt | Text-to-video with natively synchronized audio and spoken dialogue at 2K. The job_type ends in `_switch`; the older suffix-less name is offline. |
| MiniMax H3 Max | `text2video_minimax_h3_max` | unknown | prompt | Fastest MiniMax H3 tier for text-to-video: native HD with synchronized audio and dialogue, sub-realtime inference. Unlike the plain H3 entry this job_type has no `_switch` suffix. |
| MiniMax H3 | `image2video_minimax_h3_switch` | unknown | image, prompt | Image-to-video with natively synchronized audio and spoken dialogue at 2K. Its starting-image parameter is `--init_image`, not the `--images` used by most video models. |
| MiniMax H3 Max | `image2video_minimax_h3_max` | unknown | image, prompt | Fastest MiniMax H3 tier for image-to-video: native HD with synchronized audio and dialogue, sub-realtime inference. Also takes `--init_image`, and the job_type has no `_switch` suffix. |
| MiniMax H3 | `image2video_minimax_h3_reference_image_switch` | unknown | images, prompt | Multi-reference video with synchronized audio and dialogue; belongs to the reference2video module even though the job_type carries an image2video prefix. Takes repeated `--images`. |

\* Access tier is **manually curated**; the registry has no such field. `unknown` means it has not been confirmed with the product team. Whether a job actually costs credits is decided by `mediaio generate estimate` and the server response — never tell the user a model is free based on this file.

## 3. Scenario routing

Match in order and **stop at the first hit**; do not keep comparing.

### Text to image (no reference image)

| # | Condition | Pick | job_type |
| --- | --- | --- | --- |
| 1 | The user names GPT Image 2.5 Sunburst, or asks for the best achievable image quality regardless of speed | GPT Image 2.5 Sunburst | `text2image_gpt_image_2.5_sunburst` |
| 2 | The user names GPT Image 2.5 Flare, or wants a strong everyday image with the fastest turnaround | GPT Image 2.5 Flare | `text2image_gpt_image_2.5` |
| 3 | Text must be rendered accurately in the image, or the composition is unusually complex | GPT Image 2 | `text2image_gpt_image_2` |
| 4 | Anime, illustration or creative style | Nano Banana Pro | `text2image_banana_2` |
| 5 | Everything else | ToMoviee Lite | `text2image_soul_character` |

### Image to image (with reference image)

| # | Condition | Pick | job_type |
| --- | --- | --- | --- |
| 1 | The user names GPT Image 2.5 Sunburst, or asks for precise, instruction-faithful edits at the best achievable quality | GPT Image 2.5 Sunburst | `image2image_gpt_image_2.5_sunburst` |
| 2 | The user names GPT Image 2.5 Flare, or wants a fast everyday edit of the reference image | GPT Image 2.5 Flare | `image2image_gpt_image_2.5` |
| 3 | Text must be rendered accurately in the image, or the composition is unusually complex | GPT Image 2 | `image2image_gpt_image_2` |
| 4 | Anime, illustration or creative style | Nano Banana Pro | `image2image_banana_2` |
| 5 | Everything else, including character consistency, outfit swap and character editing, AND `account status` reports a membership `level` of `standard` or `premium` | ToMoviee 3.0 Pro | `image2image_media_3.0` |
| 6 | Everything else, including character consistency, outfit swap and character editing, AND the account is not a member or the membership level is unknown | ToMoviee Lite | `image2image_media_1.0` |

### Video

| # | Condition | Pick | job_type |
| --- | --- | --- | --- |
| 1 | Several reference images AND the user names MiniMax H3, or wants synchronized dialogue and audio driven by multiple references | MiniMax H3 | `image2video_minimax_h3_reference_image_switch` |
| 2 | Multi-modal reference with several reference images | Seedance 2.5 | `image2video_seedance_2.5_reference_image` |
| 3 | A single starting image AND the user names MiniMax H3 Max, or wants synchronized dialogue with the fastest turnaround | MiniMax H3 Max | `image2video_minimax_h3_max` |
| 4 | A single starting image AND the user names MiniMax H3, or wants native 2K video with synchronized dialogue and audio | MiniMax H3 | `image2video_minimax_h3_switch` |
| 5 | No input image AND the user names MiniMax H3 Max, or wants synchronized dialogue with the fastest turnaround | MiniMax H3 Max | `text2video_minimax_h3_max` |
| 6 | No input image AND the user names MiniMax H3, or wants native 2K video with synchronized dialogue and audio | MiniMax H3 | `text2video_minimax_h3_switch` |
| 7 | Long video (around 30s), audio needed, or cinematic quality | Seedance 2.5 | `image2video_seedance _2.5` |
| 8 | Strong physical simulation: shattering, fluids, collisions | Kling 3.0 | `image2video_kling_3.0` |
| 9 | User explicitly asks for speed or lower cost | ToMoviee 2.0 Fast | `image2video_tomoviee_2.0_fast` |
| 10 | Everything else | ToMoviee 3.0 | `image2video_tomoviee_3.0` |

## 4. Fallback chain

Triggers: the server reports insufficient permission or insufficient credits, or the user explicitly asks for a free or cheaper option.

| Scenario | From | To | Note |
| --- | --- | --- | --- |
| Text to image (no reference image) | `text2image_soul_character` | `text2image_soul_character` | The default already is the fallback; no switch needed |
| Image to image (with reference image) | `image2image_media_3.0` | `image2image_media_1.0` | Re-run estimate after switching, then submit |
| Video | `image2video_tomoviee_3.0` | `image2video_tomoviee_2.0_fast` | Re-run estimate after switching, then submit |

- The image-to-image `From` column is the member default. Section 3 already routes a non-member to `image2image_media_1.0`, which is the fallback target itself, so for them there is nothing cheaper to switch to — offer credits or a membership instead of proposing another downgrade.

Before falling back, confirm the target is still online under the rules in section 0, then repeat the credit confirmation step.

## 5. Full index

This snapshot contains 115 generation models. This section only answers whether a model exists and what it is called; it is not a selection guide.

### text2image — text to image (14)

| job_type | Display name | Description |
| --- | --- | --- |
| `text2image_banana` | Nano Banana | Better visuals & image quality. |
| `text2image_banana_2` | Nano Banana Pro | Next-gen AI generation model. |
| `text2image_gpt_image_2` | GPT Image 2 | Superior photorealism, sharp text rendering, and advanced instruction following. |
| `text2image_gpt_image_2.5` | GPT Image 2.5 Flare | Stunning everyday images, fast. |
| `text2image_gpt_image_2.5_sunburst` | GPT Image 2.5 Sunburst | Exceptional quality, precise edits. |
| `text2image_nano_banana_2` | Nano Banana 2 | Faster generation, great value, and enhanced creative visual features. |
| `text2image_nano_banana_2_lite` | Nano Banana 2 Lite | Fastest, most cost-efficient Gemini Image model. |
| `text2image_seedream_4.0` | Seedream 4.0 | Create images with vivid realism. |
| `text2image_seedream_5.0_lite` | Seedream 5.0 Lite | More accurate instructions, more intelligent outputs. |
| `text2image_seedream_5.0_pro` | Seedream 5.0 Pro | A multimodal image generation model that features advanced reasoning, efficient content creation, and professional production capabilities. |
| `text2image_soul_character` | ToMoviee Lite | Create hyper-realistic characters with unmatched precision and control. |
| `text2image_tomoviee_2.0` | ToMoviee 2.0 | High-res imagery with fast, precise generation. |
| `text2image_wan_2.7` | Wan 2.7 | A streamlined AI model that uses Chain-of-Thought reasoning to efficiently generate high-quality images. |
| `text2image_wan_2.7_pro` | Wan 2.7 Pro | An advanced AI model that utilizes Chain-of-Thought reasoning to generate highly precise, professional-grade images. |

### image2image — image to image (15)

| job_type | Display name | Description |
| --- | --- | --- |
| `image2image_banana` | Nano Banana | Better visuals & image quality. |
| `image2image_banana_2` | Nano Banana Pro | Next-gen AI generation model. |
| `image2image_gpt_image_2` | GPT Image 2 | Superior photorealism, sharp text rendering, and advanced instruction following. |
| `image2image_gpt_image_2.5` | GPT Image 2.5 Flare | Stunning everyday images, fast. |
| `image2image_gpt_image_2.5_sunburst` | GPT Image 2.5 Sunburst | Exceptional quality, precise edits. |
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

### text2video — text to video (25)

| job_type | Display name | Description |
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
| `text2video_minimax_h3_max` | MiniMax H3 Max | Native high-definition video generation with synchronized audio, dialogue, and ultra-fast sub-realtime inference. |
| `text2video_minimax_h3_switch` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `text2video_seedance _2.0_mini` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `text2video_seedance _2.5` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `text2video_seedance2.0_fast` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `text2video_tomoviee4_switch` | ToMoviee 4.0 | Maximum value supporting 2K video with perfectly synchronized audio and dialogue for accessible creation. |
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

### image2video — image to video (49)

| job_type | Display name | Description |
| --- | --- | --- |
| `image2video_gemini_omni_flash` | Gemini Omni Flash | High-performance video model for ultra-fast generation, precise editing, and cinematic control. |
| `image2video_happyhorse_1.0` | HappyHorse 1.0 | A multi-language video generation model with integrated dialogue, ambient sound, and Foley. |
| `image2video_happyhorse_1.5` | HappyHorse 1.1 | A video model featuring realistic physics, consistent characters, and cinematic outputs. |
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
| `image2video_minimax_h3_head_and_tail_switch` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `image2video_minimax_h3_max` | MiniMax H3 Max | Native high-definition video generation with synchronized audio, dialogue, and ultra-fast sub-realtime inference. |
| `image2video_minimax_h3_switch` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `image2video_seedance _2.0_mini` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `image2video_seedance _2.0_mini_head_and_tail` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `image2video_seedance _2.5` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `image2video_seedance _2.5_head_and_tail` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `image2video_seedance2.0_fast` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `image2video_seedance2.0_fast_head_and_tail` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `image2video_tomoviee4_head_and_tail_switch` | ToMoviee 4.0 | Maximum value supporting 2K video with perfectly synchronized audio and dialogue for accessible creation. |
| `image2video_tomoviee4_switch` | ToMoviee 4.0 | Maximum value supporting 2K video with perfectly synchronized audio and dialogue for accessible creation. |
| `image2video_tomoviee_2.0` | ToMoviee 2.0 | Realism with creative control. |
| `image2video_tomoviee_2.0_fast` | ToMoviee 2.0 Fast | Fastest video generation. Lowest cost. Unlimited access for Pro users. |
| `image2video_tomoviee_2.5` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `image2video_tomoviee_2.5_head_and_tail` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `image2video_tomoviee_3.0` | ToMoviee 3.0 | Superior character consistency, stronger prompt adherence, and dynamic motion control. |
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

### reference2video — multi-reference to video (12)

| job_type | Display name | Description |
| --- | --- | --- |
| `image2video_gemini_omni_flash_reference_image` | Gemini Omni Flash | High-performance video model for ultra-fast generation, precise editing, and cinematic control. |
| `image2video_happyhorse_1.0_reference_image` | HappyHorse 1.0 | A multi-language video generation model with integrated dialogue, ambient sound, and Foley. |
| `image2video_happyhorse_1.5_reference_image` | HappyHorse 1.1 | A video model featuring realistic physics, consistent characters, and cinematic outputs. |
| `image2video_kling_3.0_omni_reference_image` | Kling 3.0 Omni | The Only Native 4K AI Video Model With Multimodal Input, Audio, Voice Characters, And Storyboards. |
| `image2video_kling_o1_reference_image` | Kling O1 | Max creativity with Exceptional Value. |
| `image2video_minimax_h3_reference_image_switch` | MiniMax H3 | Native 2K video generation with perfectly synchronized audio and dialogue. |
| `image2video_seedance2.0_fast_reference_image` | Seedance 2.0 Fast | Rapid creation with balanced cost. |
| `image2video_seedance_2.0_mini_reference_image` | Seedance 2.0 Mini | Low-cost rendering for quick drafts. |
| `image2video_seedance_2.5_reference_image` | Seedance 2.5 | Create coherent 30-second videos with up to 50 multimodal references. |
| `image2video_tomoviee4_reference_image_switch` | ToMoviee 4.0 | Maximum value supporting 2K video with perfectly synchronized audio and dialogue for accessible creation. |
| `image2video_tomoviee_2.5_reference_image` | Seedance 2.0 | Native 4K cinematic multi-shot video generation with multimodal input and precise audio-video sync. |
| `image2video_wan_3.0_reference_image` | Wan 3.0 | Create 30-second stories with expressive character performances. |

## 6. Known pitfalls

### 6.1 job_type contains a space (6)

These are the real production values and **will not be changed**. Writing them without the space fails with `unknown job type`. Always quote them in the shell.

| job_type | Display name |
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

### 6.2 Prefix does not match fun_module (13)

Never infer a model's module from its job_type prefix. Use this table.

| job_type | Actual fun_module |
| --- | --- |
| `image2video_gemini_omni_flash_reference_image` | reference2video |
| `image2video_happyhorse_1.0_reference_image` | reference2video |
| `image2video_happyhorse_1.5_reference_image` | reference2video |
| `image2video_kling_3.0_omni_reference_image` | reference2video |
| `image2video_kling_o1_reference_image` | reference2video |
| `image2video_minimax_h3_reference_image_switch` | reference2video |
| `image2video_seedance2.0_fast_reference_image` | reference2video |
| `image2video_seedance_2.0_mini_reference_image` | reference2video |
| `image2video_seedance_2.5_reference_image` | reference2video |
| `image2video_tomoviee4_reference_image_switch` | reference2video |
| `image2video_tomoviee_2.5_reference_image` | reference2video |
| `image2video_wan_3.0_reference_image` | reference2video |
| `text2image_gemini_omni_flash` | text2video |

### 6.3 Duplicate display names (40 groups)

**A display name is not a primary key.** When the user names one of these, list the candidates and let them choose instead of silently taking the first.

| Display name | job_type candidates |
| --- | --- |
| GPT Image 2 | `image2image_gpt_image_2`<br>`text2image_gpt_image_2` |
| GPT Image 2.5 Flare | `image2image_gpt_image_2.5`<br>`text2image_gpt_image_2.5` |
| GPT Image 2.5 Sunburst | `image2image_gpt_image_2.5_sunburst`<br>`text2image_gpt_image_2.5_sunburst` |
| Gemini Omni Flash | `image2video_gemini_omni_flash`<br>`image2video_gemini_omni_flash_reference_image`<br>`text2image_gemini_omni_flash` |
| Google Veo 3 Fast | `image2video_veo_3_fast`<br>`text2video_veo_3_fast` |
| Google Veo 3.1 | `image2video_veo_3.1`<br>`text2video_veo_3.1` |
| Google Veo 3.1 Fast | `image2video_veo_3.1_fast`<br>`text2video_veo_3.1_fast` |
| Google Veo 3.1 Lite | `image2video_veo_3.1_lite`<br>`image2video_veo_3.1_lite_head_and_tail`<br>`text2video_veo_3.1_lite` |
| Hailuo 2.3 | `image2video_minimax_2.3`<br>`text2video_minimax_2.3` |
| HappyHorse 1.0 | `image2video_happyhorse_1.0`<br>`image2video_happyhorse_1.0_reference_image`<br>`text2video_happyhorse_1.0` |
| HappyHorse 1.1 | `image2video_happyhorse_1.5`<br>`image2video_happyhorse_1.5_reference_image`<br>`text2video_happyhorse_1.5` |
| Kling 2.5 Turbo | `image2video_kling_2.5_turbo`<br>`image2video_kling_2.5_turbo_head_and_tail`<br>`text2video_kling_2.5_turbo` |
| Kling 2.6 | `image2video_kling_2.6`<br>`text2video_kling_2.6` |
| Kling 3.0 | `image2video_kling_3.0`<br>`image2video_kling_3.0_head_and_tail`<br>`text2video_kling_3.0` |
| Kling 3.0 Turbo | `image2video_kling_3.0_fast`<br>`text2video_kling_3.0_fast` |
| Kling O1 | `image2video_kling_o1`<br>`image2video_kling_o1_head_and_tail`<br>`image2video_kling_o1_reference_image`<br>`text2video_kling_o1` |
| MiniMax H3 | `image2video_minimax_h3_head_and_tail_switch`<br>`image2video_minimax_h3_switch`<br>`image2video_minimax_h3_reference_image_switch`<br>`text2video_minimax_h3_switch` |
| MiniMax H3 Max | `image2video_minimax_h3_max`<br>`text2video_minimax_h3_max` |
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
| ToMoviee 2.0 | `image2video_tomoviee_2.0`<br>`text2image_tomoviee_2.0`<br>`text2video_tomoviee_2.0` |
| ToMoviee 4.0 | `image2video_tomoviee4_head_and_tail_switch`<br>`image2video_tomoviee4_switch`<br>`image2video_tomoviee4_reference_image_switch`<br>`text2video_tomoviee4_switch` |
| ToMoviee Lite | `image2image_media_1.0`<br>`text2image_soul_character` |
| Vidu 2.0 | `image2video_vidu_2.0`<br>`image2video_vidu_2.0_head_and_tail`<br>`image2video_vidu_2.0_reference_image` |
| Vidu Q1 | `image2video_vidu_q1`<br>`image2video_vidu_q1_head_and_tail` |
| Vidu Q3 | `image2video_vidu_q3`<br>`text2video_vidu_q3` |
| Wan 2.5 | `image2video_wan_2.5`<br>`text2video_wan_2.5` |
| Wan 2.6 | `image2video_wan_2.6`<br>`text2video_wan_2.6` |
| Wan 2.7 | `image2image_wan_2.7`<br>`text2image_wan_2.7` |
| Wan 2.7 Pro | `image2image_wan_2.7_pro`<br>`text2image_wan_2.7_pro` |
| Wan 3.0 | `image2video_wan_3.0`<br>`image2video_wan_3.0_head_and_tail`<br>`image2video_wan_3.0_reference_image`<br>`text2video_wan_3.0` |

### 6.4 Display name and job_type disagree

A historical artifact; `uni_fun_code` cannot be changed. **Map display name to job_type only, never the reverse.** Typical examples:

| job_type | Display name | Commonly misread as |
| --- | --- | --- |
| `image2image_banana_2` | Nano Banana Pro | Nano Banana 2 |
| `text2image_banana_2` | Nano Banana Pro | Nano Banana 2 |
| `text2image_soul_character` | ToMoviee Lite | a Soul / character-specific model |
| `image2video_tomoviee_2.5` | Seedance 2.0 | ToMoviee 2.5 |

### 6.5 ToMoviee is the first-party family, called 天幕 in Chinese

ToMoviee is our own model family. Its Chinese brand name is **天幕**. No display name is literally 天幕, so a user who asks for 天幕 will not match anything by search — resolve the request to the entries below, and let the user choose when several apply.

| job_type | Display name | Module |
| --- | --- | --- |
| `image2image_media_1.0` | ToMoviee Lite | image2image |
| `image2image_media_2.0` | ToMoviee Pro (ex-Media 2.0) | image2image |
| `image2image_media_3.0` | ToMoviee 3.0 Pro | image2image |
| `image2video_media_1.0` | ToMoviee 2.0 Pro (ex-Media 1.0) | image2video |
| `image2video_tomoviee4_head_and_tail_switch` | ToMoviee 4.0 | image2video |
| `image2video_tomoviee4_switch` | ToMoviee 4.0 | image2video |
| `image2video_tomoviee_2.0` | ToMoviee 2.0 | image2video |
| `image2video_tomoviee_2.0_fast` | ToMoviee 2.0 Fast | image2video |
| `image2video_tomoviee_3.0` | ToMoviee 3.0 | image2video |
| `image2video_tomoviee4_reference_image_switch` | ToMoviee 4.0 | reference2video |
| `text2image_soul_character` | ToMoviee Lite | text2image |
| `text2image_tomoviee_2.0` | ToMoviee 2.0 | text2image |
| `text2video_tomoviee4_switch` | ToMoviee 4.0 | text2video |
| `text2video_tomoviee_2.0` | ToMoviee 2.0 | text2video |

## 7. Live-lookup command reference

```bash
# Find a model by keyword (only under condition 1 in section 0)
mediaio model list --grep seedance --output json

# Restrict to one module
mediaio model list --module image2video --output json

# Get the parameter schema (run this after every selection)
mediaio model get image2image_media_3.0

# job_type values containing a space must be quoted
mediaio model get "image2video_seedance _2.5"
```

> The default text output of `model list` has only `job_type / type / description` and **no display name**. Add `--output json` and read the `model` field when you need it.

---

<!-- snapshot_digest: 290dbb71acf797e9 -->
