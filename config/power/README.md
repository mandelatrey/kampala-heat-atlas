# Power cuts

Three files feed the atlas's power-cut information (`scripts/33_power.py` → `docs/power/power.json`); re-run the
script after editing any of them:

- `published.csv`: **figures from studies and news**. Studies of the utility's own outage records (`basis` =
  `measured`) are the main source: the atlas shows each one for places within its radius, and a typical Kampala range
  (built from all of them) everywhere else. The solar calculator takes its power-cut defaults and typical cut length
  from them too. News figures (`basis` = `reported`) are shown beside them.
- `outage_log.csv`: **residents' complaints** (e.g. on X), one row per reported cut. Shown as complaints near the area,
  and their times show when in the day cuts are reported. Never shown as a rate unless the area has a sampling period.
- `sampling.csv`: optional; the dates an area was watched in full (see below).

There is no estimate for areas nobody studied: how often the power goes off depends on the line a building is on
(its length, loading and equipment; the studies below name worn jumpers, conductors and transformers, and lines up to
40 km long loaded to 95 %), which the atlas cannot see.

## published.csv

| column | what to put | example |
|---|---|---|
| `areas` | names the figure covers, separated by `;` (its location defaults to their middle) | `Lugogo;Nakawa;Ntinda;Kireka` |
| `lat`, `lon` | optional, instead of the names' middle | |
| `radius_km` | how far from that point to show it (default 3) | `6` |
| `from`, `to` | the period it covers, `YYYY-MM-DD` | `2022-01-01`, `2022-12-31` |
| `cuts_per_month` | cuts a month for the average customer (SAIFI per month) | `5.5` |
| `hours_per_month` | hours without power a month (SAIDI per month), if known | `6.26` |
| `basis` | `measured` (utility outage records) or `reported` (news, residents) | `measured` |
| `qualifier` | e.g. `up to` | |
| `label` | how the page names it | `Kampala East network (Lugogo, Nakawa, Ntinda and Kireka substations)` |
| `source`, `url`, `note` | short citation, link, anything else | |

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
| `reported` | optional `HH:MM` (24-hour): when the cut was reported, e.g. the complaint's time. Used for when in the day cuts happen | `20:03` |
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

Inside a watched period, a day with no reported cut counts as a day the power stayed on, so the area gets a rate
(days a week with a cut). An area watched with no complaints at all counts as no cuts. This only holds if **every**
complaint in the period was recorded; ten complaints found across several years are what a search turned up, not every
cut, so leave those without a period: the atlas shows them as complaints and uses their times, never as a rate.

## Keep it private

The repository and the site are public. **No usernames, @handles, tweet links, names or phone numbers** anywhere in
these files: record the area, date, hours and a plain label such as `X complaint to UEDCL`. The script drops any
source label that looks like a link or handle, but notes are your responsibility. Collect complaints by reading them,
not by automated scraping, which X's terms do not allow without API access.
