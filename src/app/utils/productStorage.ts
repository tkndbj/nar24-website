// utils/productStorage.ts
export interface ProductData {
  title: string;
  description: string;
  price: string;
  quantity: string;
  condition: string;
  deliveryOption: string;
  category: string;
  subcategory: string;
  subsubcategory: string;
  brand: string;
  attributes: { [key: string]: string | string[] | number | boolean };
  phone: string;
  region: string;
  address: string;
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  iban: string;
  shopId: string | null;
}

export interface ProductFiles {
  images: File[];
  video: File | null;
  selectedColorImages: {
    [key: string]: { quantity: string; image: File | null };
  };
}

export interface StoredProduct {
  id: string;
  data: ProductData;
  files: ProductFiles;
  timestamp: number;
  version: string;
}

class ProductStorageManager {
  private dbName = "ProductFormStorage";
  private storeName = "products";
  private version = 2;
  private currentProductKey = "current_product";

  async openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);

      request.onerror = () => {
        console.error("IndexedDB error:", request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = () => {
        const db = request.result;

        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: "id" });
          store.createIndex("timestamp", "timestamp", { unique: false });
        }
      };
    });
  }

  // Save current product (for form persistence)
  async saveCurrentProduct(
    data: ProductData,
    files: ProductFiles
  ): Promise<void> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      const productRecord: StoredProduct = {
        id: this.currentProductKey,
        data,
        files,
        timestamp: Date.now(),
        version: "1.0",
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(productRecord);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log("✅ Product saved to IndexedDB");
    } catch (error) {
      console.error("❌ Failed to save product:", error);
      throw error;
    }
  }

  // Get current product
  async getCurrentProduct(): Promise<StoredProduct | null> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.get(this.currentProductKey);

        request.onsuccess = () => {
          const result = request.result;
          if (result && this.isValidProduct(result)) {
            resolve(result);
          } else {
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error("Failed to get product:", request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      console.error("❌ Failed to get product:", error);
      return null;
    }
  }

  // Clear current product
  async clearCurrentProduct(): Promise<void> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      await new Promise<void>((resolve, reject) => {
        const request = store.delete(this.currentProductKey);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log("✅ Product cleared from IndexedDB");
    } catch (error) {
      console.error("❌ Failed to clear product:", error);
      throw error;
    }
  }

  // Save product draft with custom ID (for multiple drafts)
  async saveDraft(
    draftId: string,
    data: ProductData,
    files: ProductFiles
  ): Promise<void> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      const productRecord: StoredProduct = {
        id: `draft_${draftId}`,
        data,
        files,
        timestamp: Date.now(),
        version: "1.0",
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(productRecord);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      console.log(`✅ Draft ${draftId} saved to IndexedDB`);
    } catch (error) {
      console.error(`❌ Failed to save draft ${draftId}:`, error);
      throw error;
    }
  }

  // Get all drafts
  async getAllDrafts(): Promise<StoredProduct[]> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          const allProducts = request.result as StoredProduct[];
          const drafts = allProducts.filter(
            (p) => p.id.startsWith("draft_") && this.isValidProduct(p)
          );
          resolve(drafts);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("❌ Failed to get drafts:", error);
      return [];
    }
  }

  // Clean up old drafts (older than 7 days)
  async cleanupOldDrafts(): Promise<void> {
    try {
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const drafts = await this.getAllDrafts();

      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readwrite");
      const store = transaction.objectStore(this.storeName);

      for (const draft of drafts) {
        if (draft.timestamp < sevenDaysAgo) {
          await new Promise<void>((resolve, reject) => {
            const request = store.delete(draft.id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
          });
          console.log(`🧹 Cleaned up old draft: ${draft.id}`);
        }
      }
    } catch (error) {
      console.error("❌ Failed to cleanup old drafts:", error);
    }
  }

  // Check storage usage
  async getStorageInfo(): Promise<{ totalSize: number; productCount: number }> {
    try {
      const db = await this.openDB();
      const transaction = db.transaction([this.storeName], "readonly");
      const store = transaction.objectStore(this.storeName);

      return new Promise((resolve, reject) => {
        const request = store.getAll();

        request.onsuccess = () => {
          const products = request.result as StoredProduct[];
          let totalSize = 0;

          products.forEach((product) => {
            // Estimate size (this is approximate)
            totalSize += JSON.stringify(product.data).length;
            product.files.images.forEach((img) => (totalSize += img.size));
            if (product.files.video) totalSize += product.files.video.size;
            Object.values(product.files.selectedColorImages).forEach(
              (colorImg) => {
                if (colorImg.image) totalSize += colorImg.image.size;
              }
            );
          });

          resolve({
            totalSize,
            productCount: products.length,
          });
        };

        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error("❌ Failed to get storage info:", error);
      return { totalSize: 0, productCount: 0 };
    }
  }

  // Validate product structure
  private isValidProduct(product: StoredProduct): product is StoredProduct {
    return (
      product &&
      typeof product.id === "string" &&
      product.data &&
      product.files &&
      typeof product.timestamp === "number" &&
      Array.isArray(product.files.images)
    );
  }

  // Check if IndexedDB is supported
  static isSupported(): boolean {
    return typeof window !== "undefined" && "indexedDB" in window;
  }
}

// Create singleton instance
export const productStorage = new ProductStorageManager();

// Auto cleanup on app load
if (typeof window !== "undefined") {
  productStorage.cleanupOldDrafts().catch(console.warn);
}
