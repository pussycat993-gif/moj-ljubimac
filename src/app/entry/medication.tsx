import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { toISODate } from '@/lib/dates';
import { scheduleAt } from '@/lib/notifications';
import { useActivePet, useApp } from '@/lib/store';

export default function MedicationEntry() {
  const t = useTheme();
  const router = useRouter();
  const pet = useActivePet();
  const addMedication = useApp((s) => s.addMedication);

  const [name, setName] = useState('');
  const [dose, setDose] = useState('');
  const [interval, setInterval] = useState('');
  const [lastGiven, setLastGiven] = useState(new Date());

  const save = async () => {
    if (!pet || !name.trim()) {
      Alert.alert('Naziv je obavezan', 'Unesi naziv leka, npr. Bravecto.');
      return;
    }
    const intervalDays = interval.trim() ? Number(interval) : undefined;
    if (interval.trim() && (!Number.isInteger(intervalDays) || intervalDays! <= 0)) {
      Alert.alert('Proveri interval', 'Interval je ceo broj dana, npr. 84.');
      return;
    }

    let notifId: string | undefined;
    if (intervalDays) {
      const next = new Date(lastGiven);
      next.setDate(next.getDate() + intervalDays);
      next.setHours(9, 0, 0, 0);
      notifId =
        (await scheduleAt(next, `${pet.name}: vreme za lek`, `${name.trim()} — sledeća doza danas.`)) ??
        undefined;
    }

    addMedication({
      petId: pet.id,
      name: name.trim(),
      dose: dose.trim() || undefined,
      intervalDays,
      lastGivenISO: toISODate(lastGiven),
      active: true,
      notifId,
    });
    router.back();
  };

  return (
    <ModalScreen>
      <Field label="Naziv leka *" value={name} onChangeText={setName} placeholder="npr. Bravecto 1000 mg" autoFocus />
      <Field label="Doza" value={dose} onChangeText={setDose} placeholder="npr. 1 tableta" />
      <Field
        label="Ponavljanje (dana)"
        value={interval}
        onChangeText={setInterval}
        keyboardType="number-pad"
        placeholder="npr. 84 — ostavi prazno za jednokratno"
      />
      <DateField label="Poslednja doza" value={lastGiven} onChange={setLastGiven} />
      <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 12 }}>
        Ako uneseš interval, notifikacija za sledeću dozu se zakazuje automatski.
      </Text>
      <Btn label="Sačuvaj terapiju" onPress={save} />
    </ModalScreen>
  );
}
