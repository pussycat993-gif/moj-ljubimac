import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { DateField } from '@/components/date-field';
import { Btn, Field, ModalScreen } from '@/components/ui';
import { toISODate } from '@/lib/dates';
import { useActivePet, useApp } from '@/lib/store';

export default function WeightEntry() {
  const router = useRouter();
  const pet = useActivePet();
  const addWeight = useApp((s) => s.addWeight);
  const [kg, setKg] = useState('');
  const [date, setDate] = useState(new Date());

  const save = () => {
    const value = Number(kg.replace(',', '.'));
    if (!pet || !Number.isFinite(value) || value <= 0 || value > 200) {
      Alert.alert('Proveri unos', 'Unesi težinu u kilogramima, npr. 28,4.');
      return;
    }
    addWeight(pet.id, Math.round(value * 10) / 10, toISODate(date));
    router.back();
  };

  return (
    <ModalScreen>
      <Field
        label="Težina (kg)"
        value={kg}
        onChangeText={setKg}
        keyboardType="decimal-pad"
        placeholder="npr. 28,4"
        autoFocus
      />
      <DateField label="Datum merenja" value={date} onChange={setDate} />
      <Btn label="Sačuvaj merenje" onPress={save} />
    </ModalScreen>
  );
}
