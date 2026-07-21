import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { scheduleAt } from '@/lib/notifications';
import { useActivePet, useApp } from '@/lib/store';

export default function ReminderEntry() {
  const t = useTheme();
  const router = useRouter();
  const pet = useActivePet();
  const addReminder = useApp((s) => s.addReminder);

  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(9, 0, 0, 0);
    return d;
  });

  const save = async () => {
    if (!pet || !title.trim()) {
      Alert.alert('Naslov je obavezan', 'npr. „Kontrola kod veterinara"');
      return;
    }
    if (when.getTime() <= Date.now()) {
      Alert.alert('Proveri vreme', 'Podsetnik mora biti u budućnosti.');
      return;
    }
    const notifId =
      (await scheduleAt(when, `${pet.name}: podsetnik`, title.trim())) ?? undefined;
    addReminder({ petId: pet.id, title: title.trim(), dateISO: when.toISOString(), notifId });
    router.back();
  };

  return (
    <ModalScreen>
      <Field label="Podsetnik *" value={title} onChangeText={setTitle} placeholder="npr. Kontrola kod veterinara" autoFocus />
      <DateField label="Datum i vreme" value={when} onChange={setWhen} withTime />
      <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 12 }}>
        Notifikacija stiže tačno u izabrano vreme. Na početnoj: dodir na podsetnik ga označava kao završen.
      </Text>
      <Btn label="Sačuvaj podsetnik" onPress={save} />
    </ModalScreen>
  );
}
