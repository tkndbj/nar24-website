// app/api/user/demographics/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

initializeFirebaseAdmin();

export async function GET(request: NextRequest) {
  try {
    // Get auth token from request
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify token
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get user profile from Firestore
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();

    // Return only demographics data
    return NextResponse.json({
      gender: userData?.gender || null,
      birthDate: userData?.birthDate?._seconds 
        ? new Date(userData.birthDate._seconds * 1000).toISOString()
        : null,
    });

  } catch (error) {
    console.error('Error fetching demographics:', error);
    
    // Return empty demographics instead of error (graceful degradation)
    return NextResponse.json({
      gender: null,
      birthDate: null,
    });
  }
}