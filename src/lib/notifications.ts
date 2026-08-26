import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { nextBirthday } from './dates';
import type { Pet } from './types';

/** Kako se notifikacija ponaša dok je app u prvom planu. */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let channelReady = false;

async function ensureAndroidChannel() {
  if (channelReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('podsetnici', {
    name: 'Podsetnici',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
  channelReady = true;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.granted;
  } catch {
    return false;
  }
}

/** Zakazuje jednokratnu notifikaciju. Vraća ID ili null ako je datum u prošlosti / nema dozvole. */
export async function scheduleAt(date: Date, title: string, body: string): Promise<string | null> {
  if (date.getTime() <= Date.now()) return null;
  const granted = await ensureNotificationPermission();
  if (!granted) return null;
  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: Platform.OS === 'android' ? 'podsetnici' : undefined,
      },
    });
  } catch {
    return null;
  }
}

export async function cancelScheduled(id?: string) {
  if (!id) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // notifikacija je možda već isporučena — ignorišemo
  }
}

/**
 * Otkazuje SVE zakazane notifikacije ovog uređaja.
 * Koristi se pri brisanju naloga/podataka — inače bi podsetnici za obrisane
 * ljubimce nastavili da zvone i posle brisanja.
 */
export async function cancelAllScheduled(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch {
    // nema dozvole ili nema zakazanih — nije greška
  }
}

/** Zakazuje čestitku za sledeći rođendan ljubimca (09:00). */
export async function scheduleBirthday(pet: Pick<Pet, 'name' | 'dob'>): Promise<string | null> {
  const when = nextBirthday(pet.dob);
  return scheduleAt(when, `Srećan rođendan, ${pet.name}! 🎂`, 'Dodaj rođendanski trenutak i podeli ga sa porodicom.');
}
