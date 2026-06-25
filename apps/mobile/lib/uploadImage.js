import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

// Estensione file dal mime dell'immagine scelta (fallback jpg).
export function imageExt(asset) {
  const sub = (asset?.mimeType || '').split('/')[1];
  return sub === 'jpeg' ? 'jpg' : (sub || 'jpg');
}

// Carica su Supabase Storage un'immagine presa da expo-image-picker (richiede base64: true).
// Su React Native nativo `fetch(uri).blob()` restituisce un blob vuoto -> file caricato a 0 byte
// (la foto si vede tutta nera). Usiamo invece i byte decodificati dal base64: pattern ufficiale
// Supabase per RN, puro JS (nessuna dipendenza dal runtime), identico in dev e in build nativa.
export async function uploadPickedImage(bucket, path, asset) {
  if (!asset?.base64) throw new Error('Immagine senza dati (base64 mancante).');
  const contentType = asset.mimeType || 'image/jpeg';
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, decode(asset.base64), { contentType, upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
  return publicUrl;
}
