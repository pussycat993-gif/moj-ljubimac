import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Btn, Card, Field, ModalScreen, Row } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { deleteAccount, wipeLocalData } from '@/lib/account';
import { isCloudConfigured } from '@/lib/supabase';

/** Reč koju korisnik mora da napiše — zaštita od slučajnog dodira. */
const CONFIRM_WORD = 'BRIŠEM';

export default function DeleteAccountScreen() {
  const t = useTheme();
  const router = useRouter();
  const session = useSession();
  const cloud = useMemo(() => isCloudConfigured(), []);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  /** Ima nalog na serveru (nije samo lokalna instalacija). */
  const hasAccount = cloud && !!session;
  const confirmed = typed.trim().toUpperCase() === CONFIRM_WORD;

  const perform = async () => {
    setBusy(true);
    const res = hasAccount ? await deleteAccount() : await wipeLocalData();
    setBusy(false);

    if (!res.ok) {
      Alert.alert('Brisanje nije uspelo', res.error ?? 'Pokušaj ponovo.');
      return;
    }
    Alert.alert(
      hasAccount ? 'Nalog je obrisan' : 'Podaci su obrisani',
      hasAccount
        ? 'Nalog i svi podaci su trajno obrisani. Možeš da napraviš novi nalog kad god želiš.'
        : 'Svi podaci su obrisani sa ovog telefona.',
      [{ text: 'U redu', onPress: () => router.replace('/') }]
    );
  };

  const onPressDelete = () => {
    if (busy) return;
    if (!confirmed) {
      Alert.alert('Potvrdi brisanje', `Napiši ${CONFIRM_WORD} u polje ispod da potvrdiš.`);
      return;
    }
    Alert.alert(
      hasAccount ? 'Obrisati nalog?' : 'Obrisati sve podatke?',
      'Ova radnja je trajna. Podaci se ne mogu vratiti.',
      [
        { text: 'Otkaži', style: 'cancel' },
        { text: 'Obriši', style: 'destructive', onPress: () => void perform() },
      ]
    );
  };

  return (
    <ModalScreen>
      <Card style={{ marginTop: 0 }}>
        <Row
          icon="warning"
          title={hasAccount ? 'Brisanje naloga je trajno' : 'Brisanje podataka je trajno'}
          desc="Nema koša za smeće i nema vraćanja. Ako želiš kopiju kartona, prvo ga izvezi u PDF."
        />
      </Card>

      <Text style={{ fontSize: 13, fontWeight: '700', color: t.text, marginTop: 22 }}>
        Šta se briše
      </Text>
      <Card>
        <Row icon="paw" title="Svi ljubimci" desc="Podaci, fotografije i mikročip." />
        <View style={{ height: 12 }} />
        <Row
          icon="medkit"
          title="Ceo zdravstveni karton"
          desc="Težina, vakcine, terapije, pregledi i prilozi."
        />
        <View style={{ height: 12 }} />
        <Row icon="images" title="Trenuci i fotografije" desc="Uključujući kopije fajlova na telefonu." />
        <View style={{ height: 12 }} />
        <Row icon="notifications-off" title="Podsetnici" desc="Sve zakazane notifikacije se otkazuju." />
        {hasAccount ? (
          <>
            <View style={{ height: 12 }} />
            <Row
              icon="person-remove"
              title="Nalog i sinhronizacija"
              desc={`Nalog ${session?.user.email ?? ''} se briše sa servera.`}
            />
          </>
        ) : null}
      </Card>

      {hasAccount ? (
        <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 14, lineHeight: 18 }}>
          Ako karton deliš sa ukućanima, njihov pristup ostaje — briše se tvoj nalog i tvoja
          kopija na ovom telefonu. Ako si jedini član, karton se briše i sa servera.
        </Text>
      ) : (
        <Text style={{ fontSize: 12.5, color: t.muted, marginTop: 14, lineHeight: 18 }}>
          Podaci ove aplikacije su samo na ovom telefonu — brišu se odmah i u celini.
        </Text>
      )}

      <Field
        label={`Napiši ${CONFIRM_WORD} da potvrdiš`}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder={CONFIRM_WORD}
      />

      <Btn
        label={
          busy
            ? 'Brišem…'
            : hasAccount
              ? 'Obriši nalog i sve podatke'
              : 'Obriši sve podatke'
        }
        kind="danger"
        icon="trash"
        onPress={onPressDelete}
        style={{ opacity: confirmed && !busy ? 1 : 0.5 }}
      />
      <Btn label="Otkaži" kind="ghost" onPress={() => router.back()} />
    </ModalScreen>
  );
}
