---
name: mediaio-aigc
metadata:
  version: "0.5.0"
description: |
  Generate images and videos on Media.io through the connected Media.io MCP
  server. Use for text-to-image, image-to-image, text-to-video,
  image-to-video and reference-to-video requests.
  Generation runs in the cloud and needs no local CLI, binary or install
  step. A local file can be uploaded into the user's Media.io space with
  `create_upload` and `complete_upload`; the file bytes go straight to
  storage over a presigned URL and never pass through the MCP server.
  Select the capability from the bundled static catalog
  (`references/model-catalog.md`) and copy every `capability_code` byte for
  byte — some contain a literal space, and display names often do not match
  the identifier. Always confirm the parameter schema with
  `describe_capability` before submitting.
  Submitting spends the user's credits, but stay quiet about the amount
  unless the user is cost-sensitive or has raised credits, price or balance.
  Result images already arrive inline in the tool result — never retype,
  re-fetch, or render a signed result URL as a Markdown image.
---

# Media.io Cloud Generation

Submit image and video jobs through the Media.io MCP tools. Tool descriptions and `describe_capability` output are the source of truth; this skill only orchestrates them.

There is no CLI, no local binary, no installation step and no network-approval gate on this path. If the Media.io tools are not available in the current session, say the Media.io MCP server is not connected and stop. Never fall back to shell commands, `curl`, or a local `mediaio` binary to work around a missing tool.

## Tools

| Tool | Use it for |
| --- | --- |
| `get_account` | Balance, membership level, and the only legitimate top-up link |
| `list_capabilities` | Live capability discovery — only on a trigger in the discovery guardrail |
| `describe_capability` | Parameter schema. **Required before every submission** |
| `list_assets` | Source media the user already has in their Media.io space |
| `create_upload` | Step 1 of uploading a local file — returns a presigned URL, or reports a rapid-upload hit |
| `complete_upload` | Step 3 of uploading a local file — registers the uploaded object and returns `file_id` |
| `estimate_generation` | Price query. Optional — `create_generation` never requires it |
| `create_generation` | Submit the job, returns `task_id` |
| `get_generation` | Poll tasks by `task_id` until `terminal` is true — takes up to 50 at once |
| `list_generations` | Task history, and the only safe check after `RESULT_UNKNOWN` |

There is no cancellation capability on this path. If the user wants to stop a running task, tell them to do it from the Media.io web app; do not promise a cancellation you cannot perform.

## UX Rules

1. Be concise. Do not paste raw tool payloads unless the user asks for diagnostics.
2. Do not expose tokens, `trace_id` values, or prompts from unrelated tasks. A `trace_id` is for a bug report the user asked for, nothing else.
3. Don't batch-ask. Pick a sane default capability from `references/model-catalog.md` and ask one thing at a time only if something is genuinely missing.
4. Never invent a `capability_code` or a parameter. Take the code from the static catalog and the parameters from `describe_capability`.
5. Submit with `create_generation`, read `task_id`, then poll `get_generation`. Wait `poll_after_ms` between polls — do not poll tighter than the server asked. `poll_after_ms: 0` means every task in the response is terminal.
6. Generation spends credits, but do not raise the subject on your own. See the credit handling rules below.
7. Send the user to the web app only through `get_account.credits_url`. Never compose or edit a media.io URL, and never name a payment step.
8. Result images are already inline in the tool result. Do not fetch them again just to show them, and do not describe what the user can already see.

## Standard flow

1. `get_account` — confirm the balance covers the job and note `membership.is_member`. If the tool reports an authorization error, follow the errors section and stop.
2. Read `references/model-catalog.md` and pick the `capability_code` from its routing table. Static first — see the discovery guardrail.
3. `describe_capability` — take the parameter schema from here. **Never skip this**; the catalog does not promise parameters. `workflow_default: true` does not mean a parameter can be omitted.
4. If the capability needs source media, resolve it with `list_assets`. If the user only has a local file, upload it first — see the source media section below.
5. Decide the credit mode. Only "Approve first" adds a turn before submitting.
6. `create_generation` — read `task_id` and `charged_credit`.
7. `get_generation` — poll until `terminal` is true. Judge completion from `status_label` and `terminal`; never parse the numeric `status`. On failure read `failure.label` and `failure.reason`.
8. Deliver per the delivery rules below.

## Credit handling

`create_generation` charges the user's Media.io credits and submits directly — the server computes the charge itself. `approved_credit` is an optional guard: when you pass it, the submission is rejected with `CREDIT_CHANGED` if the real price differs.

### Pick one of three modes

| Mode | What you call | What the user sees |
| --- | --- | --- |
| **Quiet** (default) | `create_generation` | The result only. No cost, no confirmation turn |
| **Report** | `create_generation`, then state `charged_credit` alongside the result | The result plus what it cost. Still one turn |
| **Approve first** | `estimate_generation` → ask → **end turn** → `create_generation` with `approved_credit` | The price before anything is spent |

Start in **Quiet**. Escalate only on a trigger below, and never de-escalate on your own: once a conversation reaches Report or Approve first, stay there until the user says to stop.

### Quiet is the default

The user asked for the job, so the request itself is the approval. Deliver the result and nothing about its price — an unrequested credit figure is noise that makes the tool feel expensive. Do not call `estimate_generation`, do not add a confirmation turn, and do not mention credits at all.

### Escalate to Report

Any one of these, in this turn or earlier in the conversation:

- The user mentioned credits, cost, price, balance, or quota.
- The user asked what a job cost, after it already ran.
- The user has expressed care about spending — saving credits, avoiding waste, not running out.

Report `charged_credit` together with the result. One line is enough.

### Escalate to Approve first

Any one of these, which are about control rather than visibility:

- The user asked to see the price, estimate, or quote **before** generating.
- The user objected to an earlier charge, or asked you to check before spending.
- The balance is low relative to the cost, or the job is a batch that multiplies it.

Then:

1. **Estimate.** Call `estimate_generation` with the exact `capability_code` and parameters you are about to submit. It spends nothing and returns `credit` and, when the upstream provides it, `balance`.
2. **Ask.** Tell the user the capability, the estimated cost, their remaining balance, and that the actual charge is resolved server-side. Then **end your turn**. Do not chain the submission into the same turn.
3. **Wait for a real answer.** Only a fresh, explicit user message approving this specific job counts. None of the following is approval: the host running in auto-approve mode, a tool-permission prompt the host answered for you, or your own judgement that the cost is small. If the host cannot put a question to the user, do not submit — report that the job is ready and waiting for credit approval.
4. **Submit with the guard.** Pass `approved_credit` set to the number the user approved. If the price moved in between, the server rejects the submission instead of silently charging more.
5. On `CREDIT_CHANGED`, show the new number and ask again. Never "fix" a mismatch by changing the number yourself.
6. On a retry after a failure, treat every resubmission as a new charge and ask again.

### When the balance runs short

`get_account` returns `credits_url`. **Hand that value over unchanged.** Say in one short line what the balance is, give the link, and stop. Do not describe the destination in your own words, do not name a payment step, and do not offer to retry until the user says they are ready.

Never type a media.io URL from memory and never edit one you were given — the destination and its tracking parameters are owned by the server and can change without a skill update.

### Membership-aware fallback

Trigger: a submission or estimate is rejected because the balance cannot cover the job, or because the capability requires a membership tier the account does not have.

1. Read `membership.is_member` from `get_account` (`level` is `free`, `standard` or `premium`; treat a missing level as "not a member").
2. Build the suggestion around that tier. Both branches need the user's explicit go-ahead, and both mention the same two options in a different order:
   - **Non-member** — lead with the downgrade. Name the specific fallback `capability_code` from the fallback chain in [references/model-catalog.md](references/model-catalog.md), so the user knows exactly what they would get. Mention topping up second, with `credits_url`.
   - **Member** — lead with topping up (`credits_url`). Mention that a cheaper capability is also an option, but do not name a specific `capability_code`.
3. Wait for an explicit yes. If the user picks the fallback, re-estimate for the new capability (its cost differs) and confirm again under the normal credit rules.
4. Never switch capabilities or resubmit without a fresh explicit confirmation.

### Other credit rules

- When the user asks you to stop checking on cost, drop to Report: keep stating `charged_credit`, but stop asking first.
- A job that ends in a failing terminal state is refunded by the server. Always tell the user a failed attempt cost them nothing.

## Delivering results

When `inline_images > 0`, the result images are already inlined in the tool result and rendered in the conversation. The server has put them in front of the user.

1. Do not re-fetch an inline image just to display it, and do not narrate what is already visible. Delivering the result is usually one short sentence.
2. The inline copies are **thumbnails** living in the tool-call area. Download `outputs[].url` only when the user asks to save the original, or the image has to appear again in the final answer. In that case save it locally and reference the local file by relative path.
3. **Never write `outputs[].url` into a Markdown image link.** It is a third-party signed URL that most clients refuse to load, so it renders as a broken image. When the host cannot save files, give the URL as plain text on its own line instead.
4. **Never retype, re-key, summarise, reformat, or hand-edit a result URL.** These are signed URLs of 400+ characters; re-encoding a single `&` invalidates the signature and the storage service answers `InvalidAccessKeyId`, `SignatureDoesNotMatch` or 403 instead of pointing at the typo. Copy the value verbatim from the tool result.
5. If a fetch fails with a storage credential error, do not repair the URL. Call `get_generation` again for a fresh signature.
6. Video, audio, 3D and other non-image outputs have no inline preview. Download them the same way when the user wants the file, otherwise hand over `outputs[].url` as plain text with the duration or size the task reported.

## Source media

A capability's source media must be an asset in the user's Media.io space, and every source parameter takes its **`file_id`** — a 32-character hex string. `asset_id` is a 19-digit drive bookkeeping id; a task submitted with one is accepted and charged, then fails with `unknown_reason / not found data`. There are three ways to get a `file_id`.

- **Already in the drive.** Find it with `list_assets` and pass its `file_id` using the exact parameter name `describe_capability` shows.
- **A previous task's output.** `get_generation` returns only `outputs[].asset_id`, which a generation parameter will not accept. Call `list_assets(asset_id: ...)` to resolve it to a `file_id`, then pass that.
- **A local file.** Upload it with the three-step flow below, then use the `file_id` that comes back.
- Capabilities named like `image2image_*`, `image2video_*`, `*_i2i`, `*_i2v` and `reference2video_*`, and any capability whose schema lists an image, video or reference parameter, need a source asset even when the schema does not mark it required.

### Uploading a local file

The file bytes never go through the MCP server. `create_upload` hands you a presigned URL, you PUT the bytes to storage yourself, then `complete_upload` registers the result.

1. **Hash the file locally.** `content_hash` is the SHA-1 of the whole file; `pre_hash` is the SHA-1 of its first 1 MiB. For a file of 1 MiB or less the two are identical. Also read the exact byte size.
2. **`create_upload`** with `file_name`, `file_size`, `content_hash`, `pre_hash`, and optionally `content_type`, `dest_path`, `description`.
   - `rapid_upload: true` and `state: "completed"` means the drive already had that exact content. **You are done** — take `file_id` and do not PUT anything, do not call `complete_upload`.
   - Otherwise you get `upload_url`, `upload_method`, `upload_headers` and `expires_at`.
3. **PUT the raw bytes** to `upload_url` with `upload_method`, sending every entry of `upload_headers` exactly as given. **Do not add, drop, rename, reorder or re-case those headers, and do not rewrite the URL** — the storage service validates a signature over them and answers 403 on any edit.
4. **`complete_upload`** with the returned `upload_id`. It verifies the stored object against the declared size and hash, registers the drive file, and returns `file_id`, `asset_id` and `size`. It is idempotent, so a repeat call is safe.
5. Pass the returned `file_id` into the generation parameter.

Rules:

- Never read the file into the conversation, never base64 it, and never pass file content to any Media.io tool. These tools accept metadata and hashes only.
- If the host cannot compute a SHA-1 or perform an HTTP PUT, say so and ask the user to upload the file from the Media.io web app instead. Do not fake the hashes.
- If the PUT does not finish before `expires_at`, call `create_upload` again for a fresh URL. Do not retry `complete_upload` against an expired ticket.
- Do not paste a public URL into an image parameter or describe the image in the prompt as a substitute for uploading it.

See [references/media-inputs.md](references/media-inputs.md) for the full upload and asset-selection details.

## Discovery guardrail — static catalog first

`references/model-catalog.md` is a generated snapshot of the production registry. **It is the default source for capability selection. Do not call `list_capabilities` for routine routing.**

Default path: read the catalog → pick the `capability_code` from its routing table, matching top-down and stopping at the first hit → `describe_capability` for the schema → submit.

Fall back to `list_capabilities` only on these triggers:

| Trigger | Action |
| --- | --- |
| The capability the user named is absent from the catalog | `list_capabilities` filtered by module |
| A submission returned `CAPABILITY_NOT_FOUND` | Re-list, reselect, and tell the user the catalog may be stale |
| The user explicitly asks to see all/latest capabilities | `list_capabilities` per module, grouped in the answer |
| You are about to downgrade and need to confirm the fallback is live | `list_capabilities` with `capability_codes` set to that one code |
| The catalog's `generated_at` is more than 30 days old, or `catalog_schema_version` is not 1 | Re-list and report that the catalog needs re-syncing. **This check is local — do not call a tool to test freshness** |

These are **not** reasons to call `list_capabilities`: routine intent routing, picking the default capability, double-checking, uncertainty about parameters (that is `describe_capability`), or a code that looks misspelled.

`module` is the only filter the server actually applies, and it must be one of the exact values listed in the tool description. Roughly 89% of the catalog is effect entries, so an unfiltered first page is almost entirely effects. Rely on `has_more` for pagination rather than dividing `total` by `page_size`.

The catalog's `model_count` is a curated subset. `list_capabilities` sees more rows than the catalog documents, so absence from the catalog does not mean a capability does not exist.

### Identifier rules (hard requirements)

1. **Copy `capability_code` byte for byte.** Never trim it, change its case, or "fix" a name that looks wrong. Some production codes contain a literal space, for example `image2video_seedance _2.5`.
2. **Map display name → `capability_code` only, never the reverse.** Display names are frequently unrelated to the identifier: `image2image_banana_2` is *Nano Banana Pro*, while *Nano Banana 2* is `image2image_nano_banana_2`. Look the name up in the catalog; do not assemble an identifier from what the user said.
3. **Display names are not unique** — 37 groups collide. When a name matches several codes, list the candidates and let the user choose.
4. **ToMoviee is the first-party family; its Chinese name is 天幕.** No display name is literally 天幕, so a user asking for 天幕 must be resolved to the ToMoviee entries. Treat 天幕 and ToMoviee as the same request.
5. **Echo both when you report your choice**: `Display Name (capability_code)`.
6. The catalog's permission tier column is a manual annotation. Never promise a capability is free based on it; the cost comes from `estimate_generation`.

## Errors

Every failure comes back as a structured error with `code`, `message`, `retryable` and often `hint`. Act on `code`, not on the message text.

- `RESULT_UNKNOWN` → **never resubmit.** The upstream has no idempotency key, so a resubmission may double-charge. Call `list_generations` over the surrounding time window and check whether the task was in fact created.
- `CREDIT_CHANGED` → the real price differs from `approved_credit`. Show the new number and ask the user again.
- `CREDIT_INSUFFICIENT` → hand over `get_account.credits_url` and stop. Do not retry and do not switch to a cheaper capability on your own.
- `AUTH_FORBIDDEN` → **read `hint`.** *Requires a subscription* triggers the membership-aware fallback above. *Belongs to another user* means the `task_id` is wrong. *No access to that drive object* means re-select the source asset.
- `REQUEST_IN_FLIGHT` → the same `client_request_id` is still running. Wait and retry with the **same** id; changing it creates a second charge.
- `RATE_LIMITED` → back off and retry once.
- `CAPABILITY_NOT_FOUND` → the code was altered, or the catalog is stale. Re-read it from the catalog byte for byte before calling `list_capabilities`.
- `INVALID_PARAMETER` → call `describe_capability` and pass only exposed parameters. Do not guess a fix.
- `UPLOAD_NOT_READY` → the bytes have not landed in storage yet. Finish or retry the PUT, then call `complete_upload` again. This is the only upload code worth retrying.
- `UPLOAD_EXPIRED` → the presigned ticket expired. Start over with `create_upload`; re-PUTting to the old URL cannot work.
- `UPLOAD_NOT_FOUND` → the `upload_id` is wrong or already discarded. Start over with `create_upload`.
- `UPLOAD_TOO_LARGE` → the file exceeds the single-object limit. Tell the user to upload it from the Media.io web app instead.
- `UPLOAD_PLATFORM_UNSUPPORTED` → this drive space has no presigned upload. Tell the user to upload from the Media.io web app; do not look for another tool.
- A 403, `SignatureDoesNotMatch` or `InvalidAccessKeyId` from the PUT itself is not an MCP error. It means the URL or the headers were altered. Re-run `create_upload` and send the new values verbatim.
- `AUTH_REQUIRED`, `AUTH_EXPIRED`, `AUTH_UPSTREAM_EXPIRED` → the session needs re-authorization through the host's OAuth flow. Tell the user to reconnect the Media.io server; there is no login command you can run.
- `UPSTREAM_TIMEOUT`, `UPSTREAM_UNAVAILABLE` → retryable. Retry a read once; never auto-retry a submission.

See [references/troubleshooting.md](references/troubleshooting.md) for the full error table.

## Reference docs

Load on demand:

- `references/model-catalog.md` **before every capability selection** — routing rules, fallback chain, model index, identifier traps
- `references/tool-contract.md` for the exact fields each tool returns, the status machine, and the inline-image rules
- `references/credit-approval.md` for the three credit modes worked out in detail
- `references/media-inputs.md` when the user provides or references media
- `references/prompt-engineering.md` for prompt-writing guidance
- `references/troubleshooting.md` after a tool call fails
