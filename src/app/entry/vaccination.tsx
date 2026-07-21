import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { toISODate } from '@/lib/dates';
import { scheduleAt } from '@/lib/notifications';
import { useActivePet, useApp } from '@/lib/store';

export default function VaccinationEntry() {
  const t = useTheme();
  const router = useRouter();
  const pet = useActivePet();
  const addVaccination = useApp((s) => s.addVaccination);
  const addReminder = useApp((s) => s.addReminder);

  const [name, setName] = useState('');
  const [clinic, setClinic] = useState('');
  const [date, setDate] = useState(new Date());
  const [hasExpiry, setHasExpiry] = useState(true);
  const [validUntil, setValidUntil] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d;
  });

  const save = async () => {
    if (!pet || !name.trim()) {
      Alert.alert('Naziv je obavezan', 'Unesi naziv vakcine, npr. Besnilo.');
      return;
    }
    addVaccination({
      petId: pet.id,
      name: name.trim(),
      dateISO: toISODate(date),
      validUntilISO: hasExpiry ? toISODate(validUntil) : undefined,
      clinic: clinic.trim() || undefined,
    });

    /* Automatski podsetnik 7 dana pre isteka — sa notifikacijom. */
    if (hasExpiry) {
      const remindAt = new Date(validUntil);
      remindAt.setDate(remindAt.getDate() - 7);
      remindAt.setHours(9, 0, 0, 0);
      const notifId =
        (await scheduleAt(
          remindAt,
          `${pet.name}: vakcina uskoro ističe`,
          `${name.trim()} važi do ${toISODate(validUntil)} — zakaži revakcinaciju.`
        )) ?? undefined;
      if (remindAt.getTime() > Date.now()) {
        addReminder({
          petId: pet.id,
          title: `Revakcinacija: ${name.trim()}`,
          dateISO: remindAt.toISOString(),
          notifId,
        });
      }
    }
    router.back();
  };

  return (
    <ModalScreen>
      <Field label="Naziv vakcine *" value={name} onChangeText={setName} placeholder="npr. Besnilo" autoFocus />
      <DateField label="Datum primanja" value={date} onChange={setDate} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        <Text style={{ fontSize: 15, fontWeight: '600', color: t.text }}>Ima rok važenja</Text>
        <Switch value={hasExpiry} onValueChange={setHasExpiry} trackColor={{ true: t.accent }} />
      </View>
      {hasExpiry && <DateField label="Važi do" value={validUntil} onChange={setValidUntil} />}
      <Field label="Klinika" value={clinic} onChangeText={setClinic} placeholder="npr. Vet centar „Lav”" />
      <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 12 }}>
        Ako uneseš rok važenja, podsetnik i notifikacija stižu 7 dana pre isteka.
      </Text>
      <Btn label="Sačuvaj vakcinu" onPress={save} />
    </ModalScreen>
  );
}
