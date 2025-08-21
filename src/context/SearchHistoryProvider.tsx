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
  DocumentSnapshot,
  QueryDocumentSnapshot,
  Unsubscribe 
} from 'firebase/firestore';
import { User, onAuthStateChanged } from 'firebase/auth';
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

export const SearchHistoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // State variables matching Flutter implementation
  const [searchEntriesSearches, setSearchEntriesSearches] = useState<SearchEntry[]>([]);
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Track items being deleted with more granular control
  const deletingEntries = useRef<Map<string, Promise<void>>>(new Map());
  const optimisticallyDeleted = useRef<Set<string>>(new Set());
  const lastDocument = useRef<QueryDocumentSnapshot | null>(null);

  // Subscription references
  const historyUnsubscribe = useRef<Unsubscribe | null>(null);
  const authUnsubscribe = useRef<Unsubscribe | null>(null);

  // Initialize auth listener on mount
  useEffect(() => {
    initAuthListener();
    
    return () => {
      // Cleanup on unmount
      historyUnsubscribe.current?.();
      authUnsubscribe.current?.();
      deletingEntries.current.clear();
      optimisticallyDeleted.current.clear();
    };
  }, []);

  const initAuthListener = useCallback(() => {
    // Check current user immediately when provider is created
    const currentUser = auth.currentUser;
    const newUserId = currentUser?.uid || null;
    setCurrentUserId(newUserId);

    if (newUserId) {
      setIsLoadingHistory(true);
      fetchSearchHistory(newUserId);
    } else {
      clearHistory(); // Clear immediately if no user
    }

    // Then listen for future auth changes
    authUnsubscribe.current = onAuthStateChanged(auth, (user: User | null) => {
      const newUserId = user?.uid || null;

      // If user changed (login/logout/switch), clear and reload
      if (newUserId !== currentUserId) {
        setCurrentUserId(newUserId);

        if (newUserId) {
          setIsLoadingHistory(true);
          resetPagination();
          fetchSearchHistory(newUserId);
        } else {
          clearHistory();
        }
      }
    });
  }, [currentUserId]);

  const resetPagination = useCallback(() => {
    lastDocument.current = null;
    setHasMoreHistory(true);
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
        setSearchEntriesSearches(entries);
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
  }, []);

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
        setSearchEntriesSearches(prev => [...prev, ...newEntries]);
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
  }, [currentUserId, hasMoreHistory]);

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
      setSearchEntriesSearches(prev => [entry, ...prev]);
      updateCombinedEntries();
    }
  }, [currentUserId]);

  const updateCombinedEntries = useCallback(() => {
    // This needs to be called after state updates, so we use a callback
    setSearchEntriesSearches(currentSearches => {
      // Filter out optimistically deleted entries
      const filteredEntries = currentSearches.filter(
        entry => !optimisticallyDeleted.current.has(entry.id)
      );

      const combinedEntries = [...filteredEntries];
      const uniqueMap = new Map<string, SearchEntry>();

      combinedEntries.forEach(entry => {
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
      return currentSearches;
    });
  }, []);

  const clearHistory = useCallback(() => {
    historyUnsubscribe.current?.();
    historyUnsubscribe.current = null;
    setSearchEntriesSearches([]);
    setSearchEntries([]);
    setIsLoadingHistory(false);
    deletingEntries.current.clear();
    optimisticallyDeleted.current.clear();
    resetPagination();
  }, [resetPagination]);

  const isDeletingEntry = useCallback((docId: string): boolean => {
    return deletingEntries.current.has(docId);
  }, []);

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
  }, []);

  const performDelete = useCallback(async (docId: string): Promise<void> => {
    try {
      console.log('Starting delete operation for entry:', docId);

      // Step 1: Immediately hide from UI (optimistic update)
      optimisticallyDeleted.current.add(docId);
      updateCombinedEntries(); // This will filter out the deleted item

      // Step 2: Delete from Firestore with timeout
      await Promise.race([
        deleteFromFirestore(docId),
        new Promise((_, reject) => 
          setTimeout(() => reject(new TimeoutException('Delete operation timed out', 10000)), 10000)
        )
      ]);

      console.log('Successfully deleted search entry:', docId);
    } catch (error) {
      console.error('Error deleting search entry', docId, ':', error);

      // Rollback: restore the item in UI
      optimisticallyDeleted.current.delete(docId);
      updateCombinedEntries();

      throw error;
    }
  }, [updateCombinedEntries]);

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
  }, []);

  const deleteAllForUser = useCallback(async (userId: string): Promise<void> => {
    try {
      // Optimistically clear the UI first
      setSearchEntriesSearches([]);
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