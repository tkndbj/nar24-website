// app/api/analytics/impressions/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

// Initialize Firebase Admin
initializeFirebaseAdmin();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productIds, userGender, userAge, timestamp } = body;

    // Validation
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json(
        { error: 'productIds must be a non-empty array' },
        { status: 400 }
      );
    }

    // Deduplicate and limit (matching Flutter logic)
    const uniqueIds = [...new Set(productIds)];
    if (uniqueIds.length > 100) {
      console.warn(`Large batch of ${uniqueIds.length} IDs, trimming to 100`);
      uniqueIds.length = 100;
    }

    // Call your existing Cloud Function
    // Using the same function that Flutter uses
    const functionUrl = process.env.FIREBASE_FUNCTION_URL || 
      `https://europe-west3-${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}.cloudfunctions.net/incrementImpressionCount`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          productIds: uniqueIds,
          userGender: userGender || null,
          userAge: userAge || null,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Cloud Function error:', errorText);
      throw new Error(`Cloud Function returned ${response.status}`);
    }

    const result = await response.json();

    console.log(`✅ Successfully queued ${uniqueIds.length} impressions`);

    return NextResponse.json({
      success: true,
      queued: uniqueIds.length,
      message: 'Impressions queued successfully',
      result: result.result || result, // Handle different response formats
    });

  } catch (error) {
    console.error('Error processing impressions:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process impressions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Optional: GET endpoint to check status
export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    service: 'impression-tracking',
    timestamp: Date.now(),
  });
}