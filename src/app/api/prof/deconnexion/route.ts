import { NextResponse } from 'next/server';
import { fermerSession } from '@/lib/authProf';

export async function POST() {
  await fermerSession();
  return NextResponse.json({ success: true });
}
