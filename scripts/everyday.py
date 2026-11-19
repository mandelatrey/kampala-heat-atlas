"""Everyday weather advice for the public: hour by hour, go / with care / stop for daily activities.

Used by scripts/29_site_weather.py, from the same derived hourly forecast as the construction trades (derive():
rain, rain chance, thunderstorm level, gusts, WBGT in sun and shade, UV, recent rain, visibility, solar elevation),
plus PM2.5 when the air-quality forecast is available. Pure functions, no network: tests in tests/test_everyday.py.

Limits come from thresholds.json -> "everyday" (with their sources) and can be set per site like the trade limits.
These are screening values from a forecast, not warnings: national weather services and local authorities issue
those (in Uganda, UNMA).
"""
import numpy as np
import pandas as pd

GROUPS = ["Getting around", "Events & goods", "Home & health", "Farming"]

# key -> (name, group); the order is the order on the page
ACTIVITIES = {
    "walking": ("Walking & errands", "Getting around"),
    "boda": ("Boda boda & cycling", "Getting around"),
    "driving": ("Driving & travel", "Getting around"),
    "event": ("Weddings & outdoor events", "Events & goods"),
    "goods": ("Moving goods", "Events & goods"),
    "laundry": ("Drying laundry", "Home & health"),
    "sensitive": ("Children & older people outside", "Home & health"),
    "exercise": ("Exercise & sport", "Home & health"),
    "spraying": ("Spraying crops", "Farming"),
    "drying": ("Drying harvest (coffee, maize, beans)", "Farming"),
    "fieldwork": ("Field work", "Farming"),
}

# what to do, by the main cause of the limits; "" = generic
TIPS = {
    "walking": {"storms": "Go indoors at the first thunder and wait 30 minutes after the last.",
                "rain": "Carry an umbrella; keep away from flooded walkways and open drains.",
                "heat": "Walk in the shade and carry water; go early or late in the day."},
    "boda": {"storms": "Do not ride in storms: lightning, blinding rain and flooded roads.",
             "rain": "Wet roads: slow down and keep your distance; ask for a rain cover.",
             "wet roads": "Roads still wet: slow down, brake early, avoid murram after heavy rain.",
             "wind": "Strong gusts: slow down and hold on, especially on open roads.",
             "poor visibility": "Poor visibility: lights on, slow down."},
    "driving": {"downpour": "Downpours can flood low roads and underpasses in minutes: never drive through moving water.",
                "flooded roads": "Heavy rain recently: low-lying roads may be flooded; allow extra time.",
                "storms": "Storm: slow down, lights on, park away from trees.",
                "poor visibility": "Poor visibility: lights on, slow down, keep your distance."},
    "event": {"storms": "Have a covered plan B; stop and shelter everyone at the first thunder.",
              "rain": "Tents with side walls and a dry path for guests; keep chairs and sound gear covered.",
              "wind": "Check tent pegs and ties; take down side walls if the wind picks up.",
              "heat": "Shade and water for guests; keep elders and children out of the sun."},
    "goods": {"storms": "Wait for storms to pass before loading.",
              "rain": "Cover loads with tarpaulin; keep grain, cement and electronics dry.",
              "muddy roads": "Unpaved roads muddy after heavy rain: allow extra time, lighten heavy loads."},
    "laundry": {"rain": "Rain on the way: dry indoors or under a roof.",
                "slow drying": "Slow drying (humid, cloudy or after dark): hang early, bring in before evening."},
    "sensitive": {"heat": "Keep children and older people in the shade with water; no play in the sun at the hottest hours.",
                  "air quality": "Polluted air: keep children, older people and anyone with asthma away from busy roads.",
                  "storms": "Bring everyone indoors at the first thunder."},
    "exercise": {"heat": "Exercise early or late, drink water, stop if dizzy or confused.",
                 "air quality": "Poor air: exercise indoors or away from traffic.",
                 "storms": "No outdoor sport in storms: leave the field at the first thunder.",
                 "rain": "Wet ground: watch your footing."},
    "spraying": {"rain": "Rain within a few hours would wash the spray off: wait for a dry spell.",
                 "wind": "Wind would carry the spray off target: spray in calm air, usually early morning.",
                 "heat": "Hot: spray evaporates; spray in the cool of the morning or evening.",
                 "storms": "Do not spray before storms."},
    "drying": {"rain": "Cover produce or bring it in before rain; re-wetting spoils coffee and grain.",
               "slow drying": "Slow drying today: spread thinly and turn more often; bring in before evening.",
               "night": "Bring produce in at night: dew re-wets it."},
    "fieldwork": {"storms": "Leave the field at the first thunder: open ground is dangerous in lightning.",
                  "heat": "Work early, rest in the shade at midday, drink water.",
                  "waterlogged soil": "Soil waterlogged: avoid digging or ploughing wet soil."},
}


def windows(mask, hours):
    """Contiguous True runs as ['07-11 h', ...] (hour labels are the start of each hour; a gap in hours ends a run)."""
    out, start, hrs, m = [], None, list(hours), list(mask)
    for k in range(len(m) + 1):
        ok = k < len(m) and bool(m[k])
        broken = 0 < k < len(m) and hrs[k] != hrs[k - 1] + 1
        if start is not None and (not ok or broken):
            out.append(f"{hrs[start]:02d}-{hrs[k - 1] + 1:02d} h")
            start = None
        if ok and start is None:
            start = k
    return out


def _col(w, name, default=0.0):
    return w[name].to_numpy(dtype=float) if name in w else np.full(len(w), default)


def rules(w, th):
    """For each activity, a list of (cause, stop, caution) boolean arrays over the hours of w."""
    pr, prob, thn = _col(w, "precipitation"), _col(w, "precipitation_probability"), _col(w, "thunder")
    g10, ws10 = _col(w, "wind_gusts_10m"), _col(w, "wind_speed_10m")
    wsun, wshade = _col(w, "wbgt_sun"), _col(w, "wbgt_shade")
    p3, p24 = _col(w, "rain_prev3"), _col(w, "rain_prev24")
    rh, ta, sw = _col(w, "relative_humidity_2m"), _col(w, "temperature_2m"), _col(w, "shortwave_radiation")
    vis = _col(w, "visibility", np.inf) / 1000
    vis = np.where(np.isnan(vis), np.inf, vis)
    pm = _col(w, "pm2_5", np.nan)
    pm = np.where(np.isnan(pm), 0, pm)
    day = _col(w, "solar_elev") > 0
    # chance of rain in this hour or the next few (rain forecast probability, max over the window)
    p_next = lambda n: pd.Series(prob[::-1]).rolling(n, min_periods=1).max().to_numpy()[::-1]
    r_next = lambda n: pd.Series(pr[::-1]).rolling(n, min_periods=1).sum().to_numpy()[::-1]
    t = th
    F = np.zeros(len(w), bool)
    storms = ("storms", thn >= 2, thn == 1)
    heat = lambda c, s, x=wsun: ("heat", x >= s, x >= c)
    air = ("air quality", pm >= t["pm25_stop_ug_m3"], pm >= t["pm25_caution_ug_m3"])
    return {
        "walking": [storms, ("rain", pr >= t["heavy_rain_mm_h"], (pr >= t["drizzle_mm_h"]) | (prob >= t["rain_chance_caution_pct"])),
                    heat(t["heat_wbgt_caution_C"], t["heat_wbgt_stop_C"])],
        "boda": [storms, ("rain", pr >= t["rain_mm_h"], (pr >= t["drizzle_mm_h"]) | (prob >= t["rain_chance_caution_pct"])),
                 ("wet roads", F, p3 >= t["wet_roads_prev3h_mm"]),
                 ("wind", g10 >= t["gust_stop_ms"], g10 >= t["gust_caution_ms"]),
                 ("poor visibility", vis < t["vis_stop_km"], vis < t["vis_caution_km"])],
        "driving": [("downpour", pr >= t["downpour_mm_h"], pr >= t["heavy_rain_mm_h"]),
                    ("flooded roads", F, p3 >= t["flood_prev3h_mm"]),
                    ("storms", F, thn >= 2),
                    ("poor visibility", vis < t["vis_stop_km"], vis < t["vis_caution_km"])],
        "event": [storms, ("rain", pr >= t["rain_mm_h"], (pr >= t["drizzle_mm_h"]) | (prob >= t["event_rain_chance_caution_pct"])),
                  ("wind", g10 >= t["tent_gust_stop_ms"], g10 >= t["tent_gust_caution_ms"]),
                  heat(t["sensitive_wbgt_caution_C"], t["heat_wbgt_stop_C"], wshade)],
        "goods": [storms, ("rain", pr >= t["rain_mm_h"], (pr >= t["drizzle_mm_h"]) | (prob >= t["rain_chance_caution_pct"])),
                  ("muddy roads", F, p24 >= t["muddy_roads_prev24h_mm"])],
        "laundry": [("rain", (pr >= t["drizzle_mm_h"]) | (p_next(3) >= t["drying_rain_chance_stop_pct"]),
                     p_next(3) >= t["drying_rain_chance_caution_pct"]),
                    ("slow drying", F, (rh >= t["drying_rh_caution_pct"]) | (sw < t["drying_sun_caution_wm2"]))],
        "sensitive": [storms, heat(t["sensitive_wbgt_caution_C"], t["sensitive_wbgt_stop_C"]), air],
        "exercise": [storms, heat(t["exercise_wbgt_caution_C"], t["exercise_wbgt_stop_C"]), air,
                     ("rain", F, pr >= t["rain_mm_h"])],
        "spraying": [storms, ("rain", (pr >= t["drizzle_mm_h"]) | (r_next(t["spray_rain_free_h"]) >= t["rain_mm_h"])
                              | (p_next(t["spray_rain_free_h"]) >= t["spray_rain_chance_stop_pct"]),
                              p_next(t["spray_rain_free_h"]) >= t["spray_rain_chance_caution_pct"]),
                     ("wind", ws10 >= t["spray_wind_stop_ms"], ws10 >= t["spray_wind_caution_ms"]),
                     ("heat", F, ta >= t["spray_hot_C"])],
        "drying": [("rain", (pr >= t["drizzle_mm_h"]) | (p_next(3) >= t["drying_rain_chance_stop_pct"]),
                    p_next(3) >= t["drying_rain_chance_caution_pct"]),
                   ("night", ~day, F),
                   ("slow drying", F, day & ((rh >= t["drying_rh_caution_pct"]) | (sw < t["drying_sun_caution_wm2"])))],
        "fieldwork": [storms, heat(t["heat_wbgt_caution_C"], t["heat_wbgt_stop_C"]),
                      ("waterlogged soil", F, p24 >= t["waterlogged_prev24h_mm"]),
                      ("rain", pr >= t["heavy_rain_mm_h"], pr >= t["rain_mm_h"])],
    }


def row(key, hours, rs):
    """One activity for the day: status per hour (0 go, 1 with care, 2 stop), label, causes and a tip."""
    stop = np.any([s for _, s, _ in rs], axis=0)
    care = np.any([c for _, _, c in rs], axis=0)
    st = np.where(stop, 2, np.where(care, 1, 0))
    n_go = int((st == 0).sum())
    count = {cause: int(((s | c) & (st > 0)).sum()) for cause, s, c in rs}
    causes = sorted([c for c, n in count.items() if n], key=lambda c: -count[c])
    go, stops = windows(st == 0, hours), windows(st == 2, hours)
    if n_go == len(st):
        status, label = "GO", "Fine all day"
    elif n_go:
        status, label = "LIMITED", "Best " + ", ".join(go[:2])
    elif (st == 2).all():
        status, label = "STOP", "Not today"
    else:
        status = "CAUTION" if not stops else "LIMITED"
        label = "With care" + (f", not {', '.join(stops[:2])}" if stops else "")
    tips = TIPS[key]
    action = tips.get(causes[0], "") if causes else "No weather limits."
    if len(causes) > 1 and causes[1] in tips and causes[1] != causes[0]:
        action += " " + tips[causes[1]]
    name, group = ACTIVITIES[key]
    return dict(key=key, name=name, group=group, status=status, label=label, go_hours=n_go, windows=", ".join(go),
                causes=causes, action=action, hours=[[int(h), int(v)] for h, v in zip(hours, st)])


def day(g, th, pm25=None):
    """Everyday advice for one day: `g` is that day's hourly frame from derive(), `pm25` an hourly PM2.5 series."""
    h0, h1 = th["hours"]
    w = g[(g.index.hour >= h0) & (g.index.hour < h1)].copy()
    if pm25 is not None:
        w["pm2_5"] = pm25.reindex(w.index).to_numpy()
    hours = list(w.index.hour)
    rows = [row(k, hours, rs) for k, rs in rules(w, th).items()]
    thn, pr = _col(w, "thunder"), _col(w, "precipitation")
    likely, possible = windows(thn >= 2, hours), windows(thn >= 1, hours)
    heavy = windows(pr >= th["heavy_rain_mm_h"], hours)
    r = {x["key"]: x for x in rows}
    hot = windows(np.array(r["sensitive"]["hours"])[:, 1] == 2, hours) if "heat" in r["sensitive"]["causes"] else []
    span = lambda win: f"{win[:2]}:00 to {win[3:5]}:00"            # "07-17 h" -> "07:00 to 17:00"
    if likely:
        head = f"Storms likely {span(likely[0])}. Do errands and travel outside those hours; outdoor events need a covered plan B."
    elif heavy:
        head = f"Heavy rain around {heavy[0][:2]}:00: low roads may flood, so allow extra travel time."
    elif hot:
        head = f"Hot {span(hot[0])}: keep children and older people in the shade."
    elif possible:
        head = f"Storms possible {span(possible[0])}: plan outdoor things outside those hours if you can."
    elif _col(w, "precipitation_probability").max() >= th["rain_chance_caution_pct"]:
        head = "Showers possible: carry an umbrella."
    elif all(x["status"] == "GO" for x in rows):
        head = "A good day to be out: no weather limits on everyday plans."
    else:
        head = "Mostly fine: check your plans below."
    extras = []
    uv = _col(w, "uv_index")
    if uv.max() >= th["uv_tip"]:
        extras.append(f"UV up to {uv.max():.0f} ({'extreme' if uv.max() >= 11 else 'very high'}) {windows(uv >= th['uv_tip'], hours)[0]}: "
                      "hat, shade and sunscreen; sunburn can start within 15 minutes.")
    if "pm2_5" in w and np.nanmax(w["pm2_5"].to_numpy(dtype=float), initial=0) >= th["pm25_caution_ug_m3"]:
        extras.append(f"Air quality: PM2.5 up to {np.nanmax(w['pm2_5']):.0f} µg/m³. People with asthma or heart conditions should limit time near busy roads.")
    if _col(w, "rain_prev24").max() >= th["flood_prev3h_mm"]:
        extras.append(f"About {_col(w, 'rain_prev24').max():.0f} mm of rain in the last 24 h: drains and low-lying areas may still be flooded.")
    return dict(headline=head, hours=f"{h0:02d}:00-{h1:02d}:00", groups=GROUPS, rows=rows, extras=extras)
