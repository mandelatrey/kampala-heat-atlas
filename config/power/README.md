# Power-cut log

Two files feed the atlas's power-cut figures (`scripts/33_power.py` → `docs/power/power.json`); re-run the script
after editing either:

- `outage_log.csv`: **one row per reported cut**, for example each complaint to UEDCL on X about a cut in an area.
  Several complaints about the same area on the same day count as one cut day.
- `sampling.csv`: **which areas you watched, over which dates.** Inside a watched period, a day with no reported cut
  counts as a day the power stayed on. That is what turns reports into a rate (days a week with a cut).

## outage_log.csv

| column | what to put | example |
|---|---|---|
| `area` | neighbourhood name as people use it; if it matches a name on the atlas map, lat/lon can stay empty | `Kawempe` |
| `lat`, `lon` | optional, decimal degrees (needed when the name is not on the map) | `0.3750`, `32.5570` |
| `date` | `YYYY-MM-DD` | `2026-11-05` |
| `hours_off` | how long the power was off that day, **if the report says**; leave blank if not. `0` = power stayed on | `6.5` |
| `cuts` | separate cuts that day (optional) | `2` |
| `kind` | `planned`, `unplanned` or `unknown` | `unplanned` |
| `start`, `end` | optional `HH:MM`, e.g. a planned cut's announced window | `07:00`, `18:00` |
| `source` | a plain label for where it came from | `X complaint to UEDCL`, `UEDCL notice` |
| `notes` | anything else (not published) | `whole of Mbogo road` |

A **planned cut announced for a future date** goes in with `kind` = `planned`, its date and window: the atlas shows it
as an upcoming cut for that area until the day passes.

## sampling.csv

| column | what to put | example |
|---|---|---|
| `area` | the area watched, or `*` for every area in the log without its own row | `Kawempe` |
| `lat`, `lon` | optional, as above | |
| `from`, `to` | first and last day watched, `YYYY-MM-DD` | `2026-11-01`, `2026-11-14` |
| `source` | how it was watched | `X complaints to UEDCL` |

**List the quiet areas too.** An area you watched and found no complaints for still needs a row here: it counts as
"no cuts", and the model needs those as much as the areas where the power goes off several times a week. If only
the worst areas are in the sample, estimates for ordinary areas come out too high, and the held-out test cannot catch
that.

An area with reports but no sampling period is shown as "reports only" (its first to last report would overstate the
rate) and kept out of the model.

## How the estimates work

With at least 6 areas watched for a week or more, the script tries to estimate days a week with a cut for every other
named place: from the nearest watched areas, or from how each area is built (built-up, new building since 2017, tree
cover, packed housing, distance from the centre). It predicts each watched area from the others and publishes estimates
only if the better method beats simply using the average by at least 10 %. Hours a week come from the reports that say
how long a cut lasted (the typical hours per cut day).

## Keep it private

The repository and the site are public. **No usernames, @handles, tweet links, names or phone numbers** anywhere in
these files: record the area, date, hours and a plain label such as `X complaint to UEDCL`. The script drops any
source label that looks like a link or handle, but notes are your responsibility. Collect complaints by reading them,
not by automated scraping, which X's terms do not allow without API access.
