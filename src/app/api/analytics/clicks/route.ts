import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  console.log('✅ Clicks route hit!');
  
  try {
    const { clicks, shopIds } = await request.json();

    if (!clicks || typeof clicks !== 'object' || Object.keys(clicks).length === 0) {
      return NextResponse.json({ error: 'Invalid clicks data' }, { status: 400 });
    }

    const batch = getFirestoreAdmin().batch();
    const timestamp = FieldValue.serverTimestamp();

    for (const [productId, clickCount] of Object.entries(clicks)) {
      const count = Number(clickCount);
      if (isNaN(count) || count <= 0) continue;

      const shopId = shopIds?.[productId];
      const collection = shopId ? 'shop_products' : 'products';
      const productRef = getFirestoreAdmin().collection(collection).doc(productId);

      batch.update(productRef, {
        clickCount: FieldValue.increment(count),
        dailyClickCount: FieldValue.increment(count),
        weeklyClickCount: FieldValue.increment(count),
        monthlyClickCount: FieldValue.increment(count),
        lastClickAt: timestamp,
      });

      if (shopId) {
        const shopRef = getFirestoreAdmin().collection('shops').doc(shopId);
        batch.update(shopRef, {
          totalClicks: FieldValue.increment(count),
          lastActivityAt: timestamp,
        });
      }
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      processed: Object.keys(clicks).length,
    });
  } catch (error) {
    console.error('Error recording clicks:', error);
    return NextResponse.json({ error: 'Failed to record clicks' }, { status: 500 });
  }
}