// One-off: geocode the seat of every municipality and city in Serbia through
// OpenStreetMap Nominatim and write supabase/seed/cities.sql (TC ADR-11).
// Run once with `node scripts/fetch-cities.mjs`; the output is committed.
//
// List: the local self-government units of the RZS register of territorial
// units (Zakon o teritorijalnoj organizaciji Republike Srbije), without the
// municipalities of Kosovo and Metohija — 117 municipalities and 28 cities
// (including Beograd). One entry per city: city municipalities such as Zemun
// or Petrovaradin are not listed separately (owner decision, 2026-10-19).
//
// Nominatim usage policy: at most 1 request per second and an identifying
// User-Agent (API Contract §9.4).

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const USER_AGENT =
  "moj-ljubimac-cities-seed/1.0 (+https://github.com/pussycat993-gif/moj-ljubimac)";
const OUTPUT = fileURLToPath(new URL("../supabase/seed/cities.sql", import.meta.url));

// Serbian Latin name; English name only where it differs.
const SEATS = [
  // Cities (gradovi)
  "Beograd|Belgrade", "Bor", "Valjevo", "Vranje", "Vršac", "Zaječar", "Zrenjanin",
  "Jagodina", "Kikinda", "Kragujevac", "Kraljevo", "Kruševac", "Leskovac",
  "Loznica", "Niš", "Novi Pazar", "Novi Sad", "Pančevo", "Pirot", "Požarevac",
  "Prokuplje", "Smederevo", "Sombor", "Sremska Mitrovica", "Subotica", "Užice",
  "Čačak", "Šabac",
  // Municipalities (opštine)
  "Ada", "Aleksandrovac", "Aleksinac", "Alibunar", "Apatin", "Aranđelovac",
  "Arilje", "Babušnica", "Bajina Bašta", "Batočina", "Bač", "Bačka Palanka",
  "Bačka Topola", "Bački Petrovac", "Bela Palanka", "Bela Crkva", "Beočin",
  "Bečej", "Blace", "Bogatić", "Bojnik", "Boljevac", "Bosilegrad", "Brus",
  "Bujanovac", "Varvarin", "Velika Plana", "Veliko Gradište", "Vladimirci",
  "Vladičin Han", "Vlasotince", "Vrbas", "Vrnjačka Banja", "Gadžin Han",
  "Golubac", "Gornji Milanovac", "Despotovac", "Dimitrovgrad", "Doljevac",
  "Žabalj", "Žabari", "Žagubica", "Žitište", "Žitorađa", "Ivanjica", "Inđija",
  "Irig", "Kanjiža", "Kladovo", "Knić", "Knjaževac", "Kovačica", "Kovin",
  "Kosjerić", "Koceljeva", "Krupanj", "Kula", "Kuršumlija", "Kučevo", "Lajkovac",
  "Lapovo", "Lebane", "Lučani", "Ljig", "Ljubovija", "Majdanpek", "Mali Zvornik",
  "Mali Iđoš", "Malo Crniće", "Medveđa", "Merošina", "Mionica", "Negotin",
  "Nova Varoš", "Nova Crnja", "Novi Bečej", "Novi Kneževac", "Odžaci", "Opovo",
  "Osečina", "Paraćin", "Petrovac na Mlavi", "Pećinci", "Plandište", "Požega",
  "Preševo", "Priboj", "Prijepolje", "Ražanj", "Raška", "Rača", "Rekovac", "Ruma",
  "Svilajnac", "Svrljig", "Senta", "Sečanj", "Sjenica", "Smederevska Palanka",
  "Sokobanja", "Srbobran", "Sremski Karlovci", "Stara Pazova", "Surdulica",
  "Temerin", "Titel", "Topola", "Trgovište", "Trstenik", "Tutin", "Ub", "Ćićevac",
  "Ćuprija", "Crna Trava", "Čajetina", "Čoka", "Šid",
];

// Mainland Serbia without Kosovo and Metohija, roughly; anything outside is a
// wrong match.
const BOUNDS = { minLat: 42.2, maxLat: 46.2, minLon: 18.8, maxLon: 23.1 };
const PLACE_TYPES = new Set(["city", "town", "village", "suburb"]);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function geocode(name) {
  const params = new URLSearchParams({
    city: name,
    countrycodes: "rs",
    format: "jsonv2",
    limit: "10",
    "accept-language": "sr-Latn",
  });
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const results = await res.json();
  const inBounds = results.filter((r) => {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    return (
      lat >= BOUNDS.minLat && lat <= BOUNDS.maxLat && lon >= BOUNDS.minLon && lon <= BOUNDS.maxLon
    );
  });
  // Several seats share their name with villages elsewhere (Rača, Žabari,
  // Boljevac, Trgovište): keep only results inside the seat's own unit.
  const ownUnit = inBounds.filter((r) =>
    [`Opština ${name},`, `Grad ${name},`].some((unit) => r.display_name.includes(unit)),
  );
  const match =
    ownUnit.find((r) => r.category === "place" && PLACE_TYPES.has(r.type)) ??
    ownUnit.find((r) => r.category === "boundary");
  if (!match) throw new Error(`${name}: no place result`);
  return { lat: Number(match.lat), lon: Number(match.lon), label: match.display_name };
}

const sqlText = (value) => `'${value.replaceAll("'", "''")}'`;

const rows = [];
for (const entry of SEATS) {
  const [nameSr, nameEn = nameSr] = entry.split("|");
  const { lat, lon, label } = await geocode(nameSr);
  console.log(`${nameSr} → ${lat.toFixed(5)}, ${lon.toFixed(5)} (${label})`);
  rows.push(`  (${sqlText(nameSr)}, ${sqlText(nameEn)}, ${lat.toFixed(6)}, ${lon.toFixed(6)})`);
  await sleep(1100);
}

const header = `-- Cities seed (TC ADR-11): the seat of every municipality and city in Serbia.
-- Source of the list: RZS register of territorial units (Zakon o teritorijalnoj
-- organizaciji Republike Srbije) without Kosovo and Metohija — 117 municipalities
-- and 28 cities, one entry per city (no separate city municipalities).
-- Coordinates: OpenStreetMap Nominatim (© OpenStreetMap contributors, ODbL),
-- fetched ${new Date().toISOString().slice(0, 10)} by scripts/fetch-cities.mjs. Do not edit by hand.
-- ${rows.length} entries.
`;

const sql = `${header}
insert into public.cities (name_sr, name_en, latitude, longitude) values
${rows.join(",\n")};
`;

await writeFile(OUTPUT, sql, "utf8");
console.log(`Wrote ${rows.length} cities to ${OUTPUT}`);
