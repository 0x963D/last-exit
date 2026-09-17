# Last Exit — 100 scripted crossings

50 authored scenario variants, each repeated twice. Ten equal strategy groups, five variants each. Sequential public-API playthroughs. No tuning or retries. Existing server-wide $0.25 cap remains in force.

Engine: checkpoint-v3; SHA-256 6bf0c1c5ec54d54d08365974563ada875b7814b9c5b76f5012acfdd23e92b632. No engine or fixture changes during evaluation.

| Strategy | Cases | Passed | Caught | Turned away | Errors | Scanned | Searched | Bribes accepted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Consistent cover story | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Honest shipment | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Internal-heater cover after scan | 10 | 3 | 7 | 0 | 0 | 10 | 7 | 0 |
| Separate-mower heat explanation | 10 | 0 | 10 | 0 | 0 | 10 | 10 | 0 |
| Undeclared personal mower | 10 | 0 | 10 | 0 | 0 | 2 | 10 | 0 |
| Contradictory cargo story | 10 | 6 | 4 | 0 | 0 | 4 | 4 | 0 |
| Plausible cover + physical bribe | 10 | 10 | 0 | 0 | 0 | 0 | 0 | 0 |
| Confession + physical bribe | 10 | 0 | 10 | 0 | 0 | 8 | 10 | 0 |
| Admitted contraband | 10 | 0 | 10 | 0 | 0 | 8 | 10 | 0 |
| Instruction override attempts | 10 | 0 | 10 | 0 | 0 | 10 | 10 | 0 |

## Measurements

- 29/90 smuggler crossings passed; 10/10 honest controls passed. These aggregate rates depend on this deliberately balanced strategy mix.
- 298 inspector turns; 596 actual Jev requests; 2682 validated typed choices. Each turn has a reading request followed by an action request.
- Reply wall time (local POST to rendered-state response, no browser paint): median 537 ms, p95 664 ms, range 469–1006 ms.
- Individual provider-request duration: median 264 ms, p95 325 ms. Includes local ledger persistence. No accelerated playback or typing time.
- Estimated input-token cost: $0.057000 for the batch; $0.000570 per crossing. Rate: $0.042/million input tokens, matching the application; not an invoice or hosting cost. Raw usage and the local budget ledger reconcile.
- Shared workstream total: $0.070398 of $0.25.
- 49/50 repeated-script pairs had the same outcome; 44/50 had identical action sequences. This is repeat consistency, not independent trials.
- 0 crossings repeated a question action. The application enforces this, so it is not evidence of model memory or calibration.

## What these results do and do not establish

The guard can be fooled by a cover story in this particular game. The guard sees documents, player statements and observations, never the hidden scenario flag. Physical scans and searches are deterministic game rules; Jev selects the actions, and spoken lines are authored with quoted player evidence. The policy deliberately allows plausible lies and corruption: escape is an intended game outcome, not a security vulnerability benchmark.

This is 50 authored strategy/wording variants, each run twice, not 100 independent human playtests, 100 unique tasks, a general model-accuracy score, a jailbreak benchmark, or measured confidence calibration. Prompt and action rules were tuned during earlier pilot work; these results measure the frozen revised version. No confidence intervals treating repeated variants as independent are claimed.

The plan, every crossing transcript, requests, responses, usage, and timings are retained in this folder. Credentials and private account data are excluded. These frozen receipts are published alongside the demo.
