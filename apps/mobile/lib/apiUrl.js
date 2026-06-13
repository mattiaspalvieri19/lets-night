import Constants from 'expo-constants';

// In sviluppo l'IP della rete cambia di continuo (WiFi di casa ↔ hotspot del telefono).
// Invece di hardcodare EXPO_PUBLIC_API_URL e aggiornarlo a ogni cambio rete, ricaviamo
// l'host dal dev server di Expo (Metro gira sullo stesso Mac del web; il web è su :3000).
// Così l'URL dell'API segue SEMPRE la rete attuale, senza toccare i .env.
function fromExpoHost() {
  const host =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost ||
    '';
  const ip = String(host).split(':')[0];
  if (ip && ip !== 'localhost' && ip !== '127.0.0.1') return `http://${ip}:3000`;
  return null;
}

// Priorità: host di Expo (dev, sempre allineato alla rete) → env esplicito → localhost.
export const API_URL = fromExpoHost() || process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
