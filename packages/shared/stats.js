// ============================================================================
// METRICHE CANONICHE — unica fonte di verità per TUTTE le dashboard e
// statistiche (business/admin, web/mobile). Ogni superficie che mostra numeri
// su prenotazioni DEVE passare da qui: così i totali coincidono ovunque, oggi
// e con le schermate future.
//
// REGOLE:
//  • prenotazione ATTIVA = status ≠ cancelled e ≠ denied;
//  • "prenotazioni" = numero di righe attive; "persone" = somma di quantity;
//  • incasso = somma di total_price delle attive (la booking fee è della
//    piattaforma e resta fuori);
//  • tavoli: pagato/quote/residuo si calcolano SEMPRE dalla somma dei
//    pagamenti dei partecipanti, mai dal campo denormalizzato `collected`
//    (che i trigger DB tengono comunque allineato e il Registro verifica);
//  • "venduti" a serata conclusa = entrati + rifiutati + no-show.
// ============================================================================

export function isActiveBooking(b) {
  return !!b && b.status !== 'cancelled' && b.status !== 'denied';
}

export function activeBookings(list) {
  return (list || []).filter(isActiveBooking);
}

export function isTableBooking(b) {
  return !!b?.table_id || b?.booking_type === 'table' || b?.booking_type === 'table_share';
}

export function entryBookings(list) {
  return activeBookings(list).filter(b => !isTableBooking(b));
}

export function peopleCount(list) {
  return (list || []).reduce((s, b) => s + (Number(b.quantity) || 1), 0);
}

export function sumRevenue(list) {
  return activeBookings(list).reduce((s, b) => s + Number(b.total_price || 0), 0);
}

export function checkedInCount(list) {
  return (list || []).filter(b => b.checked_in).length;
}

export const NOSHOW_REFUND_RE = /^Rimborso no-show/;

// Categorizza TUTTE le prenotazioni (incluse denied/cancelled) per il conteggio
// "venduti a serata conclusa": entrato = QR accettato; rifiutato = denied;
// no-show = mai entrato a serata passata (inclusi i no-show già rimborsati,
// riconosciuti dal refund_reason). Richiede il join events(event_date);
// todayStr = 'YYYY-MM-DD' locale.
export function categorizeEntries(list, todayStr) {
  let entrati = 0, rifiutati = 0, noShow = 0;
  for (const b of list || []) {
    const past = (b.events?.event_date || '') < todayStr;
    if (b.status === 'denied') rifiutati++;
    else if (b.checked_in) entrati++;
    else if (past && (b.status === 'confirmed' || (b.status === 'cancelled' && NOSHOW_REFUND_RE.test(b.refund_reason || '')))) noShow++;
  }
  return { venduti: entrati + rifiutati + noShow, entrati, rifiutati, noShow };
}

// Totali tavolo coerenti su card, dettaglio e panoramiche.
export function tableTotals(table, members) {
  const act = activeBookings(members);
  const paid = act.reduce((s, m) => s + Number(m.total_price || 0), 0);
  const total = Number(table?.total_price || 0);
  return {
    paid,
    total,
    residual: Math.max(0, total - paid),
    shares: act.filter(m => Number(m.total_price || 0) > 0).length,
  };
}
