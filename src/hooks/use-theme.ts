import { useActivePet } from '@/lib/store';
import { THEMES, type Theme } from '@/lib/theme';

/** Tema prati pol aktivnog ljubimca — promena ljubimca menja celu paletu aplikacije. */
export function useTheme(): Theme {
  const pet = useActivePet();
  return THEMES[pet?.sex ?? 'f'];
}
