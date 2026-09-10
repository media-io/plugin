# Media inputs

How source media works on the MCP path. Load it whenever a capability needs an image, video or reference input.

## Local upload is not available yet

**This path cannot upload a local file.** The capability is under development; there is no upload tool, and no generation parameter accepts a local path.

When the user attaches a file or names a local path:

1. Say plainly that uploading from this path is still under development.
2. Ask whether they want to use something already in their Media.io space, and offer to look with `list_assets`.
3. If they have nothing suitable there, stop. Do not submit the job and let the server fail on a missing source — that costs a round trip and produces a confusing failure instead of a clear answer.

Do not work around this by pasting a public URL into an image parameter, by describing the image in the prompt as a substitute, or by reaching for a local CLI.

## Where source media comes from

Two sources, both already in the cloud:

### 1. The user's drive — `list_assets`

```
list_assets(keyword: "poster", media_types: ["image"], page_size: 20)
```

Each asset carries `asset_id`, `name`, `ext`, `media_type`, `size`, `width`, `height`, `duration`, `thumbnail`. **`asset_id` is the value you pass** as the source parameter.

When several assets match, show `name` (and dimensions when relevant) and let the user pick. Do not silently take the first hit.

### 2. A previous task's output — `outputs[].asset_id`

Every generation result is already an asset in the user's drive. `outputs[].asset_id` from `get_generation` can be passed straight into the next task's source parameter — **no upload, no download, no round trip through the user**.

This is how you chain: generate an image, then animate it; generate a frame, then use it as a video reference. Do not offer to "save and re-upload" between steps.

## Which capabilities need a source

A capability needs a source asset when either is true:

- Its code is named like `image2image_*`, `image2video_*`, `*_i2i`, `*_i2v`, or `reference2video_*`.
- Its `describe_capability` schema lists an image, video or reference parameter.

**This holds even when the schema does not mark the parameter required.** A missing source usually surfaces as a generic task failure rather than a parameter error, so check before submitting rather than after.

Also note the module traps in `references/model-catalog.md` section 6.2: several `image2video_*_reference_image` codes actually belong to the `reference2video` module. The prefix is not a reliable guide to what the capability does.

## Passing the value

Take the parameter name from `describe_capability` — never guess it. The shapes differ:

- Some capabilities take a single image (`image`), some take an array (`images`), some take many references (up to 50 for the multi-reference video codes).
- `workflow_default: true` on an image parameter does **not** mean it can be omitted. It means the workflow has a fallback value; key inputs such as `images` are marked `true` and still need to be supplied.

If `describe_capability` returns the code in `missing_capability_codes`, the capability does not exist — re-check the identifier before doing anything else.

## Failures involving source media

| Symptom | Cause | Action |
| --- | --- | --- |
| `AUTH_FORBIDDEN`, hint *No access to that drive object* | The asset is not reachable for this subject | Re-select with `list_assets` |
| Task fails with `content_not_exist` | The source asset is missing | Re-select the source |
| Task fails with `invalid_file_size` | The source is too large or unusable | Ask for a different asset |
| Task fails with `no_human_face` / `no_human_voice` | The input lacks what the capability requires | Ask for a suitable source; do not retry the identical input |
| Task fails generically on an `image2*` capability | Very often no source was supplied at all | Check before retrying |
| `drive_space_full` / `storage_overrun` | The user's drive is full | Tell them to free up space; retrying fails the same way |

See `references/troubleshooting.md` for the full table.
