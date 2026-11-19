# Power-cut log

`outage_log.csv` feeds the atlas's power-cut figures (`scripts/33_power.py` → `docs/power/power.json`). Re-run the
script after editing it.

**One row per area per day you checked, including days the power stayed on** (`hours_off` = 0). Those zero days
are what turn a list of cuts into a rate (hours a week without power). An area with no zero days is shown as
"reported cuts only" and left out of the model.

| column | what to put | example |
|---|---|---|
| `area` | neighbourhood name as people use it; if it matches a name on the atlas map, lat/lon can stay empty | `Kawempe` |
| `lat`, `lon` | optional, decimal degrees (needed when the name is not on the map) | `0.3750`, `32.5570` |
| `date` | `YYYY-MM-DD` | `2026-11-05` |
| `hours_off` | hours without grid power that day, 0 to 24 | `6.5` |
| `cuts` | how many separate cuts that day (optional) | `2` |
| `kind` | `planned`, `unplanned` or `unknown` | `planned` |
| `start`, `end` | optional `HH:MM`, e.g. a planned cut's announced window | `07:00`, `18:00` |
| `source` | where it came from | `UEDCL notice`, `resident diary`, a news link |
| `notes` | anything else | `transformer replaced` |

A **planned cut announced for a future date** goes in as a row with `kind` = `planned`, its date and window: the
atlas shows it as an upcoming cut for that area until the day passes.

Aim for the same days across areas (for example the same two weeks), and for areas in different parts of the city,
centre and edge, old and new. With at least 6 areas logged as a diary, the script tests whether it can estimate the
rest of the city: it predicts each logged area from the others and publishes estimates only if that beats simply
using the average. The page says which it did and how far off it was.

No personal names or phone numbers: what this produces is public.
