import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { Btn, Field, ModalScreen } from '@/components/ui';
import { useActivePet, useApp, usePetFood } from '@/lib/store';

export default function FoodEntry() {
  const router = useRouter();
  const pet = useActivePet();
  const food = usePetFood(pet?.id);
  const setFoodProfile = useApp((s) => s.setFoodProfile);

  const [brand, setBrand] = useState(food?.brand ?? '');
  const [grams, setGrams] = useState(food?.dailyGrams ? String(food.dailyGrams) : '');
  const [notes, setNotes] = useState(food?.notes ?? '');

  const save = () => {
    if (!pet) return;
    const dailyGrams = grams.trim() ? Number(grams) : undefined;
    if (grams.trim() && (!Number.isFinite(dailyGrams) || dailyGrams! <= 0)) {
      Alert.alert('Proveri unos', 'Dnevna količina je broj u gramima, npr. 380.');
      return;
    }
    setFoodProfile({
      ...food,
      petId: pet.id,
      brand: brand.trim() || undefined,
      dailyGrams,
      notes: notes.trim() || undefined,
    });
    router.back();
  };

  return (
    <ModalScreen>
      <Field label="Brend hrane" value={brand} onChangeText={setBrand} placeholder="npr. Royal Canin Adult" autoFocus />
      <Field label="Dnevna količina (g)" value={grams} onChangeText={setGrams} keyboardType="number-pad" placeholder="npr. 380" />
      <Field label="Napomene" value={notes} onChangeText={setNotes} placeholder="npr. 2 obroka + poslastice za trening" multiline />
      <Btn label="Sačuvaj ishranu" onPress={save} />
    </ModalScreen>
  );
}
