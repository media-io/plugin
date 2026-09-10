# Credit approval

Worked detail for the three credit modes in `SKILL.md`. Load it when a conversation is about price, approval, or a rejected charge.

## Why the default is silence

`create_generation` submits directly and the server computes the charge itself. There is no gate to satisfy, no ticket to fetch, and no confirmation the protocol requires. A confirmation turn you add on your own is a cost you impose on the user, not a safety feature — and an unrequested credit figure makes the tool feel expensive for no benefit.

So: the user asking for the job **is** the approval. Stay quiet unless something in the conversation says otherwise.

The trade-off is deliberate. Because the server no longer refuses an unapproved submission, the discipline lives here. Escalate honestly when a trigger fires, and never quietly drop back down to Quiet because the last few jobs were cheap.

## Choosing the mode

Work through this once per request, using the whole conversation, not just the current turn.

1. Has the user ever asked to see a price **before** generating, objected to a charge, or asked you to check before spending? Is the balance low relative to this job, or is this a batch? → **Approve first**
2. Has the user ever mentioned credits, cost, price, balance or quota, asked what something cost, or said they want to avoid waste? → **Report**
3. Otherwise → **Quiet**

Once a conversation reaches Report or Approve first, it stays there. Only the user can move it back down, and "the last one was cheap" is not the user saying so.

### Examples

| The user says | Mode |
| --- | --- |
| "Make me a picture of a red fox in snow" | Quiet |
| "Generate 3 variations of this poster" | Quiet — variations alone are not a trigger |
| "How many credits do I have left?" then "ok, make the fox one" | Report — they raised balance |
| "What did that cost?" | Report, from now on |
| "I'm running low, let's not waste credits" | Report |
| "How much would a 10-second video be?" | Approve first |
| "Check with me before spending anything" | Approve first, for the rest of the conversation |
| "Generate one for each of these 40 prompts" | Approve first — a batch multiplies the charge |
| "Stop asking me about cost every time" | Drop to Report: keep stating the cost, stop asking |

## Approve first, step by step

1. Finalise the parameters and resolve any source asset **before** estimating. An estimate for parameters you then change is worthless.
2. Call `estimate_generation` with the exact `capability_code` and `parameters` you are about to submit. It returns `credit` and, when the upstream supplies it, `balance`. It spends nothing.
3. Tell the user: the capability (`Display Name (capability_code)`), the estimated cost, the remaining balance, and that the actual charge is resolved server-side. **Then end your turn.**
4. Wait for a fresh, explicit message approving this specific job.
5. Submit with `approved_credit` set to the number they approved.

### What does not count as approval

- The host running in auto-approve / YOLO mode.
- A tool-permission prompt the host answered on your behalf.
- Your own judgement that the amount is small.
- Approval the user gave for a *different* job earlier in the conversation.

If the host cannot put a question to the user at all, do not submit. Say the job is ready and waiting for credit approval, and stop.

## approved_credit

`approved_credit` is an optional guard, not a ticket. When you pass it, the server recomputes the price and rejects the submission with `CREDIT_CHANGED` if the two differ. When you omit it, the submission just goes through at whatever the server computes.

Pass it whenever a human approved a specific number. Omit it in Quiet and Report — there is no approved number to guard.

On `CREDIT_CHANGED`:

1. Show the user the new number.
2. Ask again.
3. Submit with the new value only after they say yes.

Never "fix" the mismatch by resubmitting with the recomputed number yourself. The guard exists precisely to stop that.

## Insufficient credits

`CREDIT_INSUFFICIENT` (or an estimate showing the balance cannot cover the job):

1. Say in one short line what the balance is and what the job needs.
2. Hand over `get_account.credits_url` **unchanged**.
3. Stop. Do not offer to retry until the user says they are ready, and do not resubmit on your own once the balance changes.

Never type a media.io URL from memory and never edit one you were given. The destination and its tracking parameters are owned by the server and can change without a skill update. Do not describe the destination in your own words and do not name a payment step.

## Membership-aware fallback

Trigger: `CREDIT_INSUFFICIENT`, or `AUTH_FORBIDDEN` with a hint about a required subscription.

Read `membership.is_member` from `get_account`. Missing membership means unknown, which you treat as not a member — but do not tell the user they are on a free plan when you do not know.

**Non-member** — lead with the downgrade. Name the specific fallback `capability_code` from the fallback chain in `references/model-catalog.md`, so the user knows exactly what they would get instead. Mention topping up second, with `credits_url`.

**Member** — lead with topping up (`credits_url`). Mention that a cheaper capability is also an option, but do not name a specific `capability_code`; a paying member does not need to be steered toward the downgraded tier by name.

Both branches need an explicit yes before you act. If the user picks the fallback, re-estimate for the new capability — its price is different — and confirm again under the normal rules.

## Refunds and retries

- A task that ends in a failing terminal state is refunded by the server. **Always tell the user the failed attempt cost them nothing.** This is the one time you volunteer credit information in Quiet mode.
- Every resubmission is a fresh charge. If the conversation is in Approve first, a retry needs its own approval.
- `idempotent_replay: true` means the call replayed an existing task. Nothing extra was charged.
