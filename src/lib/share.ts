import * as Sharing from 'expo-sharing';
import { Linking, Share } from 'react-native';

import { formatDate } from './dates';
import type { Milestone } from './types';

function milestoneMessage(m: Milestone, petName: string): string {
  const desc = m.description ? `\n${m.description}` : '';
  return `🐾 ${petName}: ${m.title}${desc}\n${formatDate(m.dateISO)} · Moj Ljubimac`;
}

/**
 * Sistemski „share sheet" — pokriva Facebook, Instagram, Messenger i sve ostale
 * instalirane aplikacije, i to je jedini način koji obe prodavnice uvek dozvoljavaju.
 * Ako trenutak ima fotografiju, delimo fotografiju (Instagram story je prihvata),
 * inače delimo tekst.
 */
export async function shareMilestone(m: Milestone, petName: string) {
  const message = milestoneMessage(m, petName);
  if (m.photoUri && (await Sharing.isAvailableAsync())) {
    await Sharing.shareAsync(m.photoUri, { dialogTitle: message });
    return;
  }
  await Share.share({ message });
}

/** Direktno otvaranje WhatsApp/Viber sa porukom; ako aplikacija nije instalirana, pada na sistemski share. */
export async function shareViaApp(app: 'whatsapp' | 'viber', m: Milestone, petName: string) {
  const message = milestoneMessage(m, petName);
  const url =
    app === 'whatsapp'
      ? `whatsapp://send?text=${encodeURIComponent(message)}`
      : `viber://forward?text=${encodeURIComponent(message)}`;
  try {
    await Linking.openURL(url);
  } catch {
    await Share.share({ message });
  }
}
