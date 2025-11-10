// app/api/analytics/detail-views/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const { views } = await request.json();

    if (!views || !Array.isArray(views) || views.length === 0) {
      return NextResponse.json(
        { error: 'Invalid views data' },
        { status: 400 }
      );
    }

    // Split into batches of 500 (Firestore limit)
    const BATCH_SIZE = 500;
    const batches: any[][] = [];
    
    for (let i = 0; i < views.length; i += BATCH_SIZE) {
      batches.push(views.slice(i, i + BATCH_SIZE));
    }

    // Process all batches in parallel
    await Promise.all(
      batches.map(async (batchViews) => {
        const batch = getFirestoreAdmin().batch();

        for (const view of batchViews) {
          const { productId, collectionName, viewData } = view;

          if (!productId || !collectionName || !viewData) continue;

          // Add detail view to product's subcollection
          const detailViewRef = getFirestoreAdmin()
            .collection(collectionName)
            .doc(productId)
            .collection('detailViews')
            .doc(); // Auto-generate ID

          batch.set(detailViewRef, {
            ...viewData,
            timestamp: new Date(viewData.timestamp || Date.now()),
          });
        }

        await batch.commit();
      })
    );

    return NextResponse.json({
      success: true,
      processed: views.length,
      batches: batches.length,
    });
  } catch (error) {
    console.error('Error recording detail views:', error);
    return NextResponse.json(
      { error: 'Failed to record detail views' },
      { status: 500 }
    );
  }
}