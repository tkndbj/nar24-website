// src/app/api/bundles/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin if not already initialized
if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

const db = getFirestore();

interface BundleItem {
  productId: string;
  productName: string;
  originalPrice: number;
  bundlePrice: number;
  discountPercentage: number;
  imageUrl?: string;
  currency: string;
}

interface Bundle {
  id: string;
  mainProductId: string;
  bundleItems: BundleItem[];
  isActive: boolean;
  shopId: string;
}

interface Product {
  id: string;
  productName: string;
  imageUrls: string[];
  price: number;
  currency: string;
  brandModel?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  userId: string;
  shopId?: string;
  sellerName?: string;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const shopId = searchParams.get('shopId');
    const mainProductId = searchParams.get('mainProductId');
    const isActive = searchParams.get('isActive');

    console.log('Bundle API called with params:', { shopId, mainProductId, isActive });

    if (!shopId) {
      return NextResponse.json(
        { error: 'shopId is required' },
        { status: 400 }
      );
    }

    let bundles: Bundle[] = [];

    if (mainProductId) {
      // Query bundles where this product is the main product
      const bundlesQuery = db.collection('bundles')
        .where('shopId', '==', shopId)
        .where('mainProductId', '==', mainProductId);
      
      if (isActive === 'true') {
        bundlesQuery.where('isActive', '==', true);
      }

      const bundlesSnapshot = await bundlesQuery.get();
      
      bundles = bundlesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Bundle));

    } else {
      // Query all bundles for the shop
      let bundlesQuery = db.collection('bundles')
        .where('shopId', '==', shopId);
      
      if (isActive === 'true') {
        bundlesQuery = bundlesQuery.where('isActive', '==', true);
      }

      const bundlesSnapshot = await bundlesQuery.get();
      
      bundles = bundlesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Bundle));
    }

    console.log('Found bundles:', bundles.length);
    return NextResponse.json(bundles);

  } catch (error) {
    console.error('Error fetching bundles:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper endpoint to get product data for bundles
export async function POST(request: NextRequest) {
  try {
    const { productIds } = await request.json();
    
    if (!productIds || !Array.isArray(productIds)) {
      return NextResponse.json(
        { error: 'productIds array is required' },
        { status: 400 }
      );
    }

    const products: Product[] = [];

    // Fetch all products in parallel
    const productPromises = productIds.map(async (productId: string) => {
      try {
        const productDoc = await db.collection('shop_products').doc(productId).get();
        if (productDoc.exists) {
          return {
            id: productDoc.id,
            ...productDoc.data()
          } as Product;
        }
        return null;
      } catch (error) {
        console.error(`Error fetching product ${productId}:`, error);
        return null;
      }
    });

    const productResults = await Promise.all(productPromises);
    
    // Filter out null results
    const validProducts = productResults.filter(product => product !== null) as Product[];

    return NextResponse.json(validProducts);

  } catch (error) {
    console.error('Error fetching products:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}