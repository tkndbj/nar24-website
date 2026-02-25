"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  limit,
  startAfter,
  QueryDocumentSnapshot,
  Unsubscribe,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';

// SearchEntry interface to match your Flutter model
export interface SearchEntry {
  id: string;
  searchTerm: string;
  timestamp: Date | null;
  userId: string;
}

// Helper to convert Firestore document to SearchEntry
const searchEntryFromFirestore = (doc: QueryDocumentSnapshot): SearchEntry => {
  const data = doc.data();
  return {
    id: doc.id,
    searchTerm: data.searchTerm || '',
    timestamp: data.timestamp?.toDate() || null,
    userId: data.userId || '',
  };
};

interface SearchHistoryContextType {
  searchEntries: SearchEntry[];
  isLoadingHistory: boolean;
  hasMoreHistory: boolean;
  isDeletingEntry: (docId: string) => boolean;
  insertLocalEntry: (entry: SearchEntry) => void;
  deleteEntry: (docId: string) => Promise<void>;
  deleteAllForCurrentUser: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  clearHistory: () => void;
  // NEW: Save search term functionality
  saveSearchTerm: (searchTerm: string) => Promise<void>;
}

const SearchHistoryContext = createContext<SearchHistoryContextType | undefined>(undefined);

// Custom timeout exception class
class TimeoutException extends Error {
  constructor(message: string, public timeout: number) {
    super(`TimeoutException: ${message} after ${timeout / 1000}s`);
    this.name = 'TimeoutException';
  }
}

const INITIAL_LOAD_LIMIT = 20;
const PAGINATION_LIMIT = 10;

interface SearchHistoryProviderProps {
  children: React.ReactNode;
  user?: User | null; // Optional: Accept user from parent to avoid duplicate auth listener
}

export const SearchHistoryProvider: React.FC<SearchHistoryProviderProps> = ({ children, user: userProp }) => {
  // Core state for search entries
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Track items being deleted with more granular control
  const deletingEntries = useRef<Map<string, Promise<void>>>(new Map());
  const optimisticallyDeleted = useRef<Set<string>>(new Set());
  const lastDocument = useRef<QueryDocumentSnapshot | null>(null);
  const allEntries = useRef<SearchEntry[]>([]);

  // Subscription references
  const historyUnsubscribe = useRef<Unsubscribe | null>(null);
  // Note: authUnsubscribe removed - we now use user prop from parent

  // Track if user prop is being used
  const usingUserProp = userProp !== undefined;

  const resetPagination = useCallback(() => {
    lastDocument.current = null;
    setHasMoreHistory(true);
    allEntries.current = [];
  }, []);

  const fetchSearchHistory = useCallback((userId: string) => {
    // Cancel previous subscription
    historyUnsubscribe.current?.();

    const q = query(
      collection(db, 'searches'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(INITIAL_LOAD_LIMIT)
    );

    historyUnsubscribe.current = onSnapshot(
      q,
      (snapshot) => {
        const entries = snapshot.docs.map(searchEntryFromFirestore);
        allEntries.current = entries;
        setIsLoadingHistory(false);
        
        // Update pagination state
        if (snapshot.docs.length > 0) {
          lastDocument.current = snapshot.docs[snapshot.docs.length - 1];
          setHasMoreHistory(snapshot.docs.length === INITIAL_LOAD_LIMIT);
        } else {
          setHasMoreHistory(false);
        }

        // Remove any optimistically deleted items that are confirmed deleted
        const existingDocIds = new Set(snapshot.docs.map(doc => doc.id));
        cleanupOptimisticDeletes(existingDocIds);

        updateCombinedEntries();
      },
      (error) => {
        console.error('Error fetching search history:', error);
        setIsLoadingHistory(false);
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // cleanupOptimisticDeletes, updateCombinedEntries omitted - defined below

  const loadMoreHistory = useCallback(async (): Promise<void> => {
    if (!currentUserId || !hasMoreHistory || !lastDocument.current) {
      return;
    }

    try {
      const q = query(
        collection(db, 'searches'),
        where('userId', '==', currentUserId),
        orderBy('timestamp', 'desc'),
        startAfter(lastDocument.current),
        limit(PAGINATION_LIMIT)
      );

      const snapshot = await getDocs(q);
      const newEntries = snapshot.docs.map(searchEntryFromFirestore);

      if (newEntries.length > 0) {
        allEntries.current = [...allEntries.current, ...newEntries];
        lastDocument.current = snapshot.docs[snapshot.docs.length - 1];
        setHasMoreHistory(snapshot.docs.length === PAGINATION_LIMIT);
      } else {
        setHasMoreHistory(false);
      }

      updateCombinedEntries();
    } catch (error) {
      console.error('Error loading more search history:', error);
      setHasMoreHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, hasMoreHistory]); // updateCombinedEntries omitted - defined below

  const cleanupOptimisticDeletes = useCallback((existingDocIds: Set<string>) => {
    // Remove optimistically deleted items that are confirmed deleted from Firestore
    const toRemove: string[] = [];
    optimisticallyDeleted.current.forEach(id => {
      if (!existingDocIds.has(id)) {
        toRemove.push(id);
      }
    });
    
    toRemove.forEach(id => {
      optimisticallyDeleted.current.delete(id);
    });
  }, []);

  const insertLocalEntry = useCallback((entry: SearchEntry) => {
    // Only insert if we have a current user
    if (currentUserId) {
      allEntries.current = [entry, ...allEntries.current];
      updateCombinedEntries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId]); // updateCombinedEntries omitted - defined below

  const updateCombinedEntries = useCallback(() => {
    // Filter out optimistically deleted entries
    const filteredEntries = allEntries.current.filter(
      entry => !optimisticallyDeleted.current.has(entry.id)
    );

    // Remove duplicates based on search term, keeping the most recent
    const uniqueMap = new Map<string, SearchEntry>();
    filteredEntries.forEach(entry => {
      if (!uniqueMap.has(entry.searchTerm)) {
        uniqueMap.set(entry.searchTerm, entry);
      }
    });

    const uniqueEntries = Array.from(uniqueMap.values()).sort((a, b) => {
      const timeA = a.timestamp || new Date(0);
      const timeB = b.timestamp || new Date(0);
      return timeB.getTime() - timeA.getTime();
    });

    setSearchEntries(uniqueEntries);
  }, []);

  const clearHistory = useCallback(() => {
    historyUnsubscribe.current?.();
    historyUnsubscribe.current = null;
    allEntries.current = [];
    setSearchEntries([]);
    setIsLoadingHistory(false);
    deletingEntries.current.clear();
    optimisticallyDeleted.current.clear();
    resetPagination();
  }, [resetPagination]);

  const isDeletingEntry = useCallback((docId: string): boolean => {
    return deletingEntries.current.has(docId);
  }, []);

  // NEW: Save search term functionality (matches Flutter implementation)
  const saveSearchTerm = useCallback(async (searchTerm: string): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser || !searchTerm.trim()) return;

    const userId = currentUser.uid;
    const now = new Date();
    const placeholderId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Step 1: Insert local entry immediately for instant UI feedback
    const localEntry: SearchEntry = {
      id: placeholderId,
      searchTerm: searchTerm.trim(),
      timestamp: now,
      userId: userId,
    };

    insertLocalEntry(localEntry);

    try {
      // Step 2: Save to Firestore
      await addDoc(collection(db, 'searches'), {
        userId: userId,
        searchTerm: searchTerm.trim(),
        timestamp: serverTimestamp(),
      });

      console.log('Successfully saved search term:', searchTerm);
      
      // The real-time listener will automatically update with the server version
      // and remove the placeholder
    } catch (error) {
      console.error('Error saving search term:', error);

      // Step 3: Rollback - remove the placeholder entry on error
      await deleteEntry(placeholderId);

      // Re-throw to let calling code handle the error
      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertLocalEntry]); // deleteEntry omitted - defined below

  const deleteEntry = useCallback(async (docId: string): Promise<void> => {
    // If already deleting, wait for that operation to complete
    if (deletingEntries.current.has(docId)) {
      console.log('Delete already in progress for entry:', docId, 'waiting...');
      await deletingEntries.current.get(docId);
      return;
    }

    // Create a promise for this delete operation
    const deletePromise = performDelete(docId);
    deletingEntries.current.set(docId, deletePromise);

    try {
      await deletePromise;
    } finally {
      deletingEntries.current.delete(docId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // performDelete omitted - defined below

  const performDelete = useCallback(async (docId: string): Promise<void> => {
    try {
      console.log('Starting delete operation for entry:', docId);

      // Step 1: Immediately hide from UI (optimistic update)
      optimisticallyDeleted.current.add(docId);
      updateCombinedEntries(); // This will filter out the deleted item

      // Step 2: Delete from Firestore with timeout
      // Handle both real docs and local placeholder entries
      if (!docId.startsWith('temp_')) {
        await Promise.race([
          deleteFromFirestore(docId),
          new Promise((_, reject) => 
            setTimeout(() => reject(new TimeoutException('Delete operation timed out', 10000)), 10000)
          )
        ]);
      } else {
        // For placeholder entries, just remove from local state
        allEntries.current = allEntries.current.filter(entry => entry.id !== docId);
      }

      console.log('Successfully deleted search entry:', docId);
    } catch (error) {
      console.error('Error deleting search entry', docId, ':', error);

      // Rollback: restore the item in UI
      optimisticallyDeleted.current.delete(docId);
      updateCombinedEntries();

      throw error;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCombinedEntries]); // deleteFromFirestore omitted - defined below

  const deleteFromFirestore = useCallback(async (docId: string): Promise<void> => {
    // Retry logic for network issues
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        await deleteDoc(doc(db, 'searches', docId));
        return; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) {
          throw error; // Give up after max retries
        }

        console.log(`Delete attempt ${retryCount} failed, retrying:`, error);
        // Wait before retrying (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 200 * retryCount));
      }
    }
  }, []);

  const deleteAllForCurrentUser = useCallback(async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      await deleteAllForUser(currentUser.uid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // deleteAllForUser omitted - defined below

  const deleteAllForUser = useCallback(async (userId: string): Promise<void> => {
    try {
      // Optimistically clear the UI first
      allEntries.current = [];
      setSearchEntries([]);
      optimisticallyDeleted.current.clear();
      resetPagination();

      // Then delete from Firestore
      const q = query(
        collection(db, 'searches'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      const docs = snapshot.docs;

      const batchSize = 500;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const batchDocs = docs.slice(i, i + batchSize);
        
        batchDocs.forEach(docSnapshot => {
          batch.delete(docSnapshot.ref);
        });
        
        await batch.commit();
      }

      console.log('Successfully deleted all search history for user:', userId);
    } catch (error) {
      console.error('Error deleting all search history:', error);
      // The Firestore listener will restore the correct state
      throw error;
    }
  }, [resetPagination]);

  // Handle user prop changes (optimized - uses user prop when provided)
  useEffect(() => {
    // Capture ref values for cleanup
    const deletingRef = deletingEntries.current;
    const optimisticRef = optimisticallyDeleted.current;

    // Determine user ID - prefer prop, fallback to auth.currentUser
    const effectiveUserId = usingUserProp ? (userProp?.uid || null) : (auth.currentUser?.uid || null);

    // Skip if user hasn't changed
    if (effectiveUserId === currentUserId) {
      return;
    }

    console.log('🔧 SearchHistoryProvider: User changed:', effectiveUserId || 'logged out');
    setCurrentUserId(effectiveUserId);

    if (effectiveUserId) {
      setIsLoadingHistory(true);
      resetPagination();
      // Defer listener setup to avoid blocking initial paint
      let deferredId: number | ReturnType<typeof setTimeout>;
      if (typeof requestIdleCallback !== "undefined") {
        deferredId = requestIdleCallback(
          () => fetchSearchHistory(effectiveUserId),
          { timeout: 3000 }
        );
      } else {
        deferredId = setTimeout(
          () => fetchSearchHistory(effectiveUserId),
          1000
        );
      }

      return () => {
        if (typeof cancelIdleCallback !== "undefined") {
          cancelIdleCallback(deferredId as number);
        } else {
          clearTimeout(deferredId as ReturnType<typeof setTimeout>);
        }
        historyUnsubscribe.current?.();
        historyUnsubscribe.current = null;
        deletingRef.clear();
        optimisticRef.clear();
      };
    } else {
      clearHistory();
    }

    return () => {
      // Cleanup on unmount
      historyUnsubscribe.current?.();
      historyUnsubscribe.current = null;
      deletingRef.clear();
      optimisticRef.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userProp, usingUserProp]); // Dependencies minimized to avoid re-running

  const contextValue: SearchHistoryContextType = {
    searchEntries,
    isLoadingHistory,
    hasMoreHistory,
    isDeletingEntry,
    insertLocalEntry,
    deleteEntry,
    deleteAllForCurrentUser,
    loadMoreHistory,
    clearHistory,
    saveSearchTerm, // NEW
  };

  return (
    <SearchHistoryContext.Provider value={contextValue}>
      {children}
    </SearchHistoryContext.Provider>
  );
};

export const useSearchHistory = (): SearchHistoryContextType => {
  const context = useContext(SearchHistoryContext);
  if (context === undefined) {
    throw new Error('useSearchHistory must be used within a SearchHistoryProvider');
  }
  return context;
};