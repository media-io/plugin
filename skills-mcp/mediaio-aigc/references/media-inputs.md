# Media inputs

How source media works on the MCP path. Load it whenever a capability needs an image, video or reference input.

## Where source media comes from

Three sources. Two are already in the cloud; the third is a local file you upload first.

### 1. The user's drive — `list_assets`

```
list_assets(keyword: "poster", media_types: ["image"], page_size: 20)
```

Each asset carries `asset_id`, `name`, `ext`, `media_type`, `size`, `width`, `height`, `duration`, `thumbnail`. **`asset_id` is the value you pass** as the source parameter.

When several assets match, show `name` (and dimensions when relevant) and let the user pick. Do not silently take the first hit.

### 2. A previous task's output — `outputs[].asset_id`

Every generation result is already an asset in the user's drive. `outputs[].asset_id` from `get_generation` can be passed straight into the next task's source parameter — **no upload, no download, no round trip through the user**.

This is how you chain: generate an image, then animate it; generate a frame, then use it as a video reference. Do not offer to "save and re-upload" between steps.

### 3. A local file — `create_upload` → PUT → `complete_upload`

The file bytes never pass through the MCP server. The server only issues a presigned URL and registers the result; the transfer is between the host and the storage service.

#### Step 1 — `create_upload`

| Input | Notes |
| --- | --- |
| `file_name` | Bare file name with extension, such as `clip.mp4`. **No path separator** — the folder goes in `dest_path` |
| `file_size` | Exact size in bytes. It must match what you actually PUT; the server verifies it |
| `content_hash` | SHA-1 hex digest of the **whole** file. Also the deduplication key behind rapid upload |
| `pre_hash` | SHA-1 hex digest of the **first 1 MiB**. For a file of 1 MiB or less this equals `content_hash` |
| `content_type` | Optional MIME type such as `video/mp4`. Omit it when unsure |
| `dest_path` | Optional destination folder such as `/MCP Uploads`. Missing folders are created. Defaults to the space root |
| `description` | Optional note stored on the drive file |
| `expires_in` | Optional URL lifetime in seconds, 1–3600, default 900. Raise it only for a large file on a slow link |

Both digests are lower-case-insensitive 40-character hex. Compute them locally — for example `shasum -a 1 file` for `content_hash` and `head -c 1048576 file | shasum -a 1` for `pre_hash`.

The response always carries `upload_id`, `state`, `rapid_upload` and `next_step`.

| Outcome | What you get | What to do |
| --- | --- | --- |
| `state: "completed"`, `rapid_upload: true`, `next_step: "done"` | `file_id`, `asset_id` | **Finished.** The drive already held that exact content. Do not PUT, do not call `complete_upload` |
| `state: "awaiting_bytes"`, `next_step: "put_bytes_then_complete_upload"` | `upload_url`, `upload_method`, `upload_headers`, `expires_at` | Go to step 2 |

#### Step 2 — PUT the bytes

Send the raw file body to `upload_url` using `upload_method` (normally `PUT`), with every entry of `upload_headers` reproduced **exactly as given**.

- Do not add, drop, rename, reorder or re-case those headers.
- Do not rewrite, re-encode, shorten or proxy `upload_url`.
- Do not send the body base64-encoded, chunk-wrapped or multipart-wrapped. It is the raw bytes.

The storage service validates a signature computed over the URL and those headers. Any edit produces a 403 with `SignatureDoesNotMatch` or `InvalidAccessKeyId`, and that error points at the signature, not at the actual typo. Treat both values as opaque.

If the PUT has not completed by `expires_at`, the ticket is dead. Call `create_upload` again for a fresh URL rather than retrying the old one.

#### Step 3 — `complete_upload`

Call it with `upload_id` only, and only after the PUT returned a 2xx. The server verifies the stored object against the declared size and hash, registers the drive file, and returns:

| Field | Notes |
| --- | --- |
| `upload_id` | Echoed back |
| `state` | Always `completed` |
| `file_id` | The drive file id |
| `asset_id` | **The value you pass into the generation parameter** |
| `size` | Registered byte size |

It is idempotent: calling it again for an already completed upload returns the same result and does not create a duplicate file.

#### Hard rules

- Never read file content into the conversation, never base64 it, and never pass file bytes to any Media.io tool. `create_upload` takes metadata and hashes only.
- If the host cannot compute a SHA-1 or issue an HTTP PUT, say so and ask the user to upload the file from the Media.io web app. **Never invent or approximate a hash** — `complete_upload` verifies it and the upload will simply fail.
- Never call `complete_upload` after a rapid-upload hit.
- Do not work around a failed upload by pasting a public URL into an image parameter, by describing the image in the prompt as a substitute, or by reaching for a local CLI.

#### Upload failures

| Code | Meaning | Action |
| --- | --- | --- |
| `UPLOAD_NOT_READY` | The bytes have not landed in storage yet | Finish or retry the PUT, then call `complete_upload` again. The only retryable upload code |
| `UPLOAD_EXPIRED` | The presigned ticket expired | Start over from `create_upload` |
| `UPLOAD_NOT_FOUND` | `upload_id` is wrong or already discarded | Start over from `create_upload` |
| `UPLOAD_TOO_LARGE` | The file exceeds the single-object limit | Ask the user to upload it from the Media.io web app |
| `UPLOAD_PLATFORM_UNSUPPORTED` | This drive space has no presigned upload | Ask the user to upload from the Media.io web app; do not look for another tool |
| `INVALID_PARAMETER` | A hash is not 40 hex characters, `file_name` contains a path separator, or `file_size` is not a positive integer | Fix the input; do not retry unchanged |
| `UPSTREAM_REJECTED`, hint *Drive storage is full* | The user's drive is full | Tell them to free up space |

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
