// Plain-language meanings of the terms the atlas and the site-weather pages use. <Term id="..."> shows one in
// place; the atlas page lists them all at the bottom. Keep each `short` to one or two sentences.

export interface GlossaryEntry {
  term: string;
  short: string;
}

export const GLOSSARY = {
  lst: { term: "Land surface temperature (LST)", short: "How hot the ground, roofs and roads are, measured by satellite. On a sunny afternoon surfaces are much hotter than the air, so these numbers are not the temperature you feel." },
  anomaly: { term: "Above or below the city average", short: "How much hotter or cooler a place is than the average of all land in the study area at the same time. It lets places be compared fairly across different days and years." },
  thermal: { term: "Thermal classes", short: "Five groups from very cool to hot, set by how far a place's surface temperature is from the city average." },
  epoch: { term: "Epoch", short: "One of the three snapshots the atlas compares (2017, 2021 and 2025), each built from the dry seasons of three years around that date." },
  lcz: { term: "Local Climate Zone (LCZ)", short: "A standard way to sort places by how they are built and covered: for example compact low-rise (packed one- and two-storey buildings), open low-rise, dense trees. Each type tends to have its own climate." },
  builtup: { term: "Built-up land", short: "Ground covered mostly by buildings, roads and paving. 'Dense' means packed buildings; 'sparse' means buildings with gardens or open plots between them." },
  informal: { term: "Informal-type housing", short: "Areas of small, tightly packed, low buildings. The atlas finds them from building size and spacing, so it describes how a place is built, not who owns it or its legal status." },
  canopy: { term: "Tree canopy", short: "The share of the ground covered by tree crowns when seen from above." },
  priority: { term: "Tree-planting priority", short: "Where new trees would do most good: hot places, where many people live, with too few trees and open ground to plant on." },
  kappa: { term: "Kappa", short: "A score from 0 to 1 for how well a map agrees with reference labels, after allowing for agreement by chance. Around 0.8 is good." },
  agreement: { term: "Label agreement", short: "How often the land-cover map gives the same answer as the labels it was trained with, on samples it did not see. It is not yet a check against what is really on the ground." },
  validation: { term: "Validation points", short: "Places checked by eye on high-resolution images, used to measure how accurate a map really is." },
  r: { term: "Correlation (r)", short: "How closely two sets of numbers move together, from 0 (not at all) to 1 (perfectly)." },
  r2: { term: "R²", short: "The share of the differences in one thing that a model explains: 0.32 means about a third." },
  c2st: { term: "Standard product", short: "The surface temperature that the Landsat programme publishes itself. It has gaps under cloud; the atlas fills them and checks itself against it." },
  gwp: { term: "GWp, kWp", short: "The size of solar panels: the power they give in full sun. A typical home system is a few kWp; 1 GWp is a million kWp." },
  twh: { term: "TWh, GWh, kWh", short: "Amounts of electricity. A kWh runs a fridge for about a day; 1 GWh is a million kWh and 1 TWh a billion." },
  yield: { term: "Yield (kWh per kWp)", short: "How much electricity each kWp of panels gives in a year at this location." },
  wbgt: { term: "WBGT (heat stress)", short: "Wet-bulb globe temperature: one number for how hard heat is on the body, combining air temperature, humidity, sun and wind. Above about 28 °C, hard work in the sun needs rest breaks." },
  landsat: { term: "Landsat, Sentinel-2", short: "Earth-observation satellites (USA and Europe). Landsat measures surface heat; Sentinel-2 sees land cover in detail." },
  era5: { term: "ERA5-Land", short: "A reconstruction of past weather for every hour since 1950, made by the European weather centre (ECMWF). The atlas uses it for wind and sunshine." },
  breeze: { term: "Lake breeze", short: "Daytime wind from Lake Victoria, which lies south of Kampala: the land warms faster than the water and draws cooler lake air inland." },
  morphology: { term: "Building morphology", short: "The shape of a neighbourhood: how big buildings are, how close together, how tall." },
  geotiff: { term: "GeoTIFF", short: "A map image whose pixels hold numbers and know where on Earth they are. Mapping software such as QGIS opens it." },
} satisfies Record<string, GlossaryEntry>;

export type TermId = keyof typeof GLOSSARY;
