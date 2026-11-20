import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getJson, useLoad } from "../data";
import { cutLengthAt, duration, eveningShare, hoursAt, hoursText, typical, usePower, type PowerData } from "../power/cuts";
import { ESSENTIALS_KW, monthlyBill, PRICES, solarResult, suggestedKwp, unitsForBill, type Building, type Tariffs } from "../power/solar";
import { PlaceSearch } from "./PlaceCard";
import { usePlaces } from "./places";

/** "UGX 93,524", rounded to the thousand from 100,000 up. */
const ugx = (v: number) => `UGX ${(v >= 100000 ? Math.round(v / 1000) * 1000 : Math.round(v)).toLocaleString("en-GB")}`;
const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const DEFAULT_UNITS: Record<Building, number> = { home: 120, business: 600 };
const M2_PER_KWP = 6;      // 21 % modules plus spacing on a roof

/** A slider with its name and current value above it (the label wraps the slider), and an optional note below. */
function Field({ label, value, children, hint }: { label: string; value: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="calc-field">
      <label>
        <span className="calc-label"><span>{label}</span><b>{value}</b></span>
        {children}
      </label>
      {hint && <span className="calc-hint">{hint}</span>}
    </div>
  );
}

/** "What would solar do for my building?": use, panels, battery and power cuts in; bill, payback and cut cover out. */
export function SolarCalculator({ yieldKwhPerKwp }: { yieldKwhPerKwp: number }) {
  const tariffs = useLoad("tariffs", () => getJson<Tariffs>("power/tariffs.json"));
  if (tariffs.state === "loading") return <p className="muted">Loading electricity prices…</p>;
  if (tariffs.state === "error") return <p className="muted">The solar calculator needs this quarter's electricity prices, which could not be loaded ({tariffs.message}).</p>;
  return <Calculator t={tariffs.data} yieldKwhPerKwp={yieldKwhPerKwp} />;
}

function Calculator({ t, yieldKwhPerKwp }: { t: Tariffs; yieldKwhPerKwp: number }) {
  const [who, setWho] = useState<Building>("home");
  const [units, setUnits] = useState(DEFAULT_UNITS.home);
  const [billText, setBillText] = useState<string | null>(null);   // while someone types a bill
  const [cooking, setCooking] = useState(false);
  const [kwpChosen, setKwp] = useState<number | null>(null);        // null: follow the suggestion
  const [battery, setBattery] = useState(0);
  const [cuts, setCuts] = useState(0);
  const [generator, setGenerator] = useState(false);
  const [cutsFrom, setCutsFrom] = useState<string | null>(null);     // where the power-cut hours came from
  const [cutsTouched, setCutsTouched] = useState(false);
  const [where, setWhere] = useState<{ lat: number; lon: number } | null>(null);
  const powerLoad = usePower();
  const power: PowerData | null = powerLoad.state === "ready" ? powerLoad.data : null;
  const halves = (h: number) => Math.min(70, Math.round(h * 2) / 2);
  // start from what utility records say is typical for Kampala, until someone sets their own
  useEffect(() => {
    const t = power ? typical(power) : null;
    if (!t || cutsTouched) return;
    setCuts(halves(t.hoursPerWeek));
    setCutsFrom(`Typical for Kampala, from utility records: about ${hoursText(halves(t.hoursPerWeek))} a week, in cuts of ${duration(t.hoursPerCutMean)}. Change it if yours is different.`);
  }, [power]); // only when the data arrives
  const cutLength = power ? cutLengthAt(power, where) : null;
  const placesLoad = usePlaces();
  const places = placesLoad.state === "ready" ? placesLoad.data.places : [];
  const [panelPrice, setPanelPrice] = useState<number | null>(null);
  const [batteryPrice, setBatteryPrice] = useState(PRICES.batteryPerKwh);

  const suggested = useMemo(() => suggestedKwp(units, who, yieldKwhPerKwp), [units, who, yieldKwhPerKwp]);
  const kwp = kwpChosen ?? suggested;
  const pricePerKwp = panelPrice ?? PRICES.panelsPerKwp[who];
  const r = solarResult({
    who, unitsPerMonth: units, cooking: who === "home" && cooking, kwp, batteryKwh: battery, cutHoursPerWeek: cuts, generator,
    pricePerKwp, pricePerBatteryKwh: batteryPrice, yieldKwhPerKwp,
  }, t);
  const bill = monthlyBill(units, who, t, who === "home" && cooking);

  const switchWho = (w: Building) => {
    setWho(w);
    setUnits(DEFAULT_UNITS[w]);
    setBillText(null);
    setKwp(null);
    setPanelPrice(null);
  };

  return (
    <div className="calc" aria-labelledby="calc-title">
      <div className="calc-head">
        <h3 id="calc-title">What would solar do for your building?</h3>
        <div className="seg" role="group" aria-label="Building">
          {(["home", "business"] as const).map((w) => (
            <button key={w} type="button" aria-pressed={who === w} onClick={() => switchWho(w)}>{w === "home" ? "Home" : "Shop or business"}</button>
          ))}
        </div>
      </div>

      <div className="calc-grid">
        <div className="calc-in">
          <Field label="Electricity use" value={`${n0(units)} units a month`}
            hint={<>One unit is one kWh. Or type your monthly bill:{" "}
              <input className="calc-bill" type="number" inputMode="numeric" min={0} step={1000} aria-label="Monthly electricity bill in UGX"
                value={billText ?? Math.round(bill)}
                onChange={(e) => {
                  setBillText(e.target.value);
                  const b = Number(e.target.value);
                  if (Number.isFinite(b) && b >= 0) setUnits(Math.max(1, unitsForBill(b, who, t, who === "home" && cooking)));
                }}
                onBlur={() => setBillText(null)} /> UGX</>}>
            <input type="range" min={10} max={who === "home" ? 600 : 3000} step={who === "home" ? 5 : 25} value={units}
              onChange={(e) => {
                setUnits(Number(e.target.value));
                setBillText(null);
              }} />
          </Field>
          {who === "home" && (
            <label className="toggle"><input type="checkbox" checked={cooking} onChange={(e) => setCooking(e.target.checked)} /> We are registered for the cooking tariff</label>
          )}
          <Field label="Panels" value={<>{kwp} kWp{kwpChosen === null && <span className="muted"> · suggested</span>}</>}
            hint={<>Needs about {n0(kwp * M2_PER_KWP)} m² of sunny roof.{kwpChosen !== null && <> <button type="button" className="linkbtn" onClick={() => setKwp(null)}>Use the suggested size ({suggested} kWp)</button></>}</>}>
            <input type="range" min={0.5} max={who === "home" ? 10 : 50} step={0.5} value={kwp} onChange={(e) => setKwp(Number(e.target.value))} />
          </Field>
          <Field label="Battery" value={battery === 0 ? "none" : `${battery} kWh`}>
            <input type="range" min={0} max={who === "home" ? 15 : 60} step={0.5} value={battery} onChange={(e) => setBattery(Number(e.target.value))} />
          </Field>
          {power && places.length > 0 && (
            <div className="calc-where">
              <PlaceSearch places={places} title="Where is the building?" hint="Fills in power cuts for that area from utility records"
                onPick={(f) => {
                  const h = hoursAt(power, f);
                  setWhere(f);
                  setCutsTouched(true);
                  if (!h) return;
                  setCuts(halves(h.hours));
                  setCutsFrom(`About ${hoursText(halves(h.hours))} a week: ${h.from}. Change it if yours is different.`);
                }} />
            </div>
          )}
          <Field label="Power cuts" value={cuts === 0 ? "none" : `${hoursText(cuts)} a week`} hint={cutsFrom ?? undefined}>
            <input type="range" min={0} max={70} step={0.5} value={cuts} onChange={(e) => {
              setCuts(Number(e.target.value));
              setCutsTouched(true);
              setCutsFrom(null);
            }} />
          </Field>
          <label className="toggle"><input type="checkbox" checked={generator} onChange={(e) => setGenerator(e.target.checked)} /> We run a generator during cuts</label>
          <details className="calc-prices">
            <summary>Prices used</summary>
            <label>Panels, inverter and fitting, per kWp
              <span><input type="number" min={0} step={50000} value={pricePerKwp} onChange={(e) => setPanelPrice(Math.max(0, Number(e.target.value)))} /> UGX</span>
            </label>
            <label>Battery, per kWh
              <span><input type="number" min={0} step={50000} value={batteryPrice} onChange={(e) => setBatteryPrice(Math.max(0, Number(e.target.value)))} /> UGX</span>
            </label>
            <p className="fine">Defaults are the research assumptions (US$1,100 per kWp for a home, US$750 for a business, US$350 per battery kWh, at 3,700 UGX per US$). Installers' quotes vary a lot: put in yours.</p>
          </details>
        </div>

        <div className="calc-out" aria-live="polite">
          <div className="calc-tiles">
            <div><span className="eyebrow">Saves</span><b>{ugx(r.savingPerMonth)}</b><span>a month on the bill</span></div>
            <div><span className="eyebrow">Pays back in</span><b>{r.paybackYears === null ? "—" : r.paybackYears > 25 ? "25+ years" : `${r.paybackYears.toFixed(r.paybackYears < 10 ? 1 : 0)} years`}</b><span>{r.paybackYears === null ? "savings do not cover upkeep" : `on ${ugx(r.cost)}`}</span></div>
            <div><span className="eyebrow">Covers</span><b>{Math.round(r.coverShare * 100)}%</b><span>of your electricity</span></div>
          </div>
          <ul className="calc-lines">
            <li>The panels make about {n0(r.madePerMonth)} units a month. You would use {n0(r.usedPerMonth)} of them ({Math.round(r.usedShare * 100)}%){r.usedShare < 0.97 && <>; the rest goes unused, because Uganda does not yet pay for power sent back to the grid</>}.</li>
            <li>Your bill goes from about {ugx(r.billBefore)} to {ugx(r.billAfter)} a month, at {t.quarter.replace("-", " ")} prices.{r.lifelineAfter && <> That includes the lifeline price for your first {t.domestic.lifeline.units} units, which you qualify for once your six-month average is {t.domestic.lifeline.max_monthly_average} units a month or less.</>}</li>
            <li>The system costs about {ugx(r.cost)}{battery > 0 && <> (battery {ugx(battery * batteryPrice)}, which usually needs replacing after about 10 years)</>}, plus about {ugx(r.upkeepPerYear)} a year for upkeep.</li>
            {cuts > 0 && battery > 0 && (
              <li className="power">In a power cut the battery runs {who === "home" ? "lights, phones, a fan and the fridge" : "lights, tills, phones and a fridge"} for about {r.cutCoverHours.toFixed(1)} hours: {r.coveredHoursPerWeek >= cuts ? "enough for all" : `about ${n0(r.coveredHoursPerWeek)}`} of your {hoursText(cuts)} of cuts a week{r.coveredHoursPerWeek < cuts && " if it refills from the panels each day"}.{generator && r.fuelSavedPerMonth[0] > 0 && <> That is about {ugx(r.fuelSavedPerMonth[0])} to {ugx(r.fuelSavedPerMonth[1])} of generator fuel a month, counted in the payback.</>}{cutLength !== null && <> A typical cut {where ? "there" : "in Kampala"} lasts {duration(cutLength)}, so this battery {r.cutCoverHours >= cutLength ? "rides out most cuts" : "covers only part of a typical cut"}.</>}</li>
            )}
            {cuts > 0 && power && eveningShare(power) && (() => {
            const e = eveningShare(power)!;
            return <li className="power">Of {e.n} cuts in the atlas's log with a time, {Math.round(e.evening * 100)}% were reported between 6 pm and midnight, when panels make nothing: only a battery keeps the lights on then. (People also complain more in the evening, when they are home.)</li>;
          })()}
          {cuts > 0 && battery === 0 && (
              <li className="power">Without a battery, ordinary grid-connected panels switch off in a power cut, to keep line workers safe. To keep the lights on in cuts you need a battery and a hybrid inverter{cutLength !== null && <>: a cut {where ? "there" : "in Kampala"} typically lasts {duration(cutLength)}, and about {Math.max(0.5, Math.ceil((ESSENTIALS_KW[who] * cutLength) / (0.9 * 0.95) * 2) / 2)} kWh would run {who === "home" ? "lights, phones, a fan and the fridge" : "lights, tills, phones and a fridge"} through it</>}. Try adding one above.</li>
            )}
          </ul>
        </div>
      </div>
      <p className="fine">
        A rough guide, not a quote. Sun from the atlas ({n0(yieldKwhPerKwp)} kWh a year per kWp on Kampala roofs); how much you use is worked out hour by hour for a
        typical {who === "home" ? "home (most use in the evening)" : "business (most use by day)"}, as in the research. Prices: <a href={t.url} target="_blank" rel="noreferrer">ERA</a>, {t.valid}; VAT and fixed charges not included.
      </p>
    </div>
  );
}
