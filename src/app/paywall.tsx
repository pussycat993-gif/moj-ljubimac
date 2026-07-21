import { useRouter } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { Btn, Card, ModalScreen, Row } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import { useApp } from '@/lib/store';

/**
 * Ekran pretplate.
 *
 * OVDE SE KAČI NAPLATA: prava kupovina MORA ići kroz Apple StoreKit / Google Play
 * Billing (najlakše preko RevenueCat SDK-a — `react-native-purchases`).
 * Dugme ispod za sada samo uključuje lokalni „premium" fleg radi demonstracije,
 * i to je jasno označeno u poruci.
 */
export default function Paywall() {
  const t = useTheme();
  const router = useRouter();
  const setPremium = useApp((s) => s.setPremium);

  const startTrial = () => {
    Alert.alert(
      'Demo režim',
      'U produkciji se ovde otvara kupovina kroz App Store / Google Play. Za sada uključujem Premium lokalno da možeš da testiraš funkcije.',
      [
        { text: 'Otkaži', style: 'cancel' },
        {
          text: 'Uključi Premium (demo)',
          onPress: () => {
            setPremium(true);
            router.back();
          },
        },
      ]
    );
  };

  return (
    <ModalScreen>
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <Text style={{ fontSize: 44 }}>👑</Text>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.text, marginTop: 8 }}>
          Moj Ljubimac Premium
        </Text>
        <Text style={{ fontSize: 14, color: t.muted, marginTop: 6, textAlign: 'center' }}>
          Sve što besplatni paket ima, plus:
        </Text>
      </View>

      <Card>
        <Row icon="paw" title="Neograničen broj ljubimaca" desc="Ceo čopor u jednoj aplikaciji" />
        <View style={{ height: 12 }} />
        <Row icon="cloud-upload" title="Neograničeni prilozi" desc="Fotografije i PDF nalazi bez limita" />
        <View style={{ height: 12 }} />
        <Row icon="stats-chart" title="Analitika ishrane" desc="Kako hrana utiče na varenje i težinu" />
        <View style={{ height: 12 }} />
        <Row icon="document" title="PDF izvoz kartona" desc="Ceo karton spreman za veterinara" />
      </Card>

      <Btn label="Probaj 7 dana besplatno" onPress={startTrial} />
      <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 12, lineHeight: 17 }}>
        Zatim 399 din/mesečno ili 2.990 din/godišnje (probne cene).{'\n'}
        Otkazivanje bilo kad u podešavanjima App Store / Google Play naloga.
      </Text>
      <Btn label="Možda kasnije" kind="ghost" onPress={() => router.back()} />
    </ModalScreen>
  );
}
