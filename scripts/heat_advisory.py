"""Public heat advisory: one level for the day (Low to Extreme), the hours it applies, and what to do, for outdoor
workers and boda riders, market vendors, schools and children, and older people.

Used by scripts/29_site_weather.py, from the hourly WBGT in the sun that derive() already computes (the same heat
stress number the construction work-rest advice uses). Pure functions, no network: tests in tests/test_heat_advisory.py.
Levels come from thresholds.json -> "heat_advisory". This is advice from a forecast, not an official warning: those
come from the national weather service (in Uganda, UNMA) and the health ministry.
"""
import numpy as np

NAMES = ["Low", "Moderate", "High", "Very high", "Extreme"]

# what to do, by level (index into NAMES); level 0 is a normal day
ADVICE = {
    "workers": ("Outdoor workers and boda riders", [
        "A normal day: drink water through the day.",
        "Drink a cup of water every 20 to 30 minutes, and rest in the shade when you can around midday.",
        "Take a 15-minute shade break every hour during these hours, and drink water every 20 minutes even if you are not thirsty.",
        "Do heavy work early or late. In these hours, rest in the shade as long as you work, and drink water every 15 to 20 minutes.",
        "Stop heavy work in the sun during these hours. Keep to shade, and drink water every 15 minutes.",
    ]),
    "vendors": ("Market vendors", [
        "Keep water at your stall.",
        "Shade your stall and your goods; keep drinking water through the afternoon.",
        "Put up shade before midday, keep water at hand, and keep fresh food out of the sun.",
        "Work under shade only, take turns resting somewhere cooler, and keep fresh food covered and shaded.",
        "Close or move into the shade during these hours if you can; heat illness can come on quickly.",
    ]),
    "children": ("Schools and children", [
        "Normal outdoor play.",
        "Breaks in the shade at midday; make sure children drink water.",
        "No sports, parades or assemblies in the sun during these hours; water and shade for every child.",
        "Keep children indoors or in deep shade during these hours, and check on them often.",
        "Keep children indoors during these hours. Cancel outdoor activities.",
    ]),
    "elderly": ("Older people, pregnant women and the sick", [
        "A normal day.",
        "Drink water regularly and rest in the shade in the afternoon.",
        "Stay in the shade or a cool, airy room during these hours. Check on older neighbours and anyone who is unwell.",
        "Stay out of the sun during these hours, drink water often, and check on older people twice a day.",
        "Stay indoors in the coolest room during these hours. Check on older and sick people often; get medical help early if they feel unwell.",
    ]),
}


def windows(mask, hours):
    """Contiguous True runs as ['12-15 h', ...] (hour labels are the start of each hour)."""
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


def level_of(wbgt, bounds):
    """0 Low ... 4 Extreme: how many of the four lower bounds (Moderate, High, Very high, Extreme) the value reaches."""
    return np.searchsorted(np.asarray(bounds, dtype=float), np.asarray(wbgt, dtype=float), side="right")


def day(g, th):
    """The advisory for one day: `g` is that day's hourly frame from derive() (needs wbgt_sun)."""
    h0, h1 = th["hours"]
    w = g[(g.index.hour >= h0) & (g.index.hour < h1)]
    hours = list(w.index.hour)
    wb = w["wbgt_sun"].to_numpy(dtype=float)
    lv = level_of(wb, th["wbgt_from_C"]) if len(wb) else np.array([], int)
    top = int(lv.max()) if len(lv) else 0
    peak = int(np.argmax(wb)) if len(wb) else 0
    risky = windows(lv >= 1, hours)                          # hours with any heat to plan around
    worst = windows(lv == top, hours) if top >= 1 else []
    # from the first to the last hour at the day's level (two stretches read as one span: plan for the whole afternoon)
    when = f"{worst[0][:2]}:00 to {worst[-1][3:5]}:00" if worst else ""
    if top == 0:
        head = "Low heat stress today: a normal day. Drink water and use shade at midday."
    elif top == 1:
        head = f"Moderate heat {when}: drink water often and rest in the shade at midday."
    elif top == 2:
        head = f"High heat {when}: take shade breaks, drink water often, and check on older people and young children."
    elif top == 3:
        head = f"Very high heat {when}: avoid hard work in the sun, keep children in the shade, check on older people."
    else:
        head = f"Extreme heat {when}: stop heavy work in the sun, keep children and older people indoors and cool."
    return dict(
        level=top, name=NAMES[top], headline=head,
        peak_wbgt=round(float(wb[peak]), 1) if len(wb) else None, peak_hour=int(hours[peak]) if len(hours) else None,
        window=", ".join(worst), risk_hours=", ".join(risky),
        hours=[[int(h), int(v)] for h, v in zip(hours, lv)],
        advice=[dict(key=k, who=who, text=texts[top]) for k, (who, texts) in ADVICE.items()],
    )
