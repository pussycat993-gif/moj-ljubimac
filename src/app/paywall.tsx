import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

import { Btn, Card, ModalScreen, Row } from '@/components/ui';
import { useTheme } from '@/hooks/use-theme';
import {
  getPackages,
  isBillingConfigured,
  purchasePackage,
  restorePurchases,
} from '@/lib/purchases';
import { useApp } from '@/lib/store';

/** Naziv paketa na dugmetu, npr. „Godišnje · 2.990 din". */
function packageLabel(pkg: PurchasesPackage): string {
  const price = pkg.product.priceString;
  switch (pkg.packageType as string) {
    case 'ANNUAL':
      return `Godišnje · ${price}`;
    case 'MONTHLY':
      return `Mesečno · ${price}`;
    case 'WEEKLY':
      return `Nedeljno · ${price}`;
    default:
      return `${pkg.product.title} · ${price}`;
  }
}

export default function Paywall() {
  const t = useTheme();
  const router = useRouter();
  const setPremium = useApp((s) => s.setPremium);

  // Da li je prava naplata dostupna — računamo jednom.
  const configured = useMemo(() => isBillingConfigured(), []);
  // null = još učitavamo ponudu; [] = nema dostupnih paketa.
  const [packages, setPackages] = useState<PurchasesPackage[] | null>(configured ? null : []);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let ignore = false;
    getPackages().then((pkgs) => {
      if (!ignore) setPackages(pkgs);
    });
    return () => {
      ignore = true;
    };
  }, [configured]);

  const buy = async (pkg: PurchasesPackage) => {
    if (busy) return;
    setBusy(true);
    const res = await purchasePackage(pkg);
    setBusy(false);
    if (res === 'success') {
      router.back();
    } else if (res === 'error') {
      Alert.alert('Greška', 'Kupovina nije uspela. Pokušaj ponovo.');
    }
    // 'cancelled' — korisnik je odustao, bez poruke.
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    const active = await restorePurchases();
    setBusy(false);
    Alert.alert(
      active ? 'Uspešno' : 'Nema pretplate',
      active
        ? 'Premium je vraćen na ovom nalogu.'
        : 'Nismo našli aktivnu pretplatu za ovaj nalog.'
    );
    if (active) router.back();
  };

  // Demo režim (bez konfigurisane naplate): lokalni fleg radi testiranja funkcija.
  const startDemo = () => {
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

      {configured ? (
        packages === null ? (
          <View style={{ alignItems: 'center', marginTop: 22 }}>
            <ActivityIndicator color={t.accent} />
          </View>
        ) : packages.length === 0 ? (
          <>
            <Text style={{ fontSize: 13, color: t.muted, textAlign: 'center', marginTop: 20, lineHeight: 18 }}>
              Pretplate trenutno nisu dostupne. Pokušaj ponovo kasnije.
            </Text>
            <Btn label="Vrati kupovinu" kind="ghost" icon="refresh" onPress={restore} />
          </>
        ) : (
          <>
            {packages.map((pkg) => (
              <Btn key={pkg.identifier} label={packageLabel(pkg)} onPress={() => buy(pkg)} />
            ))}
            <Btn label="Vrati kupovinu" kind="ghost" icon="refresh" onPress={restore} />
            <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 12, lineHeight: 17 }}>
              Naplata ide preko App Store / Google Play naloga.{'\n'}
              Otkazivanje bilo kad u podešavanjima naloga.
            </Text>
          </>
        )
      ) : (
        <>
          <Btn label="Probaj 7 dana besplatno" onPress={startDemo} />
          <Text style={{ fontSize: 12, color: t.muted, textAlign: 'center', marginTop: 12, lineHeight: 17 }}>
            Zatim 399 din/mesečno ili 2.990 din/godišnje (probne cene).{'\n'}
            Otkazivanje bilo kad u podešavanjima App Store / Google Play naloga.
          </Text>
        </>
      )}

      {busy ? (
        <Text style={{ fontSize: 12.5, color: t.muted, textAlign: 'center', marginTop: 12 }}>
          Obrada…
        </Text>
      ) : null}

      <Btn label="Možda kasnije" kind="ghost" onPress={() => router.back()} />
    </ModalScreen>
  );
}
