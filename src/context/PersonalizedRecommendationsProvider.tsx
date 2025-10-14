// context/PersonalizedRecommendationsProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit as firestoreLimit, 
  getDocs,
  QueryDocumentSnapshot,
  DocumentData,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductUtils } from "@/app/models/Product";
import { useUser } from "@/context/UserProvider";

// ============= CONFIGURATION =============
const CACHE_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours (matches Flutter)
const BATCH_SIZE = 30; // matches Flutter
const CLICK_WEIGHT = 1;
const PURCHASE_WEIGHT = 5;

// ============= TYPES =============
interface PersonalizedRecommendationsContextType {
  recommendations: Product[];
  isLoading: boolean;
  error: string | null;
  hasRecommendations: boolean;
  fetchRecommendations: (options?: { limit?: number; forceRefresh?: boolean }) => Promise<void>;
  refresh: () => Promise<void>;
}

// ============= CONTEXT =============
const PersonalizedRecommendationsContext = createContext<PersonalizedRecommendationsContextType | undefined>(undefined);

export const usePersonalizedRecommendations = () => {
  const context = useContext(PersonalizedRecommendationsContext);
  if (!context) {
    throw new Error("usePersonalizedRecommendations must be used within PersonalizedRecommendationsProvider");
  }
  return context;
};

// ============= HELPER FUNCTIONS =============
const convertDocumentToProduct = (doc: QueryDocumentSnapshot<DocumentData>): Product => {
  const data = doc.data();
  return ProductUtils.fromJson({
    ...data,
    id: doc.id,
  });
};

// ============= PROVIDER =============
export const PersonalizedRecommendationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  
  // ✅ MATCHES FLUTTER: Minimal state
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // ✅ MATCHES FLUTTER: Cache tracking
  const lastFetchRef = useRef<Date | null>(null);
  const shownProductIdsRef = useRef<Set<string>>(new Set());
  
  // ✅ COMPUTED: hasRecommendations
  const hasRecommendations = useMemo(() => recommendations.length > 0, [recommendations.length]);

  // ✅ MATCHES FLUTTER: Remove duplicates
  const removeDuplicates = useCallback((products: Product[]): Product[] => {
    const seen = new Set<string>();
    const filtered: Product[] = [];

    for (const product of products) {
      if (shownProductIdsRef.current.has(product.id) || !seen.add(product.id)) {
        continue;
      }
      filtered.push(product);
    }

    return filtered;
  }, []);

  // ✅ MATCHES FLUTTER: Get user preferences with SINGLE read
  const getUserPreferences = useCallback(async (userId: string) => {
    try {
      const prefsSnapshot = await getDocs(
        collection(db, "users", userId, "preferences")
      );

      if (prefsSnapshot.docs.length === 0) {
        return null;
      }

      const categoryScores: Record<string, number> = {};
      const subcategoryScores: Record<string, number> = {};
      const purchasedCategories = new Set<string>();
      const purchasedSubcategories = new Set<string>();

      for (const doc of prefsSnapshot.docs) {
        const data = doc.data();

        switch (doc.id) {
          case 'categoryClicks':
            Object.assign(categoryScores, data);
            break;
          case 'subcategoryClicks':
            Object.assign(subcategoryScores, data);
            break;
          case 'purchases':
            if (data.categories) {
              data.categories.forEach((cat: string) => purchasedCategories.add(cat));
            }
            if (data.subcategories) {
              data.subcategories.forEach((sub: string) => purchasedSubcategories.add(sub));
            }
            break;
        }
      }

      // ✅ MATCHES FLUTTER: Calculate weighted scores
      const finalScores: Record<string, number> = {};

      Object.entries(categoryScores).forEach(([cat, clicks]) => {
        finalScores[cat] = clicks * CLICK_WEIGHT;
      });

      purchasedCategories.forEach(cat => {
        finalScores[cat] = (finalScores[cat] || 0) + (10 * PURCHASE_WEIGHT);
      });

      if (Object.keys(finalScores).length === 0) {
        return null;
      }

      // ✅ MATCHES FLUTTER: Get top 5 categories
      const topCategories = Object.entries(finalScores)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat]) => cat)
        .filter(cat => cat !== 'Unknown' && cat.length > 0);

      if (topCategories.length === 0) {
        return null;
      }

      return { topCategories, finalScores };
    } catch (e) {
      console.error('Error loading preferences:', e);
      return null;
    }
  }, []);

  // ✅ MATCHES FLUTTER: Personalized recommendations
  const getPersonalizedRecommendations = useCallback(async (userId: string, limit: number): Promise<Product[]> => {
    try {
      const preferences = await getUserPreferences(userId);
      
      if (!preferences) {
        return getNewUserRecommendations(limit);
      }

      // ✅ MATCHES FLUTTER: Single optimized query using whereIn
      const q = query(
        collection(db, "shop_products"),
        where("category", "in", preferences.topCategories.slice(0, 10)),
        where("quantity", ">", 0),
        orderBy("quantity"),
        orderBy("rankingScore", "desc"),
        firestoreLimit(BATCH_SIZE)
      );

      const snapshot = await getDocs(q);
      const products = snapshot.docs.map(doc => convertDocumentToProduct(doc));

      // ✅ MATCHES FLUTTER: Sort by category preference scores
      products.sort((a, b) => {
        const aScore = preferences.finalScores[a.category] || 0;
        const bScore = preferences.finalScores[b.category] || 0;
        if (aScore !== bScore) return bScore - aScore;

        // Secondary sort by ranking score
        const aRank = a.rankingScore || 0;
        const bRank = b.rankingScore || 0;
        return bRank - aRank;
      });

      return products;
    } catch (e) {
      console.error('Error in personalized recommendations:', e);
      return getNewUserRecommendations(limit);
    }
  }, [getUserPreferences]);

  // ✅ MATCHES FLUTTER: New user recommendations
  const getNewUserRecommendations = useCallback(async (limit: number): Promise<Product[]> => {
    try {
      const q = query(
        collection(db, "shop_products"),
        where("quantity", ">", 0),
        orderBy("quantity"),
        orderBy("rankingScore", "desc"),
        firestoreLimit(BATCH_SIZE)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (e) {
      console.error('Error in new user recommendations:', e);
      return [];
    }
  }, []);

  // ✅ MATCHES FLUTTER: Generic recommendations for non-authenticated users
  const getGenericRecommendations = useCallback(async (limit: number): Promise<Product[]> => {
    try {
      const q = query(
        collection(db, "shop_products"),
        where("quantity", ">", 0),
        orderBy("quantity"),
        orderBy("purchaseCount", "desc"),
        firestoreLimit(BATCH_SIZE)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (e) {
      console.error('Error in generic recommendations:', e);
      return getFallbackRecommendations(limit);
    }
  }, []);

  // ✅ MATCHES FLUTTER: Fallback recommendations
  const getFallbackRecommendations = useCallback(async (limit: number): Promise<Product[]> => {
    try {
      const q = query(
        collection(db, "shop_products"),
        orderBy("createdAt", "desc"),
        firestoreLimit(limit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (e) {
      console.error('Fallback failed:', e);
      return [];
    }
  }, []);

  // ✅ MATCHES FLUTTER: Main fetch method
  const fetchRecommendations = useCallback(async (
    options: { limit?: number; forceRefresh?: boolean } = {}
  ): Promise<void> => {
    const { limit = 20, forceRefresh = false } = options;

    // ✅ MATCHES FLUTTER: Skip if recently fetched (unless forced)
    if (
      !forceRefresh &&
      lastFetchRef.current &&
      Date.now() - lastFetchRef.current.getTime() < CACHE_EXPIRY &&
      recommendations.length > 0
    ) {
      console.log(`Using cached recommendations (${recommendations.length} items)`);
      return;
    }

    if (isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      let products: Product[];

      if (user) {
        products = await getPersonalizedRecommendations(user.uid, limit);
      } else {
        products = await getGenericRecommendations(limit);
      }

      // ✅ MATCHES FLUTTER: Remove duplicates
      products = removeDuplicates(products);

      // ✅ MATCHES FLUTTER: Supplement with generic if too few results
      if (products.length < limit) {
        const supplemental = await getGenericRecommendations(limit - products.length);
        products.push(...removeDuplicates(supplemental));
      }

      const finalProducts = products.slice(0, limit);
      
      setRecommendations(finalProducts);
      lastFetchRef.current = new Date();
      setError(null);

      // ✅ MATCHES FLUTTER: Track shown products
      shownProductIdsRef.current.clear();
      finalProducts.forEach(p => shownProductIdsRef.current.add(p.id));

      console.log(`Fetched ${finalProducts.length} personalized recommendations`);
    } catch (e) {
      console.error('Error fetching recommendations:', e);
      setError('Failed to load recommendations');

      // ✅ MATCHES FLUTTER: Keep existing recommendations on error
      if (recommendations.length === 0) {
        const fallback = await getFallbackRecommendations(limit);
        setRecommendations(fallback);
      }
    } finally {
      setIsLoading(false);
    }
  }, [
    user,
    isLoading,
    recommendations.length,
    getPersonalizedRecommendations,
    getGenericRecommendations,
    removeDuplicates,
    getFallbackRecommendations,
  ]);

  // ✅ MATCHES FLUTTER: Refresh method
  const refresh = useCallback(async (): Promise<void> => {
    lastFetchRef.current = null;
    await fetchRecommendations({ forceRefresh: true });
  }, [fetchRecommendations]);

  // ✅ OPTIMIZED: Memoized context value to prevent unnecessary re-renders
  const contextValue = useMemo<PersonalizedRecommendationsContextType>(() => ({
    recommendations,
    isLoading,
    error,
    hasRecommendations,
    fetchRecommendations,
    refresh,
  }), [recommendations, isLoading, error, hasRecommendations, fetchRecommendations, refresh]);

  return (
    <PersonalizedRecommendationsContext.Provider value={contextValue}>
      {children}
    </PersonalizedRecommendationsContext.Provider>
  );
};