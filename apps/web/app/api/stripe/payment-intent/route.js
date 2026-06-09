import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json({ error: 'Endpoint deprecato. Usa /api/stripe/checkout-session.' }, { status: 410 });
}
