Crea una nuova schermata mobile Expo Router per lets-night.

Argomento: $ARGUMENTS (es. "booking", "event/[id]", "(tabs)/notifications")

Crea `apps/mobile/app/$ARGUMENTS.jsx` seguendo queste regole:
- Componenti React Native: View, Text, ScrollView, Pressable, FlatList
- NativeWind per lo stile (className="...")
- Import supabase da `../../lib/supabase` (aggiusta il path)
- Import costanti/utility da `@lets-night/shared`
- Sfondo scuro: className="flex-1 bg-dark"
- Default export con nome PascalCase

Dopo la creazione mostra il file e suggerisci come aggiungere il link di navigazione dalla tab o da un'altra schermata.
