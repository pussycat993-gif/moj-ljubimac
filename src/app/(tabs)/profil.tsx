import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Btn, Card, EmptyState, H1, Row, Screen, SectionTitle, Sub, Tag } from '@/components/ui';
import { useSession } from '@/hooks/use-session';
import { useTheme } from '@/hooks/use-theme';
import { formatDate } from '@/lib/dates';
import { useActivePet, useApp } from '@/lib/store';
import { isCloudConfigured, signOut } from '@/lib/supabase';
import { stopSync } from '@/lib/sync';
import { SPECIES_LABEL } from '@/lib/types';

export default function ProfileScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pet = useActivePet();
  const premium = useApp((s) => s.premium);
  const setPremium = useApp((s) => s.setPremium);
  const deletePet = useApp((s) => s.deletePet);
  const cloud = useMemo(() => isCloudConfigured(), []);
  const session = useSession();

  const doSignOut = async () => {
    await signOut();
    stopSync();
  };

  const invite = async () => {
    /* Pravo deljenje profila traži backend (nalozi + sinhronizacija).
       Do tada šaljemo pozivnicu za aplikaciju — a arhitektura je opisana u README-u. */
    await Share.share({
      message:
        'Vodimo karton našeg ljubimca u aplikaciji „Moj Ljubimac" — pridruži mi se da ga delimo: https://mojljubimac.app',
    });
  };

  return (
    <Screen>
      <View style={{ height: insets.top }} />
      <H1>{pet?.name ?? 'Profil'}</H1>
      <Sub>Profil ljubimca i podešavanja</Sub>

      {!pet ? (
        <EmptyState icon="paw" title="Nema ljubimca" desc="Dodaj ljubimca na početnom ekranu." />
      ) : (
        <>
          <Card>
            {pet.photoUri ? (
              <Image
                source={{ uri: pet.photoUri }}
                style={{ width: 84, height: 84, borderRadius: 42, alignSelf: 'center', marginBottom: 12 }}
              />
            ) : null}
            <Row icon="paw" title="Vrsta i rasa" desc={`${SPECIES_LABEL[pet.species]}${pet.breed ? ` · ${pet.breed}` : ''}`} />
            <View style={{ height: 12 }} />
            <Row
              icon="male-female"
              title="Pol"
              desc={`${pet.sex === 'f' ? 'Ženka' : 'Mužjak'}${pet.neutered ? ' (sterilisan/a)' : ''}`}
            />
            <View style={{ height: 12 }} />
            <Row icon="gift" title="Datum rođenja" desc={formatDate(pet.dob)} />
            {pet.microchip ? (
              <>
                <View style={{ height: 12 }} />
                <Row icon="pricetag" title="Mikročip" desc={pet.microchip} />
              </>
            ) : null}
            <Btn label="Izmeni podatke" kind="ghost" onPress={() => router.push({ pathname: '/pet-form', params: { id: pet.id } })} />
          </Card>

          <SectionTitle>Deljenje i sinhronizacija</SectionTitle>
          <Card>
            {!cloud ? (
              <>
                <Row
                  icon="people"
                  title="Deli sa porodicom"
                  desc="Supružnik ili ukućani vode isti karton, svako na svom telefonu."
                  right={<Tag tone="ok">besplatno</Tag>}
                />
                <Btn label="Pozovi člana porodice" kind="ghost" icon="person-add" onPress={invite} />
                <Text style={{ fontSize: 12, color: t.muted, marginTop: 10, lineHeight: 17 }}>
                  Sinhronizacija u realnom vremenu se uključuje sa nalogom u sledećoj verziji (backend).
                </Text>
              </>
            ) : session ? (
              <>
                <Row
                  icon="cloud-done"
                  title="Sinhronizacija je uključena"
                  desc={`Prijavljen kao ${session.user.email}`}
                  right={<Tag tone="ok">uključeno</Tag>}
                />
                <Btn label="Odjavi se" kind="ghost" icon="log-out" onPress={doSignOut} />
              </>
            ) : (
              <>
                <Row
                  icon="cloud-upload"
                  title="Sinhronizuj i deli karton"
                  desc="Prijavi se da karton deliš sa ukućanima na drugim telefonima."
                />
                <Btn
                  label="Prijavi se ili napravi nalog"
                  icon="person-add"
                  onPress={() => router.push('/auth')}
                />
              </>
            )}
          </Card>

          <SectionTitle>Moj Ljubimac Premium</SectionTitle>
          <Card>
            {[
              ['paw', 'Neograničen broj ljubimaca'],
              ['cloud-upload', 'Neograničene fotografije i PDF nalazi'],
              ['stats-chart', 'Analitika ishrane i težine'],
              ['document', 'Izvoz celog kartona u PDF'],
            ].map(([icon, label], i) => (
              <View key={label} style={{ marginTop: i === 0 ? 0 : 12 }}>
                <Row icon={icon as never} title={label as string} />
              </View>
            ))}
            {premium ? (
              <>
                <Btn label="Premium je aktivan ✓" kind="ghost" onPress={() => {}} />
                <Btn label="Isključi (demo)" kind="danger" onPress={() => setPremium(false)} />
              </>
            ) : (
              <Btn label="Probaj 7 dana besplatno" onPress={() => router.push('/paywall')} />
            )}
          </Card>

          <SectionTitle>Nalog</SectionTitle>
          <Card>
            <Row
              icon="shield-checkmark"
              title="Privatnost i podaci"
              desc="Podaci se čuvaju samo na ovom uređaju dok se ne uključi nalog."
            />
            <Btn
              label="Obriši ljubimca i sve zapise"
              kind="danger"
              onPress={() =>
                Alert.alert(
                  'Obriši ljubimca?',
                  `Svi zapisi za ${pet.name} (težina, vakcine, trenuci…) biće trajno obrisani.`,
                  [
                    { text: 'Otkaži', style: 'cancel' },
                    { text: 'Obriši sve', style: 'destructive', onPress: () => deletePet(pet.id) },
                  ]
                )
              }
            />
          </Card>

          <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 20 }}>
            Moj Ljubimac v1.0.0
          </Text>
        </>
      )}
    </Screen>
  );
}
