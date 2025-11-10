// app/api/analytics/preferences/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
  try {
    const {
      userId,
      categoryClicks,
      subcategoryClicks,
      subsubcategoryClicks,
      purchaseCategories,
      purchaseSubcategories,
      purchaseSubsubcategories,
    } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const batch = getFirestoreAdmin().batch();
    const prefsRef = getFirestoreAdmin()
      .collection('users')
      .doc(userId)
      .collection('preferences');

    // Update click counts
    if (categoryClicks && Object.keys(categoryClicks).length > 0) {
      const categoryRef = prefsRef.doc('categoryClicks');
      const incrementData: Record<string, FieldValue> = {};

      for (const [key, value] of Object.entries(categoryClicks)) {
        incrementData[key] = FieldValue.increment(Number(value));
      }

      batch.set(categoryRef, incrementData, { merge: true });
    }

    if (subcategoryClicks && Object.keys(subcategoryClicks).length > 0) {
      const subcategoryRef = prefsRef.doc('subcategoryClicks');
      const incrementData: Record<string, FieldValue> = {};

      for (const [key, value] of Object.entries(subcategoryClicks)) {
        incrementData[key] = FieldValue.increment(Number(value));
      }

      batch.set(subcategoryRef, incrementData, { merge: true });
    }

    if (subsubcategoryClicks && Object.keys(subsubcategoryClicks).length > 0) {
      const subsubcategoryRef = prefsRef.doc('subsubcategoryClicks');
      const incrementData: Record<string, FieldValue> = {};
      
      for (const [key, value] of Object.entries(subsubcategoryClicks)) {
        incrementData[key] = FieldValue.increment(Number(value));
      }
      
      batch.set(subsubcategoryRef, incrementData, { merge: true });
    }

    // Update purchase arrays
    const hasPurchaseData = 
      (purchaseCategories && purchaseCategories.length > 0) ||
      (purchaseSubcategories && purchaseSubcategories.length > 0) ||
      (purchaseSubsubcategories && purchaseSubsubcategories.length > 0);

    if (hasPurchaseData) {
      const purchaseRef = prefsRef.doc('purchases');
      const purchaseData: Record<string, FieldValue> = {};

      if (purchaseCategories && purchaseCategories.length > 0) {
        purchaseData.categories = FieldValue.arrayUnion(...purchaseCategories);
      }

      if (purchaseSubcategories && purchaseSubcategories.length > 0) {
        purchaseData.subcategories = FieldValue.arrayUnion(...purchaseSubcategories);
      }

      if (purchaseSubsubcategories && purchaseSubsubcategories.length > 0) {
        purchaseData.subsubcategories = FieldValue.arrayUnion(...purchaseSubsubcategories);
      }

      batch.set(purchaseRef, purchaseData, { merge: true });
    }

    await batch.commit();

    return NextResponse.json({
      success: true,
      clicksProcessed: 
        Object.keys(categoryClicks || {}).length +
        Object.keys(subcategoryClicks || {}).length +
        Object.keys(subsubcategoryClicks || {}).length,
      purchasesProcessed: 
        (purchaseCategories?.length || 0) +
        (purchaseSubcategories?.length || 0) +
        (purchaseSubsubcategories?.length || 0),
    });
  } catch (error) {
    console.error('Error recording preferences:', error);
    return NextResponse.json(
      { error: 'Failed to record preferences' },
      { status: 500 }
    );
  }
}