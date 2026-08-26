import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { newId } from './id';

/**
 * Slike i PDF-ovi iz pickera žive u privremenim lokacijama koje OS može obrisati.
 * Zato svaki izabrani fajl kopiramo u trajni „media" folder aplikacije.
 */
function mediaDir(): Directory {
  const dir = new Directory(Paths.document, 'media');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

async function persistCopy(sourceUri: string, preferredName: string): Promise<string> {
  const source = new File(sourceUri);
  const target = new File(mediaDir(), preferredName);
  await source.copy(target);
  return target.uri;
}

/**
 * Briše ceo „media" folder (sve kopirane fotografije i PDF nalaze).
 * Poziva se pri brisanju naloga/podataka — bez ovoga bi fajlovi ostali na
 * telefonu i posle brisanja zapisa koji su na njih pokazivali.
 */
export function deleteAllMedia(): void {
  try {
    const dir = new Directory(Paths.document, 'media');
    if (!dir.exists) return;
    // Prvo sadržaj, pa folder — sigurnije od jednog rekurzivnog delete-a.
    for (const entry of dir.list()) {
      try {
        entry.delete();
      } catch {
        // pojedinačni fajl je zaključan/nedostupan — nastavi sa ostalim
      }
    }
    dir.delete();
  } catch {
    // folder ne postoji ili ga OS drži — nije razlog da brisanje naloga padne
  }
}

function extensionOf(uri: string, fallback: string): string {
  const clean = uri.split('?')[0];
  const dot = clean.lastIndexOf('.');
  if (dot === -1) return fallback;
  const ext = clean.slice(dot + 1).toLowerCase();
  return ext.length > 5 ? fallback : ext;
}

/** Bira sliku iz galerije ili kamere i vraća trajni URI, ili null ako je korisnik odustao. */
export async function pickImage(fromCamera: boolean): Promise<string | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: 'images',
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  };

  let result: ImagePicker.ImagePickerResult;
  if (fromCamera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }

  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const ext = extensionOf(asset.uri, 'jpg');
  return persistCopy(asset.uri, `${newId()}.${ext}`);
}

export interface PickedDocument {
  uri: string;
  name: string;
}

/** Bira PDF nalaz i vraća trajni URI + originalno ime fajla. */
export async function pickPdf(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: 'application/pdf',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  const uri = await persistCopy(asset.uri, `${newId()}.pdf`);
  return { uri, name: asset.name ?? 'nalaz.pdf' };
}
