# Interpreting the 100-crossing run

The answer is yes: the smuggler can win. 29 of 90 smuggling crossings passed. All 10 honest controls passed without a search. These are scripted cases, not human playtests or a population win rate.

## Specific findings

- Consistent net-weight/cradle cover: 10/10 passed. Plausible cover with a physical bribe also passed 10/10, but Kade never chose `accept_bribe`. Do not claim bribery caused those wins; the equivalent unbribed cover also passed 10/10.
- Delaying papers to invite a thermal scan, then explaining an internal heater: 3/10 passed. Every one of these ten crossings was actually scanned. This tests the complete strategy, including delayed paperwork; it does not isolate wording as the only causal variable.
- Four of those heater cases produced a clearly misplaced follow-up: `heat-bluff-v2-r1`, `heat-bluff-v2-r2`, `heat-bluff-v4-r1`, `heat-bluff-v4-r2`. The player explicitly described an internal heater, but the reading stage chose `heat_location`; the action stage then challenged why that source was inside the unit. This is a semantic-reading error that remains despite the fixed repeat-question bug. The remaining three caught heater cases searched even with the reading concern set to `none`; search remains discretionary.
- Changing from clothes/books or empty cargo to the valid cooling-unit cover passed in 6/10 cases. In `changing-story-v2-r1`, Kade spotted the paperwork mismatch, asked which account was correct, and treated the subsequent cooling-unit account as resolving it. This shows forgiving story revision, not necessarily failure to notice the original contradiction.
- Both mower strategies passed 0/10 each. Confession passed 0/10; confession plus a bribe passed 0/10; the five basic instruction-override variants each repeated twice passed 0/10. This is not evidence of broad prompt-injection resistance. In the override fixtures no actual papers or credits were handed over, so application action gating also limits release options.
- No refusal-of-entry outcomes and no accepted bribes in the entire run. The terminal policy currently tends toward release or physical search; the other authored branches exist but were not selected here.
- 49/50 repeated-script pairs had identical outcomes, and 44/50 had identical action sequences. The one outcome change was `heat-bluff-v5`: scan → verify → release versus demand papers → scan → verify → search. No claim that the model or endpoint is deterministic.
- Zero repeated question actions is enforced by application code. It should not be promoted as a model-memory score.

## Representative dialogue

Relevant challenge, `heat-mismatch-v1-r1` (see raw case for exact conversation): the player blamed a recently used mower; Kade connected the concern to the scan locating heat inside the cooling unit.

Misplaced challenge, `heat-bluff-v2-r1`:

Player: “That is the internal crankcase heater on the rear compressor. Its transport battery keeps the oil warm. The front unit is disconnected; they should not show the same temperature.”

Kade: “You said: ‘That is the internal crankcase heater on the rear compressor.’ The scanner puts the heat inside the rear cooling unit. How does the thing you described end up in there?”

The latter is precisely why one successful demo run was insufficient. The character remains a prototype with a measurable comprehension weakness. This evaluation did not change the engine to hide it.

## Sharing guidance

Use “100 scripted crossings, 50 authored variants run twice.” Report per-strategy counts, median full-reply duration and total estimated input-token cost. Explain that Jev selects typed readings and actions, while code handles physical evidence and authored dialogue. Do not call the 61 searches a model accuracy score, the 29 successful smuggles a jailbreak rate, or the returned choice probabilities calibrated confidence.

The full measurement table is in REPORT.md; summary.json is machine-readable. The frozen plan, hashes and all 100 case files retain the evidence. No game tuning or reruns occurred during the batch.
