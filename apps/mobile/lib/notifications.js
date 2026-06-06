import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Comportamento notifiche in foreground: mostra alert + suono
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Registra il device per ricevere push, salva il token in profiles
export async function registerForPushNotifications(userId) {
  if (!Device.isDevice) return null; // simulatore: skip

  // Canale Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: "Let's Night",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#A855F7',
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  let token = null;
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : {});
    token = tokenData.data;
  } catch {
    return null;
  }

  if (userId && token) {
    await supabase.from('profiles').update({ push_token: token }).eq('id', userId);
  }

  return token;
}

// Notifica locale immediata
export async function sendLocalNotification({ title, body, data = {} }) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data },
    trigger: null,
  });
}

// Promemoria evento: notifica 24h prima
// Restituisce l'id del task schedulato (utile per cancellarlo)
export async function scheduleEventReminder(event) {
  const timeStr = event.event_time || '20:00:00';
  const [h, m] = timeStr.split(':').map(Number);
  const eventDate = new Date(`${event.event_date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
  const notifyAt = new Date(eventDate.getTime() - 24 * 60 * 60 * 1000);

  if (notifyAt <= new Date()) return null; // evento già passato o meno di 24h

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: `Stasera: ${event.title}`,
      body: `L'evento inizia alle ${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}. Ricorda il tuo QR!`,
      data: { type: 'reminder', eventId: event.id },
    },
    trigger: { type: 'date', date: notifyAt },
  });
  return id;
}

// Cancella un promemoria schedulato
export async function cancelReminder(notificationId) {
  if (notificationId) {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  }
}
