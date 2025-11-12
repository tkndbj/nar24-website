import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { initializeFirebaseAdmin } from '@/lib/firebase-admin';

initializeFirebaseAdmin();

export async function GET(request: NextRequest) {
  try {
    // Get Firebase ID token from cookie or header
    const authHeader = request.headers.get('authorization');
    const cookieToken = request.cookies.get('__session')?.value;
    
    const token = authHeader?.replace('Bearer ', '') || cookieToken;
    
    if (!token) {
      // No auth token - return empty demographics
      return NextResponse.json({
        gender: null,
        age: null,
      }, { status: 200 });
    }

    // Verify Firebase token
    const decodedToken = await getAuth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Get user profile from Firestore
    const db = getFirestore();
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({
        gender: null,
        age: null,
      }, { status: 200 });
    }

    const userData = userDoc.data();

    // Calculate age
    let age: number | null = null;
    if (userData?.birthDate) {
      try {
        const birthDate = userData.birthDate._seconds 
          ? new Date(userData.birthDate._seconds * 1000)
          : new Date(userData.birthDate);
        
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
          age--;
        }
      } catch (error) {
        console.warn('Error calculating age:', error);
      }
    }

    return NextResponse.json({
      gender: userData?.gender || null,
      age: age,
    });

  } catch (error) {
    console.error('Error fetching demographics:', error);
    
    return NextResponse.json({
      gender: null,
      age: null,
    }, { status: 200 });
  }
}