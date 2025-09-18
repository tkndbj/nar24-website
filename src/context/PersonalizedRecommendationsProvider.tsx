// providers/PersonalizedRecommendationsProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  doc,
  getDoc,
  
  Timestamp,
  
  DocumentData,
  QueryDocumentSnapshot
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Product, ProductUtils } from "@/app/models/Product";
import { useUser } from "@/context/UserProvider";

// ============= TYPES & INTERFACES =============
interface UserPreferences {
  categoryClicks: Record<string, number>;
  subcategoryClicks: Record<string, number>;
  totalInteractions: number;
  topCategories: string[];
  topSubcategories: string[];
}

interface ScoredProduct {
  product: Product;
  score: number;
}

interface RecommendationsState {
  recommendations: Product[];
  cachedRecommendations: Product[];
  isLoading: boolean;
  error: string | null;
  lastFetchTime: Date | null;
  lastSuccessfulFetch: Date | null;
}

interface PersonalizedRecommendationsContextType extends RecommendationsState {
  fetchPersonalizedRecommendations: (options?: { limit?: number; forceRefresh?: boolean }) => Promise<Product[]>;
  refreshRecommendations: () => Promise<void>;
  clearCache: () => void;
  hasValidCache: boolean;
}

// ============= CONFIGURATION =============
const CACHE_VALIDITY = 6 * 60 * 60 * 1000; // 6 hours
const REFRESH_INTERVAL = 60 * 60 * 1000; // 1 hour
const DEBOUNCE_DELAY = 2000; // 2 seconds
const MAX_CACHE_SIZE = 100;
const MAX_RECENTLY_SHOWN = 50;
const MIN_FETCH_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ============= CONTEXT =============
const PersonalizedRecommendationsContext = createContext<PersonalizedRecommendationsContextType | undefined>(undefined);

export const usePersonalizedRecommendations = () => {
  const context = useContext(PersonalizedRecommendationsContext);
  if (!context) {
    throw new Error("usePersonalizedRecommendations must be used within PersonalizedRecommendationsProvider");
  }
  return context;
};

// ============= PROVIDER COMPONENT =============
export const PersonalizedRecommendationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [state, setState] = useState<RecommendationsState>({
    recommendations: [],
    cachedRecommendations: [],
    isLoading: false,
    error: null,
    lastFetchTime: null,
    lastSuccessfulFetch: null,
  });

  // User tracking state
  const [categoryScores, setCategoryScores] = useState<Record<string, number>>({});
  const [subcategoryScores, setSubcategoryScores] = useState<Record<string, number>>({});
  const [recentlyShownIds, setRecentlyShownIds] = useState<Set<string>>(new Set());
  const [productLastShown, setProductLastShown] = useState<Map<string, Date>>(new Map());

  // Refs for timers
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const refreshTimer = useRef<NodeJS.Timeout | null>(null);
  const fetchAttempts = useRef(0);
  const isMounted = useRef(true);

  // ============= COMPUTED VALUES =============
  const hasValidCache = useMemo(() => {
    return !!(
      state.lastSuccessfulFetch &&
      Date.now() - state.lastSuccessfulFetch.getTime() < CACHE_VALIDITY
    );
  }, [state.lastSuccessfulFetch]);

  const recommendations = useMemo(() => {
    return state.recommendations.length > 0 
      ? state.recommendations 
      : state.cachedRecommendations;
  }, [state.recommendations, state.cachedRecommendations]);

  // ============= HELPER FUNCTIONS =============
  const shouldFetch = useCallback((forceRefresh: boolean): boolean => {
    if (forceRefresh) return true;
    if (state.isLoading) return false;
    if (state.recommendations.length === 0 && state.cachedRecommendations.length === 0) return true;
    
    if (!state.lastFetchTime) return true;
    const timeSinceFetch = Date.now() - state.lastFetchTime.getTime();
    
    if (timeSinceFetch < MIN_FETCH_INTERVAL) return false;
    return timeSinceFetch > REFRESH_INTERVAL;
  }, [state.isLoading, state.recommendations, state.cachedRecommendations, state.lastFetchTime]);

  const calculateWeightedScores = (clicks: Record<string, number>): Record<string, number> => {
    const scores: Record<string, number> = {};
    const total = Object.values(clicks).reduce((a, b) => a + b, 0);
    
    if (total === 0) return scores;
    
    for (const [key, value] of Object.entries(clicks)) {
      scores[key] = Math.log(value + 1) / Math.log(total + 1);
    }
    
    return scores;
  };

  const getTopItems = (items: Record<string, number>, count: number): string[] => {
    return Object.entries(items)
      .filter(([key]) => key !== 'Unknown')
      .sort(([, a], [, b]) => b - a)
      .slice(0, count)
      .map(([key]) => key);
  };

  const wasRecentlyShown = (productId: string): boolean => {
    const lastShown = productLastShown.get(productId);
    if (!lastShown) return false;
    return Date.now() - lastShown.getTime() < 24 * 60 * 60 * 1000; // 24 hours
  };

  // ============= USER PREFERENCES =============
  const loadUserPreferences = async (userId: string): Promise<UserPreferences> => {
    try {
      const prefsRef = collection(db, "users", userId, "preferences");
      const [categoryDoc, subcategoryDoc] = await Promise.all([
        getDoc(doc(prefsRef, "categoryClicks")),
        getDoc(doc(prefsRef, "subcategoryClicks"))
      ]);

      const categoryClicks = (categoryDoc.data() || {}) as Record<string, number>;
      const subcategoryClicks = (subcategoryDoc.data() || {}) as Record<string, number>;

      setCategoryScores(calculateWeightedScores(categoryClicks));
      setSubcategoryScores(calculateWeightedScores(subcategoryClicks));

      const totalInteractions = Object.values(categoryClicks).reduce((a, b) => a + b, 0);

      return {
        categoryClicks,
        subcategoryClicks,
        totalInteractions,
        topCategories: getTopItems(categoryClicks, 5),
        topSubcategories: getTopItems(subcategoryClicks, 7),
      };
    } catch (error) {
      console.error("Error loading preferences:", error);
      return {
        categoryClicks: {},
        subcategoryClicks: {},
        totalInteractions: 0,
        topCategories: [],
        topSubcategories: [],
      };
    }
  };

  // ============= HELPER FUNCTION =============
  const convertDocumentToProduct = (doc: QueryDocumentSnapshot<DocumentData>): Product => {
    const data = doc.data();
    return ProductUtils.fromJson({
      ...data,
      id: doc.id,
      reference: doc.ref ? {
        id: doc.ref.id,
        path: doc.ref.path,
        parent: {
          id: doc.ref.parent?.id || ''
        }
      } : undefined
    });
  };

  // ============= FETCH STRATEGIES =============
  const fetchCategoryBased = async (preferences: UserPreferences, fetchLimit: number): Promise<Product[]> => {
    if (preferences.topCategories.length === 0) return [];

    try {
      const q = query(
        collection(db, "shop_products"),
        where("category", "in", preferences.topCategories.slice(0, 10)),
        where("quantity", ">", 0),
        orderBy("quantity"),
        orderBy("rankingScore", "desc"),
        limit(fetchLimit * 2)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (error) {
      console.error("Error in fetchCategoryBased:", error);
      return [];
    }
  };

  const fetchTrending = async (categories: string[], fetchLimit: number): Promise<Product[]> => {
    if (categories.length === 0) return [];

    try {
      const q = query(
        collection(db, "shop_products"),
        where("category", "in", categories.slice(0, 10)),
        where("dailyClickCount", ">", 5),
        orderBy("dailyClickCount", "desc"),
        limit(fetchLimit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (error) {
      console.error("Error in fetchTrending:", error);
      return [];
    }
  };

  const fetchCollaborative = async (preferences: UserPreferences, fetchLimit: number): Promise<Product[]> => {
    if (preferences.topCategories.length === 0) return [];

    try {
      const q = query(
        collection(db, "shop_products"),
        where("category", "in", preferences.topCategories.slice(0, 3)),
        where("purchaseCount", ">", 5),
        where("averageRating", ">", 4),
        orderBy("purchaseCount", "desc"),
        orderBy("averageRating", "desc"),
        limit(fetchLimit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (error) {
      console.error("Error in fetchCollaborative:", error);
      return [];
    }
  };

  const fetchExploration = async (fetchLimit: number): Promise<Product[]> => {
    const cutoffDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    try {
      const q = query(
        collection(db, "shop_products"),
        where("createdAt", ">", Timestamp.fromDate(cutoffDate)),
        where("quantity", ">", 0),
        orderBy("createdAt", "desc"),
        orderBy("rankingScore", "desc"),
        limit(fetchLimit)
      );

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (error) {
      console.error("Error in fetchExploration:", error);
      return [];
    }
  };

  const fetchUnauthenticatedRecommendations = async (fetchLimit: number): Promise<Product[]> => {
    try {
      const strategies = await Promise.all([
        getDocs(query(
          collection(db, "shop_products"),
          where("quantity", ">", 0),
          where("rankingScore", ">", 0.7),
          orderBy("rankingScore", "desc"),
          orderBy("quantity", "desc"),
          limit(Math.ceil(fetchLimit * 0.4))
        )),
        getDocs(query(
          collection(db, "shop_products"),
          where("quantity", ">", 0),
          where("dailyClickCount", ">", 5),
          orderBy("dailyClickCount", "desc"),
          orderBy("quantity", "desc"),
          limit(Math.ceil(fetchLimit * 0.3))
        )),
        getDocs(query(
          collection(db, "shop_products"),
          where("quantity", ">", 0),
          where("purchaseCount", ">", 5),
          orderBy("purchaseCount", "desc"),
          orderBy("quantity", "desc"),
          limit(Math.ceil(fetchLimit * 0.3))
        ))
      ]);

      const products: Product[] = [];
      const seen = new Set<string>();

      for (const snapshot of strategies) {
        for (const doc of snapshot.docs) {
          const product = convertDocumentToProduct(doc);
          if (!seen.has(product.id)) {
            seen.add(product.id);
            products.push(product);
          }
        }
      }

      // Shuffle for variety
      return products.sort(() => Math.random() - 0.5).slice(0, fetchLimit);
    } catch (error) {
      console.error("Error in unauthenticated recommendations:", error);
      return fetchFallbackProducts(fetchLimit);
    }
  };

  const fetchFallbackProducts = async (fetchLimit: number): Promise<Product[]> => {
    try {
      const snapshot = await getDocs(
        query(
          collection(db, "shop_products"),
          limit(fetchLimit)
        )
      );
      
      return snapshot.docs.map(doc => convertDocumentToProduct(doc));
    } catch (error) {
      console.error("Critical error in fallback:", error);
      return [];
    }
  };

  // ============= SMART DIVERSIFICATION =============
  const applySmartDiversification = (products: Product[], fetchLimit: number): Product[] => {
    if (products.length <= fetchLimit) return products;

    const diversified: Product[] = [];
    const categoryCount: Record<string, number> = {};
    const subcategoryCount: Record<string, number> = {};

    for (const product of products) {
      if (diversified.length >= fetchLimit) break;

      const cat = product.category || 'Unknown';
      const subcat = `${cat}_${product.subcategory || 'Unknown'}`;

      if (wasRecentlyShown(product.id)) continue;
      if ((categoryCount[cat] || 0) >= 5) continue;
      if ((subcategoryCount[subcat] || 0) >= 3) continue;

      diversified.push(product);
      categoryCount[cat] = (categoryCount[cat] || 0) + 1;
      subcategoryCount[subcat] = (subcategoryCount[subcat] || 0) + 1;
    }

    // Fill remaining slots
    if (diversified.length < fetchLimit) {
      for (const product of products) {
        if (!diversified.find(p => p.id === product.id)) {
          diversified.push(product);
          if (diversified.length >= fetchLimit) break;
        }
      }
    }

    return diversified;
  };

  // ============= MAIN FETCH METHOD =============
  const performFetch = async (fetchLimit: number): Promise<Product[]> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      fetchAttempts.current++;

      let results: Product[];

      if (!user) {
        results = await fetchUnauthenticatedRecommendations(fetchLimit);
      } else {
        const preferences = await loadUserPreferences(user.uid);

        if (preferences.totalInteractions < 3) {
          // New user - fetch diverse popular products
          results = await fetchUnauthenticatedRecommendations(fetchLimit);
        } else {
          // Experienced user - use weighted strategies
          const strategies = await Promise.all([
            fetchCategoryBased(preferences, Math.ceil(fetchLimit * 0.4)),
            fetchTrending(preferences.topCategories, Math.ceil(fetchLimit * 0.25)),
            fetchCollaborative(preferences, Math.ceil(fetchLimit * 0.2)),
            fetchExploration(Math.ceil(fetchLimit * 0.15))
          ]);

          // Merge and score
          const scoredProducts = new Map<string, ScoredProduct>();
          const weights = [0.4, 0.25, 0.2, 0.15];

          for (let i = 0; i < strategies.length; i++) {
            for (const product of strategies[i]) {
              if (!scoredProducts.has(product.id)) {
                scoredProducts.set(product.id, { product, score: 0 });
              }
              const scored = scoredProducts.get(product.id)!;
              scored.score += weights[i];
            }
          }

          // Sort by score
          const sorted = Array.from(scoredProducts.values())
            .sort((a, b) => b.score - a.score)
            .map(sp => sp.product);

          results = applySmartDiversification(sorted, fetchLimit);
        }

        // Update recently shown tracking
        const now = new Date();
        for (const product of results) {
          setRecentlyShownIds(prev => new Set([...prev, product.id]));
          setProductLastShown(prev => new Map(prev).set(product.id, now));
        }
      }

      // Update state
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          recommendations: results,
          cachedRecommendations: [...results],
          lastFetchTime: new Date(),
          lastSuccessfulFetch: new Date(),
          isLoading: false,
        }));
      }

      fetchAttempts.current = 0;
      return results;

    } catch (error) {
      console.error("Error fetching recommendations:", error);
      
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          error: "Failed to load recommendations",
          isLoading: false,
        }));
      }

      // Use cached recommendations if available
      if (state.cachedRecommendations.length > 0) {
        return state.cachedRecommendations;
      }

      // Last resort - fetch fallback
      const fallback = await fetchFallbackProducts(fetchLimit);
      if (isMounted.current) {
        setState(prev => ({
          ...prev,
          recommendations: fallback,
          isLoading: false,
        }));
      }
      return fallback;
    }
  };

  const fetchPersonalizedRecommendations = useCallback(async (
    options: { limit?: number; forceRefresh?: boolean } = {}
  ): Promise<Product[]> => {
    const { limit = 20, forceRefresh = false } = options;

    if (!shouldFetch(forceRefresh)) {
      return recommendations;
    }

    // Debounce multiple calls
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    return new Promise((resolve) => {
      debounceTimer.current = setTimeout(async () => {
        const results = await performFetch(limit);
        resolve(results);
      }, DEBOUNCE_DELAY);
    });
  }, [shouldFetch, recommendations]);

  const refreshRecommendations = useCallback(async (): Promise<void> => {
    await fetchPersonalizedRecommendations({ forceRefresh: true });
  }, [fetchPersonalizedRecommendations]);

  const clearCache = useCallback((): void => {
    setState(prev => ({
      ...prev,
      cachedRecommendations: [],
      lastSuccessfulFetch: null,
    }));
  }, []);

  // ============= EFFECTS =============
  useEffect(() => {
    // Initial fetch
    if (!state.lastFetchTime && !state.isLoading) {
      fetchPersonalizedRecommendations();
    }

    // Setup periodic refresh
    refreshTimer.current = setInterval(() => {
      if (!hasValidCache) {
        fetchPersonalizedRecommendations();
      }
    }, REFRESH_INTERVAL);

    return () => {
      isMounted.current = false;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, []);

  // Handle user changes
  useEffect(() => {
    if (user?.uid) {
      // User logged in or changed - fetch new recommendations
      fetchPersonalizedRecommendations({ forceRefresh: true });
    } else {
      // User logged out - clear personalized data
      setCategoryScores({});
      setSubcategoryScores({});
      setRecentlyShownIds(new Set());
      setProductLastShown(new Map());
    }
  }, [user?.uid]);

  const contextValue: PersonalizedRecommendationsContextType = {
    ...state,
    recommendations,
    hasValidCache,
    fetchPersonalizedRecommendations,
    refreshRecommendations,
    clearCache,
  };

  return (
    <PersonalizedRecommendationsContext.Provider value={contextValue}>
      {children}
    </PersonalizedRecommendationsContext.Provider>
  );
};