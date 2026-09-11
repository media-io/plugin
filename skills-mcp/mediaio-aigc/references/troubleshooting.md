# Troubleshooting

Every failure arrives as a structured error. **Branch on `code`, never on `message` text.** `hint`, when present, is the concrete next action. Load `references/tool-contract.md` for the envelope itself.

## Rules that override everything else

1. **`RESULT_UNKNOWN` means do not resubmit.** The upstream has no idempotency key of its own, so a blind resubmission can charge twice. Call `list_generations` over the surrounding time window first and find out whether the task exists.
2. **`retryable: false` means stop, not "try a different way".** Do not paraphrase a hard rejection into a new attempt with tweaked parameters.
3. **Never auto-retry a submission.** Reads may be retried once after a transient failure; a write may not.
4. **Never switch to a cheaper capability on your own.** Credit and permission rejections always go back to the user first.

## Error codes

| Code | What happened | What to do |
| --- | --- | --- |
| `AUTH_REQUIRED` | No authorized subject on this session | Tell the user to connect/authorize the Media.io MCP server in their client. There is no login command you can run |
| `AUTH_EXPIRED` | The MCP session token is no longer valid (HTTP 401) | Same as above — re-authorize through the host |
| `AUTH_UPSTREAM_EXPIRED` | The upstream Media.io session expired and could not be renewed | Same as above. Say the Media.io session expired, not that the account is invalid |
| `AUTH_UPSTREAM_NOT_CONFIGURED` | The server has no upstream credential for this subject | A server-side configuration problem. Report it; do not retry |
| `AUTH_FORBIDDEN` | Permission refused. **Read `hint` — this code covers three different situations** | See the breakdown below |
| `CAPABILITY_NOT_FOUND` | Unknown `capability_code`, or an unknown `task_id` | Re-read the code from the catalog byte for byte. If the hint mentions the task, the `task_id` is wrong |
| `INVALID_PARAMETER` | A parameter is missing, unknown, or has an unusable value | Call `describe_capability` and pass only exposed names. Do not guess |
| `CREDIT_CHANGED` | The real price differs from `approved_credit` | Show the new number and ask the user again. Never resubmit with the new number on your own |
| `CREDIT_INSUFFICIENT` | The balance cannot cover the job | Hand over `get_account.credits_url`, stop, and wait. See the membership fallback in `SKILL.md` |
| `REQUEST_IN_FLIGHT` | The same `client_request_id` is still running | Wait and retry with the **same** id. Changing it creates a second task and a second charge |
| `RESULT_UNKNOWN` | The submission's outcome could not be determined | See rule 1. `list_generations`, never a resubmission |
| `RATE_LIMITED` | Concurrency, task-count, daily or anonymous limit reached | Read `hint`. `retryable: true` means back off and retry once; `retryable: false` means the quota is exhausted for now — tell the user |
| `UPLOAD_NOT_READY` | `complete_upload` ran before the bytes landed in storage | **The only retryable upload code.** Finish or retry the PUT, then call `complete_upload` again |
| `UPLOAD_EXPIRED` | The presigned ticket passed `expires_at` | Start over from `create_upload`. Re-PUTting to the old URL cannot work |
| `UPLOAD_NOT_FOUND` | The `upload_id` is wrong or already discarded | Start over from `create_upload` |
| `UPLOAD_TOO_LARGE` | The file exceeds the single-object upload limit | Ask the user to upload it from the Media.io web app. Do not try to split it |
| `UPLOAD_PLATFORM_UNSUPPORTED` | This drive space has no presigned upload | Ask the user to upload from the Media.io web app. Do not look for another tool |
| `UPSTREAM_TIMEOUT` | The upstream did not answer in time | Retryable. Retry a read once. For a submission, treat it like `RESULT_UNKNOWN` |
| `UPSTREAM_UNAVAILABLE` | Network failure, unparseable response, or HTTP 5xx | Retryable. Retry a read once, then report the outage |
| `UPSTREAM_REJECTED` | Business rejection with no more specific mapping | Read `hint` and `upstream_code`. A common case is that the user's drive storage is full |
| `INTERNAL_ERROR` | A fault inside the MCP server | Not retryable. Report it, and offer `trace_id` if the user wants to file a bug |

### AUTH_FORBIDDEN, by hint

| Hint | Meaning | Action |
| --- | --- | --- |
| *This capability requires a subscription* | The account's tier cannot use this capability | Run the membership-aware fallback in `SKILL.md`. Do not switch capability without an explicit yes |
| *The task belongs to another user* | The `task_id` is not this account's | Do not retry. Re-read the id, or list the user's own tasks |
| *No access to that drive object* | The referenced asset is not reachable | Re-select the source with `list_assets` |

## Task-level failures

A task that is accepted and then ends in a failing terminal state is **not** an error envelope — it is a successful `get_generation` with `phase: failed`. Read `failure.label` and `failure.reason`.

| `status_label` / `failure.label` | Meaning | Action |
| --- | --- | --- |
| `text_sensitive`, `image_sensitive`, `content_sensitive` | Content-policy rejection | Say so plainly. Do not resubmit the same prompt or image unchanged, and do not paraphrase it to slip past the filter |
| `no_human_face`, `no_human_voice` | The input did not contain what the capability requires | Ask for a suitable source. Do not retry the identical input |
| `content_not_exist`, `invalid_file_size` | The source asset is missing or unusable | Re-select the source with `list_assets` |
| `drive_space_full`, `storage_overrun` | The user's drive is full | Tell the user to free up space. Retrying will fail the same way |
| `timeout`, `server_timeout`, `server_fail`, `abnormal` | Server-side failure | A single retry is reasonable. Ask first if the conversation has escalated to Report or Approve first, since a retry is a new charge |
| `region_not_supported` | The capability is unavailable in the user's region | Stop; there is no workaround from this path |
| `unknown_reason` with `reason: "not found data"` | The source media id was not resolvable | Almost always an `asset_id` (19 digits) passed where a `file_id` (32 hex chars) belongs. Re-read the source parameter value: take `file_id` from `list_assets` or `complete_upload`. Do not resubmit the same id |
| `unknown` | An unrecognised status code, treated as terminal failure | Report the raw `status` value and stop polling |

**Every failing terminal state is refunded by the server.** Always tell the user that a failed attempt cost them nothing.

Before retrying any generic failure on an `image2*`/`*_i2i`/`*_i2v`/`reference2video_*` capability, check whether a source asset was actually supplied, and that what was supplied is a `file_id` rather than an `asset_id`. A missing or mistyped source often surfaces as a generic failure rather than a parameter error.

## Result download failures

`InvalidAccessKeyId`, `SignatureDoesNotMatch`, or HTTP 403 from the storage host means the signed URL was altered or has expired.

**Do not attempt to repair the URL.** Call `get_generation` again and use the fresh `outputs[].url` verbatim. A single re-encoded `&` is enough to break a signature, and the storage service never tells you that is what happened.

## Upload PUT failures

A failure on the PUT to `upload_url` is a storage-side response, not an MCP error — it has no `code` field and no `trace_id`.

| Symptom | Cause | Action |
| --- | --- | --- |
| 403 with `SignatureDoesNotMatch` or `InvalidAccessKeyId` | The URL or an `upload_headers` entry was altered, dropped, added or re-cased | Do not repair either value. Call `create_upload` again and send the new URL and headers verbatim |
| 403 with an expiry message | The PUT started after `expires_at` | Call `create_upload` again, optionally with a larger `expires_in` |
| The transfer stalls or the connection drops | Network | Retry the PUT against the same URL while it is still valid; after `expires_at`, start over from `create_upload` |
| `complete_upload` then reports a size or hash mismatch | The bytes sent do not match what `create_upload` declared | Recompute `file_size`, `content_hash` and `pre_hash` from the real file and start over. Do not adjust the declared values to fit |

## Not errors

- `inline_images: 0` on a successful image task — inlining was skipped (disabled, too large, or timed out). The results are still in `outputs[]`.
- `idempotent_replay: true` — the call replayed an existing task. Nothing extra was charged; do not report it as a second job.
- `missing_capability_codes` non-empty in `describe_capability` — those codes do not exist. Check them before assuming the lookup succeeded.
- `membership` absent from `get_account` — the tier is unknown. Treat it as not a member; do not claim the account is free.
- `rapid_upload: true` with `next_step: "done"` from `create_upload` — the upload already succeeded because the drive held identical content. Take `file_id` and move on; do not PUT and do not call `complete_upload`.
