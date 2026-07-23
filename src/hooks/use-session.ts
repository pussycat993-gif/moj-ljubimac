import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';

import { getSession, onAuthStateChange } from '@/lib/supabase';

/** Trenutna Supabase sesija (null ako nije prijavljen ili cloud nije podešen). */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let ignore = false;
    getSession().then((s) => {
      if (!ignore) setSession(s);
    });
    const unsub = onAuthStateChange((s) => setSession(s));
    return () => {
      ignore = true;
      unsub();
    };
  }, []);

  return session;
}
