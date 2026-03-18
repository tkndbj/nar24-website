"use client";

import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  deleteDoc,
  doc,
  getDocs,
  writeBatch,
  limit,
  QueryDocumentSnapshot,
  addDoc,
  serverTimestamp
} from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { trackReads, trackWrites } from "@/lib/firestore-read-tracker";

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
  isDeletingEntry: (docId: string) => boolean;
  insertLocalEntry: (entry: SearchEntry) => void;
  deleteEntry: (docId: string) => Promise<void>;
  deleteAllForCurrentUser: () => Promise<void>;
  clearHistory: () => void;
  saveSearchTerm: (searchTerm: string) => Promise<void>;
  /** Fetch latest history on demand (e.g. when search bar opens). */
  fetchHistory: () => Promise<void>;
}

const SearchHistoryContext = createContext<SearchHistoryContextType | undefined>(undefined);

// Custom timeout exception class
class TimeoutException extends Error {
  constructor(message: string, public timeout: number) {
    super(`TimeoutException: ${message} after ${timeout / 1000}s`);
    this.name = 'TimeoutException';
  }
}

const HISTORY_LIMIT = 10;

interface SearchHistoryProviderProps {
  children: React.ReactNode;
  user?: User | null;
}

export const SearchHistoryProvider: React.FC<SearchHistoryProviderProps> = ({ children, user: userProp }) => {
  const [searchEntries, setSearchEntries] = useState<SearchEntry[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Track items being deleted
  const deletingEntries = useRef<Map<string, Promise<void>>>(new Map());
  const optimisticallyDeleted = useRef<Set<string>>(new Set());
  const allEntries = useRef<SearchEntry[]>([]);

  // Prevent duplicate concurrent fetches
  const fetchInFlightRef = useRef<Promise<void> | null>(null);

  // ========================================================================
  // HELPERS
  // ========================================================================

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

  // ========================================================================
  // FETCH (on-demand, one-time)
  // ========================================================================

  const fetchHistory = useCallback(async () => {
    const userId = userProp?.uid;
    if (!userId) return;

    // Deduplicate concurrent calls
    if (fetchInFlightRef.current) {
      await fetchInFlightRef.current;
      return;
    }

    setIsLoadingHistory(true);

    const promise = (async () => {
      try {
        const q = query(
          collection(db, 'searches'),
          where('userId', '==', userId),
          orderBy('timestamp', 'desc'),
          limit(HISTORY_LIMIT)
        );

        const snapshot = await getDocs(q);
        trackReads("SearchHistory", snapshot.docs.length || 1);

        const entries = snapshot.docs.map(searchEntryFromFirestore);
        allEntries.current = entries;

        // Clean up confirmed deletes
        const existingDocIds = new Set(snapshot.docs.map(d => d.id));
        const toRemove: string[] = [];
        optimisticallyDeleted.current.forEach(id => {
          if (!existingDocIds.has(id)) toRemove.push(id);
        });
        toRemove.forEach(id => optimisticallyDeleted.current.delete(id));

        updateCombinedEntries();
      } catch (error) {
        console.error('Error fetching search history:', error);
      } finally {
        setIsLoadingHistory(false);
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = promise;
    await promise;
  }, [userProp?.uid, updateCombinedEntries]);

  // ========================================================================
  // LOCAL INSERT
  // ========================================================================

  const insertLocalEntry = useCallback((entry: SearchEntry) => {
    if (userProp?.uid) {
      // Prepend and trim to keep list bounded
      allEntries.current = [entry, ...allEntries.current].slice(0, HISTORY_LIMIT);
      updateCombinedEntries();
    }
  }, [userProp?.uid, updateCombinedEntries]);

  // ========================================================================
  // SAVE SEARCH TERM
  // ========================================================================

  const saveSearchTerm = useCallback(async (searchTerm: string): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser || !searchTerm.trim()) return;

    const userId = currentUser.uid;
    const now = new Date();
    const placeholderId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Optimistic local insert
    const localEntry: SearchEntry = {
      id: placeholderId,
      searchTerm: searchTerm.trim(),
      timestamp: now,
      userId: userId,
    };

    insertLocalEntry(localEntry);

    try {
      await addDoc(collection(db, 'searches'), {
        userId: userId,
        searchTerm: searchTerm.trim(),
        timestamp: serverTimestamp(),
      });
      trackWrites("SearchHistory", 1);
    } catch (error) {
      console.error('Error saving search term:', error);
      // Rollback placeholder
      allEntries.current = allEntries.current.filter(e => e.id !== placeholderId);
      updateCombinedEntries();
      throw error;
    }
  }, [insertLocalEntry, updateCombinedEntries]);

  // ========================================================================
  // DELETE
  // ========================================================================

  const clearHistory = useCallback(() => {
    allEntries.current = [];
    setSearchEntries([]);
    setIsLoadingHistory(false);
    deletingEntries.current.clear();
    optimisticallyDeleted.current.clear();
  }, []);

  const isDeletingEntry = useCallback((docId: string): boolean => {
    return deletingEntries.current.has(docId);
  }, []);

  const deleteFromFirestore = useCallback(async (docId: string): Promise<void> => {
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        await deleteDoc(doc(db, 'searches', docId));
        trackWrites("SearchHistory", 1);
        return;
      } catch (error) {
        retryCount++;
        if (retryCount >= maxRetries) throw error;
        console.log(`Delete attempt ${retryCount} failed, retrying:`, error);
        await new Promise(resolve => setTimeout(resolve, 200 * retryCount));
      }
    }
  }, []);

  const performDelete = useCallback(async (docId: string): Promise<void> => {
    try {
      // Optimistic hide
      optimisticallyDeleted.current.add(docId);
      updateCombinedEntries();

      if (!docId.startsWith('temp_')) {
        await Promise.race([
          deleteFromFirestore(docId),
          new Promise((_, reject) =>
            setTimeout(() => reject(new TimeoutException('Delete operation timed out', 10000)), 10000)
          )
        ]);
      } else {
        allEntries.current = allEntries.current.filter(entry => entry.id !== docId);
      }
    } catch (error) {
      console.error('Error deleting search entry', docId, ':', error);
      // Rollback
      optimisticallyDeleted.current.delete(docId);
      updateCombinedEntries();
      throw error;
    }
  }, [updateCombinedEntries, deleteFromFirestore]);

  const deleteEntry = useCallback(async (docId: string): Promise<void> => {
    if (deletingEntries.current.has(docId)) {
      await deletingEntries.current.get(docId);
      return;
    }

    const deletePromise = performDelete(docId);
    deletingEntries.current.set(docId, deletePromise);

    try {
      await deletePromise;
    } finally {
      deletingEntries.current.delete(docId);
    }
  }, [performDelete]);

  const deleteAllForCurrentUser = useCallback(async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    try {
      // Optimistic clear
      allEntries.current = [];
      setSearchEntries([]);
      optimisticallyDeleted.current.clear();

      const q = query(
        collection(db, 'searches'),
        where('userId', '==', currentUser.uid)
      );

      const snapshot = await getDocs(q);
      trackReads("SearchHistory:DeleteAll", snapshot.docs.length || 1);

      const batchSize = 500;
      for (let i = 0; i < snapshot.docs.length; i += batchSize) {
        const batch = writeBatch(db);
        snapshot.docs.slice(i, i + batchSize).forEach(d => batch.delete(d.ref));
        await batch.commit();
      }
      trackWrites("SearchHistory:DeleteAll", snapshot.docs.length);
    } catch (error) {
      console.error('Error deleting all search history:', error);
      throw error;
    }
  }, []);

  // ========================================================================
  // CONTEXT
  // ========================================================================

  const contextValue: SearchHistoryContextType = {
    searchEntries,
    isLoadingHistory,
    isDeletingEntry,
    insertLocalEntry,
    deleteEntry,
    deleteAllForCurrentUser,
    clearHistory,
    saveSearchTerm,
    fetchHistory,
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
