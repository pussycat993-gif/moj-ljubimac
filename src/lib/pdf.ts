import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { ageString, formatDateShort } from './dates';
import { THEMES } from './theme';
import type {
  Checkup,
  FoodProfile,
  Medication,
  Pet,
  StoolEntry,
  Vaccination,
  WeightEntry,
} from './types';
import { SPECIES_LABEL, STOOL_LABEL } from './types';

export interface KartonData {
  pet: Pet;
  weights: WeightEntry[];
  vaccinations: Vaccination[];
  medications: Medication[];
  checkups: Checkup[];
  food?: FoodProfile;
  stools: StoolEntry[];
}

/** HTML se pravi ručno, pa svaki korisnički unos mora kroz escape. */
function esc(value: string | undefined): string {
  return (value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '<p class="empty">Nema zapisa.</p>';
  return `<table>
    <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
    ${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}
  </table>`;
}

export function buildKartonHtml(d: KartonData): string {
  const t = THEMES[d.pet.sex];
  const lastWeight = d.weights[d.weights.length - 1];

  const weightRows = [...d.weights]
    .reverse()
    .slice(0, 12)
    .map((w) => [formatDateShort(w.dateISO), `${w.kg.toFixed(1).replace('.', ',')} kg`]);

  const vaxRows = d.vaccinations.map((v) => [
    esc(v.name),
    formatDateShort(v.dateISO),
    v.validUntilISO ? formatDateShort(v.validUntilISO) : '—',
    esc(v.clinic) || '—',
  ]);

  const medRows = d.medications.map((m) => [
    esc(m.name),
    esc(m.dose) || '—',
    m.intervalDays ? `na ${m.intervalDays} dana` : 'jednokratno',
    m.active ? 'aktivno' : 'završeno',
  ]);

  const chkRows = d.checkups.map((c) => [
    formatDateShort(c.dateISO),
    esc(c.title),
    esc(c.vet) || '—',
    esc(c.notes) || '—',
  ]);

  const recentStools = d.stools.slice(0, 10);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body { font-family: -apple-system, Roboto, sans-serif; color: #2B1E22; margin: 28px; font-size: 13px; }
    .brand { color: #5C3A21; font-weight: 800; letter-spacing: .5px; font-size: 13px; }
    h1 { font-size: 24px; margin: 4px 0 2px; color: ${t.accentDeep}; }
    .sub { color: #777; margin: 0 0 6px; }
    h2 { font-size: 15px; margin: 22px 0 6px; color: ${t.accentDeep};
         border-bottom: 2px solid ${t.accentSoft}; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .4px;
         color: #888; padding: 6px 8px; border-bottom: 1px solid #ddd; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
    .empty { color: #999; font-style: italic; }
    .kpis { display: flex; gap: 24px; margin-top: 8px; }
    .kpis div { background: ${t.accentSoft}; border-radius: 10px; padding: 10px 16px; }
    .kpis b { display: block; font-size: 16px; }
    .foot { margin-top: 30px; color: #999; font-size: 11px; }
  </style></head><body>
    <div class="brand">🐾 MOJ LJUBIMAC — zdravstveni karton</div>
    <h1>${esc(d.pet.name)}</h1>
    <p class="sub">
      ${SPECIES_LABEL[d.pet.species]}${d.pet.breed ? ` · ${esc(d.pet.breed)}` : ''} ·
      ${d.pet.sex === 'f' ? 'ženka' : 'mužjak'}${d.pet.neutered ? ' (sterilisan/a)' : ''} ·
      rođen${d.pet.sex === 'f' ? 'a' : ''} ${formatDateShort(d.pet.dob)} (${ageString(d.pet.dob)})
      ${d.pet.microchip ? ` · mikročip ${esc(d.pet.microchip)}` : ''}
    </p>
    <div class="kpis">
      <div><b>${lastWeight ? `${lastWeight.kg.toFixed(1).replace('.', ',')} kg` : '—'}</b>poslednja težina</div>
      <div><b>${d.vaccinations.length}</b>vakcinacija</div>
      <div><b>${d.checkups.length}</b>pregleda</div>
    </div>

    <h2>Vakcinacije</h2>
    ${table(['Vakcina', 'Primljena', 'Važi do', 'Klinika'], vaxRows)}

    <h2>Terapije i lekovi</h2>
    ${table(['Lek', 'Doza', 'Ponavljanje', 'Status'], medRows)}

    <h2>Veterinarski pregledi</h2>
    ${table(['Datum', 'Pregled', 'Veterinar', 'Napomene'], chkRows)}

    <h2>Težina (poslednjih 12 merenja)</h2>
    ${table(['Datum', 'Težina'], weightRows)}

    <h2>Ishrana</h2>
    ${
      d.food?.brand || d.food?.dailyGrams
        ? `<p>${esc(d.food?.brand) || 'Brend nije unet'}${
            d.food?.dailyGrams ? ` · ${d.food.dailyGrams} g dnevno` : ''
          }${d.food?.notes ? ` · ${esc(d.food.notes)}` : ''}</p>`
        : '<p class="empty">Nema podataka o ishrani.</p>'
    }
    ${
      recentStools.length > 0
        ? `<p>Poslednje stolice: ${recentStools
            .map((s) => `${formatDateShort(s.dateISO)} (${STOOL_LABEL[s.quality]})`)
            .join(', ')}</p>`
        : ''
    }

    <p class="foot">Generisano ${formatDateShort(new Date().toISOString())} u aplikaciji Moj Ljubimac.
    Dokument je informativan i ne zamenjuje veterinarsku dokumentaciju.</p>
  </body></html>`;
}

/** Pravi PDF iz kartona i otvara sistemski „share" (sačuvaj, pošalji veterinaru…). */
export async function exportKartonPdf(data: KartonData): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: buildKartonHtml(data) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Karton — ${data.pet.name}`,
      UTI: 'com.adobe.pdf',
    });
  }
}
