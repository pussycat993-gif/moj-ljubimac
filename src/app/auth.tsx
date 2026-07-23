import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Text } from 'react-native';

import { Btn, Field, ModalScreen, Segmented } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { signIn, signUp } from '@/lib/supabase';
import { startSync } from '@/lib/sync';

export default function AuthScreen() {
  const t = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    if (!email.trim() || password.length < 6) {
      Alert.alert('Proveri podatke', 'Unesi email i lozinku (najmanje 6 karaktera).');
      return;
    }
    setBusy(true);
    const res = mode === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);

    if (!res.ok) {
      Alert.alert('Greška', res.error ?? 'Pokušaj ponovo.');
      return;
    }
    if (mode === 'up') {
      Alert.alert(
        'Skoro gotovo',
        'Ako je uključena potvrda email-a, otvori link iz poruke pa se prijavi.'
      );
      setMode('in');
      return;
    }
    await startSync();
    router.back();
  };

  return (
    <ModalScreen>
      <Segmented
        options={[
          { key: 'in', label: 'Prijava' },
          { key: 'up', label: 'Registracija' },
        ]}
        value={mode}
        onChange={(k) => setMode(k as 'in' | 'up')}
      />
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        placeholder="ti@primer.com"
      />
      <Field
        label="Lozinka"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="najmanje 6 karaktera"
      />
      <Btn
        label={busy ? 'Sačekaj…' : mode === 'in' ? 'Prijavi se' : 'Napravi nalog'}
        onPress={submit}
      />
      <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 12, lineHeight: 18 }}>
        Nalogom se zdravstveni karton sinhronizuje i deli sa ukućanima — prijavi se istim nalogom na drugom telefonu.
      </Text>
    </ModalScreen>
  );
}
