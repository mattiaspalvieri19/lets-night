import { useState, useRef } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { formatDateFull, formatTime, getPriceLabel } from '@lets-night/shared';

export default function BookingModal({ visible, onClose, event, session }) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);

  const isFree = !event?.price || event.price === 0;
  const total = isFree ? 0 : event.price * quantity;

  function handleClose() {
    setQuantity(1);
    setSuccess(false);
    setError('');
    onClose();
  }

  async function handleConfirm() {
    if (submitting.current) return;
    if (!session) {
      setError('Sessione scaduta. Rieffettua il login.');
      return;
    }
    submitting.current = true;
    setError('');
    setLoading(true);
    const qty = isFree ? 1 : quantity;
    const { error: err } = await supabase.from('bookings').insert({
      user_id: session.user.id,
      event_id: event.id,
      status: 'confirmed',
      quantity: qty,
      total_price: isFree ? 0 : event.price * qty,
      fee: 1.50,
    });
    setLoading(false);
    submitting.current = false;
    if (err) {
      setError('Prenotazione non riuscita. Riprova.');
      console.error('Errore booking:', err);
    } else {
      setSuccess(true);
    }
  }

  if (!event) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' }}
          onPress={handleClose}
        />
        <View style={{ backgroundColor: '#111118', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderTopWidth: 1, borderColor: 'rgba(168,85,247,0.2)' }}>
          {/* Handle bar */}
          <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 20 }} />

          {success ? (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(34,197,94,0.15)', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.4)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 28 }}>✓</Text>
              </View>
              <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 6 }}>Prenotato!</Text>
              <Text style={{ color: '#64748B', fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 28 }}>
                Trovi il tuo biglietto nella tab Biglietti.
              </Text>
              <Pressable
                onPress={handleClose}
                style={{ backgroundColor: '#7C3AED', paddingHorizontal: 40, paddingVertical: 14, borderRadius: 12, width: '100%' }}
              >
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, textAlign: 'center' }}>Ottimo!</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={{ color: '#A855F7', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 }}>Prenota</Text>
                  <Text numberOfLines={2} style={{ color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 23 }}>{event.title}</Text>
                  <Text style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>{event.venues?.name}</Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={8}>
                  <Text style={{ color: '#64748B', fontSize: 22 }}>×</Text>
                </Pressable>
              </View>

              {/* Date + time */}
              <View style={{ backgroundColor: '#18181f', borderRadius: 12, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(168,85,247,0.12)' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 3 }}>Data</Text>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{formatDateFull(event.event_date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: '#64748B', fontSize: 11, marginBottom: 3 }}>Orario</Text>
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>{formatTime(event.event_time) || '—'}</Text>
                  </View>
                </View>
              </View>

              {/* Quantity (solo se a pagamento) */}
              {!isFree && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>Posti</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <Pressable
                      onPress={() => setQuantity(q => Math.max(1, q - 1))}
                      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.3)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#A855F7', fontSize: 20, fontWeight: '700', lineHeight: 24 }}>−</Text>
                    </Pressable>
                    <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800', minWidth: 24, textAlign: 'center' }}>{quantity}</Text>
                    <Pressable
                      onPress={() => setQuantity(q => Math.min(10, q + 1))}
                      style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(168,85,247,0.3)', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Text style={{ color: '#A855F7', fontSize: 20, fontWeight: '700', lineHeight: 24 }}>+</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Totale */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.12)', marginBottom: 20 }}>
                <Text style={{ color: '#64748B', fontSize: 14 }}>Totale</Text>
                <Text style={{ color: '#fff', fontSize: 20, fontWeight: '900' }}>
                  {isFree ? 'Gratuito' : `EUR ${total}`}
                </Text>
              </View>

              {error ? (
                <View style={{ backgroundColor: 'rgba(239,68,68,0.1)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <Text style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                onPress={handleConfirm}
                disabled={loading}
                style={({ pressed }) => ({
                  backgroundColor: '#7C3AED',
                  paddingVertical: 16,
                  borderRadius: 12,
                  alignItems: 'center',
                  opacity: loading || pressed ? 0.7 : 1,
                })}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Conferma prenotazione</Text>
                }
              </Pressable>
            </>
          )}
          <View style={{ height: 8 }} />
        </View>
      </View>
    </Modal>
  );
}
