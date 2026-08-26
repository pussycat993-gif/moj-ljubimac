// Supabase Edge Function: delete-account
//
// ZAŠTO POSTOJI: aplikacija ima samo anon (javni) ključ. Anon ključem korisnik
// NE MOŽE da obriše svoj red u auth.users — za to treba service_role ključ, a
// on nikada ne sme da uđe u aplikaciju. Zato brisanje radi server: telefon
// pošalje svoj token, funkcija proveri koji je to korisnik i obriše ga.
//
// DEPLOY (Supabase CLI):
//   supabase functions deploy delete-account
// NE koristi --no-verify-jwt: provera tokena je ono što sprečava da bilo ko
// obriše bilo čiji nalog.
//
// Promenljive okruženja (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) Supabase
// automatski ubacuje — ne postavljaš ih ručno i ne pišeš ih nigde u kod.
//
// PRAVILO ZA PORODIČNI KARTON:
// - Ako je korisnik jedini član household-a → household se briše (kaskadno
//   odnosi ljubimce i sve zapise).
// - Ako ima još članova → briše se samo njegovo članstvo, a karton ostaje
//   ostatku porodice. Ako je bio „owner", vlasništvo prelazi na najstarijeg
//   preostalog člana.

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// Naziv promenljive se u Supabase-u vremenom menjao — pokrivamo obe varijante.
const SERVICE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SB_SECRET_KEY') ?? '';

/** Bucket za priloge (fotografije/nalazi). Još ne postoji — vidi napomenu ispod. */
const STORAGE_BUCKET = 'prilozi';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface Member {
  user_id: string;
  role: string;
  joined_at: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Dozvoljen je samo POST.' }, 405);

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: 'Funkcija nije podešena (nema service_role ključa).' }, 500);
  }

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ error: 'Nema tokena za prijavu.' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Ko zove? Token se proverava na serveru — klijent ne može da podmetne tuđi ID.
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return json({ error: 'Prijava nije važeća.' }, 401);
  const userId = user.id;

  try {
    // Članstva čitamo PRE brisanja korisnika: brisanjem auth.users red u
    // household_members kaskadno nestaje i informacija se izgubi.
    const { data: memberships, error: memErr } = await admin
      .from('household_members')
      .select('household_id, role')
      .eq('user_id', userId);
    if (memErr) throw memErr;

    let householdsDeleted = 0;
    let householdsLeft = 0;

    for (const m of memberships ?? []) {
      const hid = m.household_id as string;

      const { data: others, error: othersErr } = await admin
        .from('household_members')
        .select('user_id, role, joined_at')
        .eq('household_id', hid)
        .neq('user_id', userId)
        .order('joined_at', { ascending: true });
      if (othersErr) throw othersErr;

      const remaining = (others ?? []) as Member[];

      if (remaining.length === 0) {
        // Poslednji član — briše se ceo household i, kaskadno, svi zapisi.
        await deleteHouseholdFiles(admin, hid);
        const { error: delErr } = await admin.from('households').delete().eq('id', hid);
        if (delErr) throw delErr;
        householdsDeleted += 1;
      } else {
        // Porodica ostaje: prenesi vlasništvo ako je ovaj korisnik bio owner.
        if (m.role === 'owner') {
          const heir = remaining[0];
          const { error: promoteErr } = await admin
            .from('household_members')
            .update({ role: 'owner' })
            .eq('household_id', hid)
            .eq('user_id', heir.user_id);
          if (promoteErr) throw promoteErr;
        }
        const { error: leaveErr } = await admin
          .from('household_members')
          .delete()
          .eq('household_id', hid)
          .eq('user_id', userId);
        if (leaveErr) throw leaveErr;
        householdsLeft += 1;
      }
    }

    // Tek na kraju sam korisnik (hard delete, ne soft).
    const { error: authErr } = await admin.auth.admin.deleteUser(userId, false);
    if (authErr) throw authErr;

    return json({ ok: true, householdsDeleted, householdsLeft });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('delete-account:', msg);
    return json({ error: `Brisanje na serveru nije uspelo: ${msg}` }, 500);
  }
});

/**
 * Briše priloge household-a iz Storage-a.
 *
 * NAPOMENA: fotografije i nalazi su za sada SAMO na telefonu (Storage još nije
 * uveden — vidi „Fotografije/prilozi se ne sinhronizuju" u planu). Kada dodaš
 * bucket, ovo počinje da radi bez ikakve izmene. Do tada tiho ne radi ništa.
 */
async function deleteHouseholdFiles(
  admin: ReturnType<typeof createClient>,
  householdId: string
): Promise<void> {
  try {
    const prefix = `household/${householdId}`;
    const { data: files, error } = await admin.storage.from(STORAGE_BUCKET).list(prefix, {
      limit: 1000,
    });
    if (error || !files?.length) return;
    await admin.storage
      .from(STORAGE_BUCKET)
      .remove(files.map((f: { name: string }) => `${prefix}/${f.name}`));
  } catch {
    // Bucket ne postoji (očekivano dok Storage nije uveden) — brisanje naloga
    // ne sme da padne zbog toga.
  }
}
