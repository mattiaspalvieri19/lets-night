import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDED_KEY = 'ln_onboarded_v1';
const PREFS_KEY = 'ln_guest_prefs_v1';

export async function isOnboarded() {
  try {
    const v = await AsyncStorage.getItem(ONBOARDED_KEY);
    return v === '1';
  } catch { return false; }
}

export async function markOnboarded() {
  try { await AsyncStorage.setItem(ONBOARDED_KEY, '1'); } catch {}
}

// Per gli utenti ospite (non loggati): salviamo città + interests in locale.
// Quando si registreranno, ProfileEdit potrà importare queste preferenze.
export async function saveGuestPrefs(prefs) {
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs || {})); } catch {}
}

export async function getGuestPrefs() {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function clearGuestPrefs() {
  try { await AsyncStorage.removeItem(PREFS_KEY); } catch {}
}
