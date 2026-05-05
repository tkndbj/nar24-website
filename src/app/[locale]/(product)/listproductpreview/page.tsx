"use client";

// Mirrors Flutter's list_product_preview_screen.dart
// (vitrin / normal-seller path only — shop path is Flutter-only).

import React, { useState, useEffect, useCallback, useRef } from "react";
import { auth, db, storage } from "@/lib/firebase";
import { ref as storageRef, uploadBytesResumable } from "firebase/storage";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User } from "firebase/auth";
import { useProduct, type ExistingMediaRef } from "../../../../context/ProductContext";
import { useTranslations, useLocale } from "next-intl";
import UploadProgressOverlay from "../../../components/List-Product/UploadProgressOverlay";
import {
  UploadPhase,
  UploadState,
  makeUploadState

} from "../../../components/List-Product/uploadState";
import { smartCompress, shouldCompress } from "../../../utils/imageCompression";
import { CloudinaryUrl } from "@/utils/cloudinaryUrl";

// ─────────────────────────────────────────────────────────────────────────────
// Filename sanitizer — must mirror nar24-seller-panel/src/utils/UploadStorage.ts
// and lib/services/product_upload_service.dart in the Flutter app. Storage
// paths flow through Cloudinary's auto-upload, which 400s on reserved chars
// (`&`, `?`, `#`, `+`, spaces, …) even when the inbound URL is properly
// encoded — its source fetcher doesn't fully encode the GCS request.
// Normalizing filenames at upload time guarantees only safe characters ever
// land in Storage.
// ─────────────────────────────────────────────────────────────────────────────

const TURKISH_TRANSLITERATION: Record<string, string> = {
  ş: "s", Ş: "S",
  ı: "i", İ: "I",
  ğ: "g", Ğ: "G",
  ü: "u", Ü: "U",
  ö: "o", Ö: "O",
  ç: "c", Ç: "C",
};

const MAX_STEM_LENGTH = 80;

function transliterate(input: string): string {
  let out = "";
  for (const ch of input) {
    out += TURKISH_TRANSLITERATION[ch] ?? ch;
  }
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function sanitizeUploadFilename(name: string): string {
  if (!name) return "file";

  const lastDot = name.lastIndexOf(".");
  const stem = lastDot > 0 ? name.slice(0, lastDot) : name;
  const ext = lastDot > 0 ? name.slice(lastDot + 1) : "";

  let cleanStem = transliterate(stem)
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (cleanStem.length > MAX_STEM_LENGTH) {
    cleanStem = cleanStem.slice(0, MAX_STEM_LENGTH);
  }

  const cleanExt = transliterate(ext).replace(/[^a-zA-Z0-9]+/g, "");
  const result = cleanExt ? `${cleanStem}.${cleanExt}` : cleanStem;
  return result || "file";
}

// ─── Internal types ───────────────────────────────────────────────────────────

interface UploadJob {
  file: File;
  folder: string;
  colorKey?: string; // non-null for color images
  isVideo?: boolean;
}

interface UploadResult {
  imageUrls: string[];
  videoUrl: string | null;
  colorImageUrls: Record<string, string[]>;
  imageStoragePaths: string[];
  videoStoragePath: string | null;
  colorImageStoragePaths: Record<string, string>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ListProductPreview() {
  const router = useRouter();
  const { productData, productFiles, clearProductData } = useProduct();
  const t = useTranslations("productPreview");
  const locale = useLocale();

  const buildLocalizedUrl = useCallback(
    (path: string): string => {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return locale === "tr" ? `/${cleanPath}` : `/${locale}/${cleanPath}`;
    },
    [locale]
  );

  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // Mirrors Flutter's _isSubmitting + _uploadState
  const isSubmittingRef = useRef(false); // synchronous guard (like Dart bool)
  const [uploadState, setUploadState] = useState<UploadState | null>(null);

  // ── Auth ──────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      setInitializing(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!initializing && !user) {
      router.push(buildLocalizedUrl("/"));
    }
  }, [initializing, user, router, buildLocalizedUrl]);

  useEffect(() => {
    if (!productData || !productFiles) {
      router.push(buildLocalizedUrl("/listproduct"));
    }
  }, [productData, productFiles, router, buildLocalizedUrl]);

  // ── Prevent navigation while uploading (mirrors Flutter's PopScope) ──
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSubmittingRef.current) {
        e.preventDefault();
        e.returnValue = "Upload in progress. Are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ── Safe setState wrapper (mirrors Flutter's _setUploadState) ──────
  const setUploadStateSafe = useCallback((state: UploadState) => {
    setUploadState(state);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Upload a single file with Firebase Storage progress events and
  // exponential-backoff retry (up to 2 retries: 2 s, 4 s).
  // Mirrors Flutter's _uploadFileWithRetry.
  // ─────────────────────────────────────────────────────────────────────────
  const uploadFileWithRetry = useCallback(
    async (
      file: File,
      userId: string,
      folder: string,
      fileIndex: number,
      onBytesUpdate: (fileIndex: number, bytes: number) => void,
      maxRetries = 2
    ): Promise<{ url: string; path: string }> => {
      let attempt = 0;
      while (true) {
        try {
          const fileName = `${Date.now()}_${sanitizeUploadFilename(file.name)}`;
          const path = `products/${userId}/${folder}/${fileName}`;
          const ref = storageRef(storage, path);
          const task = uploadBytesResumable(ref, file);

          await new Promise<void>((resolve, reject) => {
            task.on(
              "state_changed",
              (snap) => onBytesUpdate(fileIndex, snap.bytesTransferred),
              reject,
              resolve
            );
          });

          // Synthesize the public GCS URL the same way Flutter does in
          // _submitVitrinProduct, instead of calling getDownloadURL() which
          // returns a tokenized firebasestorage URL. Keeps the imageUrls /
          // videoUrl / colorImages columns in the same format across both
          // clients so anything that parses them sees one shape.
          const url = CloudinaryUrl.firebaseUrl(path);
          return { url, path };
        } catch (err) {
          attempt++;
          if (attempt > maxRetries) throw err;
          onBytesUpdate(fileIndex, 0);
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    },
    []
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Upload all files — matches Flutter's _uploadAllFiles exactly:
  //   Phase 1 — build jobs (main images already compressed at pick time;
  //             color images compressed here like Flutter does)
  //   Phase 2 — measure sizes → compute totalBytes
  //   Phase 3 — upload in batches of 3 with per-file Firebase progress
  //   Phase 4 — merge existing + newly uploaded URLs
  // ─────────────────────────────────────────────────────────────────────────
  const uploadAllFiles = useCallback(
    async (userId: string): Promise<UploadResult> => {
      if (!productFiles) {
        return {
          imageUrls: [],
          videoUrl: null,
          colorImageUrls: {},
          imageStoragePaths: [],
          videoStoragePath: null,
          colorImageStoragePaths: {},
        };
      }

      const mainFiles = productFiles.images;
      const videoFile = productFiles.video ?? null;
      const colorEntries = Object.entries(
        productFiles.selectedColorImages ?? {}
      ).filter(([, v]) => v.image instanceof File) as [
        string,
        { quantity: string; image: File }
      ][];

      if (mainFiles.length === 0 && !videoFile && colorEntries.length === 0) {
        return {
          imageUrls: [],
          videoUrl: null,
          colorImageUrls: {},
          imageStoragePaths: [],
          videoStoragePath: null,
          colorImageStoragePaths: {},
        };
      }

      const jobs: UploadJob[] = [];

      // Defense-in-depth upper bound. Anything larger than this gets
      // re-compressed (or rejected) before we touch Firebase Storage,
      // even if the pick-time compression was somehow skipped or the
      // payload round-tripped through a stale IndexedDB snapshot.
      const HARD_MAX_BYTES = 10 * 1024 * 1024; // 10MB
      const RECOMPRESS_THRESHOLD = 500 * 1024; // 500KB

      // Main images — re-verify size and re-compress if still large.
      for (const file of mainFiles) {
        let fileToUpload: File = file;
        if (file.size > RECOMPRESS_THRESHOLD) {
          try {
            const result = await smartCompress(file, "gallery");
            if (result.compressedFile.size < file.size) {
              fileToUpload = result.compressedFile;
            }
          } catch (err) {
            console.warn("Main image re-compression failed:", err);
          }
        }
        if (fileToUpload.size > HARD_MAX_BYTES) {
          throw new Error(
            `Image "${fileToUpload.name}" is too large (${(
              fileToUpload.size /
              (1024 * 1024)
            ).toFixed(1)}MB). Max 10MB per image.`
          );
        }
        jobs.push({ file: fileToUpload, folder: "main" });
      }

      // Video — no compression
      if (videoFile) {
        jobs.push({ file: videoFile, folder: "video", isVideo: true });
      }

      // Color images — compress here (Flutter also compresses them during upload)
      for (const [colorKey, { image }] of colorEntries) {
        let fileToUpload: File = image;
        if (shouldCompress(image, 300)) {
          try {
            const result = await smartCompress(image, "color");
            if (result.compressedFile.size < image.size) {
              fileToUpload = result.compressedFile;
            }
          } catch {
            // Fall back to original if compression fails
          }
        }
        if (fileToUpload.size > HARD_MAX_BYTES) {
          throw new Error(
            `Color image for "${colorKey}" is too large (${(
              fileToUpload.size /
              (1024 * 1024)
            ).toFixed(1)}MB). Max 10MB per image.`
          );
        }
        jobs.push({
          file: fileToUpload,
          // Color name is sanitized for the path segment so chars like `&`,
          // spaces, or non-ASCII don't break Cloudinary auto-upload. The
          // `colorKey` field below stays in its original form so Firestore
          // lookups still work.
          folder: `colors/${sanitizeUploadFilename(colorKey)}`,
          colorKey,
        });
      }

      // ── Measure sizes → totalBytes ──────────────────────────────
      const fileSizes = jobs.map((j) => j.file.size);
      const totalBytes = fileSizes.reduce((a, b) => a + b, 0);

      setUploadStateSafe(
        makeUploadState({
          phase: UploadPhase.uploading,
          uploadedFiles: 0,
          totalFiles: jobs.length,
          bytesTransferred: 0,
          totalBytes,
        })
      );

      // ── Upload in batches of 3 ─────────────────────────────────
      const bytesPerFile = new Array(jobs.length).fill(0);
      let completedFiles = 0;

      const onBytesUpdate = (idx: number, bytes: number) => {
        bytesPerFile[idx] = bytes;
        setUploadStateSafe(
          makeUploadState({
            phase: UploadPhase.uploading,
            uploadedFiles: completedFiles,
            totalFiles: jobs.length,
            bytesTransferred: bytesPerFile.reduce((a, b) => a + b, 0),
            totalBytes,
          })
        );
      };

      const maxConcurrent = 3;
      const uploadedUrls: { url: string; path: string }[] = new Array(
        jobs.length
      ).fill({ url: "", path: "" });

      for (let start = 0; start < jobs.length; start += maxConcurrent) {
        const end = Math.min(start + maxConcurrent, jobs.length);
        const batch = Array.from({ length: end - start }, (_, i) => start + i);

        await Promise.all(
          batch.map(async (globalIdx) => {
            uploadedUrls[globalIdx] = await uploadFileWithRetry(
              jobs[globalIdx].file,
              userId,
              jobs[globalIdx].folder,
              globalIdx,
              onBytesUpdate
            );
            completedFiles++;
            bytesPerFile[globalIdx] = fileSizes[globalIdx];
            onBytesUpdate(globalIdx, fileSizes[globalIdx]);
          })
        );
      }

     // ── Assemble results ───────────────────────────────────────
     const imageUrls: string[] = [];
     const imageStoragePaths: string[] = [];
     let videoUrl: string | null = null;
     let videoStoragePath: string | null = null;
     const colorImageUrls: Record<string, string[]> = {};
     const colorImageStoragePaths: Record<string, string> = {};

     for (let i = 0; i < jobs.length; i++) {
       const job = jobs[i];
       const { url, path } = uploadedUrls[i];
       if (job.isVideo) {
         videoUrl = url;
         videoStoragePath = path;
       } else if (job.colorKey) {
         colorImageUrls[job.colorKey] = [url];
         colorImageStoragePaths[job.colorKey] = path;
       } else {
         imageUrls.push(url);
         imageStoragePaths.push(path);
       }
     }

     return {
       imageUrls,
       videoUrl,
       colorImageUrls,
       imageStoragePaths,
       videoStoragePath,
       colorImageStoragePaths,
     };
   },
    [productFiles, setUploadStateSafe, uploadFileWithRetry]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Submit — mirrors Flutter's _submitProduct (vitrin path only)
  // ─────────────────────────────────────────────────────────────────────────
  const handleConfirmAndList = async () => {
    // Synchronous guard — blocks any second tap before the first await.
    // Mirrors Flutter: if (_isSubmitting) return; _isSubmitting = true;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    if (!user || !productData || !productFiles) {
      isSubmittingRef.current = false;
      return;
    }

    const newColorImageCount = Object.values(
      productFiles.selectedColorImages ?? {}
    ).filter((v) => v.image instanceof File).length;

    setUploadStateSafe(
      makeUploadState({
        phase: UploadPhase.uploading,
        totalFiles: productFiles.images.length + newColorImageCount,
      })
    );

    try {
      // Step 1 — Upload everything, track progress
      const upload = await uploadAllFiles(user.uid);

      // Step 2 — Switch to submitting phase (Firestore write)
      setUploadStateSafe(
        makeUploadState({
          phase: UploadPhase.submitting,
          uploadedFiles: uploadState?.totalFiles ?? 0,
          totalFiles: uploadState?.totalFiles ?? 0,
          bytesTransferred: uploadState?.totalBytes ?? 0,
          totalBytes: uploadState?.totalBytes ?? 0,
        })
      );

      // Step 3 — Build Firestore payload. Edit mode writes to
      // vitrin_edit_product_applications (referencing the live product);
      // otherwise create a fresh vitrin_product_applications document.
      if (productData?.editProductId) {
        await submitVitrinEditApplication(user, upload, productData.editProductId);
      } else {
        await submitVitrinProduct(user, upload);
      }

      clearProductData();
      sessionStorage.setItem("productFormReset", "true");
      router.push(buildLocalizedUrl("/success"));
    } catch (err) {
      console.error("Product submission error:", err);
      alert(t("submitError"));
    } finally {
      isSubmittingRef.current = false;
      setUploadState(null);
    }
  };

  // Per-color merge used by both new-product and edit-application writes.
  // For each color: a newly picked File wins (its uploaded URL/path replaces
  // the existing one); otherwise the existing ref is preserved.
  const mergeColorImages = (
    availableColors: string[],
    selected: { [key: string]: { quantity: string; image: File | null } },
    existing: { [key: string]: ExistingMediaRef } | undefined,
    uploadedUrls: Record<string, string[]>,
    uploadedPaths: Record<string, string>
  ): {
    colorImages: Record<string, string[]>;
    colorImageStoragePaths: Record<string, string>;
  } => {
    const colorImages: Record<string, string[]> = {};
    const colorImageStoragePaths: Record<string, string> = {};
    for (const color of availableColors) {
      const hasNew = !!selected?.[color]?.image;
      if (hasNew && uploadedUrls[color]) {
        colorImages[color] = uploadedUrls[color];
        if (uploadedPaths[color]) {
          colorImageStoragePaths[color] = uploadedPaths[color];
        }
      } else if (existing?.[color]) {
        colorImages[color] = [existing[color].url];
        if (existing[color].path) {
          colorImageStoragePaths[color] = existing[color].path;
        }
      }
    }
    return { colorImages, colorImageStoragePaths };
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Vitrin (personal/normal-seller) Firestore write.
  // Matches Flutter's _submitVitrinProduct — web only needs this path.
  // ─────────────────────────────────────────────────────────────────────────
  const submitVitrinProduct = async (
    authedUser: User,
    upload: UploadResult
  ) => {
    if (!productData || !productFiles) return;

    const productId = crypto.randomUUID();
    const uid = authedUser.uid;

    const colorQuantities: Record<string, number> = {};
    const availableColors = Object.keys(
      productFiles.selectedColorImages ?? {}
    );
    for (const [color, info] of Object.entries(
      productFiles.selectedColorImages ?? {}
    )) {
      const qty = parseInt(info.quantity);
      if (!isNaN(qty) && qty > 0) colorQuantities[color] = qty;
    }

    // Extract gender (mirrors Flutter's cleanedAttributes logic)
    let genderValue: string | null = null;
    const cleanedAttributes = { ...productData.attributes };
    if (cleanedAttributes.gender) {
      genderValue = cleanedAttributes.gender as string;
      delete cleanedAttributes.gender;
    }

    // Extract top-level spec fields from attributes
    // (mirrors Flutter's _getSpecList + specCleanedAttributes)
    const getList = (key: string): string[] | null => {
      const v = cleanedAttributes[key];
      if (!v) return null;
      const arr = Array.isArray(v) ? v : [v];
      delete cleanedAttributes[key];
      return arr.map(String);
    };
    const getString = (key: string): string | null => {
      const v = cleanedAttributes[key];
      if (!v) return null;
      delete cleanedAttributes[key];
      return String(v);
    };
    const getNumber = (key: string): number | null => {
      const v = cleanedAttributes[key];
      if (v == null) return null;
      const n = parseFloat(String(v));
      delete cleanedAttributes[key];
      return isNaN(n) ? null : n;
    };

    const productType = getString("productType");
    const clothingSizes = getList("clothingSizes");
    const clothingFit = getString("clothingFit");
    const clothingTypes = getList("clothingTypes");
    const pantSizes = getList("pantSizes");
    const pantFabricTypes = getList("pantFabricTypes");
    const footwearSizes = getList("footwearSizes");
    const jewelryMaterials = getList("jewelryMaterials");
    const consoleBrand = getString("consoleBrand");
    const curtainMaxWidth = getNumber("curtainMaxWidth");
    const curtainMaxHeight = getNumber("curtainMaxHeight");

    // Build searchIndex array (matching Flutter's cloud function behaviour)
    const searchTerms = [
      productData.title.toLowerCase(),
      productData.description.toLowerCase(),
      productData.category.toLowerCase(),
      productData.subcategory.toLowerCase(),
      productData.subsubcategory.toLowerCase(),
      productData.brand?.toLowerCase(),
      ...Object.values(cleanedAttributes).flatMap((v) =>
        Array.isArray(v)
          ? v.map((x) => x.toString().toLowerCase())
          : [v.toString().toLowerCase()]
      ),
      ...availableColors.map((c) => c.toLowerCase()),
    ].filter((t) => t && t.trim().length > 0);
    const searchIndex = [...new Set(searchTerms)];

    // Get seller display name
    let sellerName = t("unknownSeller");
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    sellerName =
      userData.displayName ||
      userData.name ||
      productData.ibanOwnerName ||
      t("unknownSeller");

    const applicationData: Record<string, unknown> = {
      // Identity
      id: productId,
      ilanNo: productId,
      userId: uid,
      ownerId: uid,
      shopId: null,

      // Core product fields
      productName: productData.title.trim(),
      description: productData.description.trim(),
      price: parseFloat(productData.price),
      currency: "TL",
      condition: productData.condition,
      brandModel: productData.brand ?? "",
      category: productData.category,
      subcategory: productData.subcategory,
      subsubcategory: productData.subsubcategory,
      quantity: parseInt(productData.quantity) || 1,
      deliveryOption: productData.deliveryOption,

      // Seller
      sellerName,
      phone: productData.phone ?? "",
      region: productData.region ?? "",
      address: productData.address ?? "",
      ibanOwnerName: productData.ibanOwnerName ?? "",
      ibanOwnerSurname: productData.ibanOwnerSurname ?? "",
      iban: productData.iban ?? "",

    // Media — merge kept-existing refs with newly uploaded ones.
      // Each URL has a corresponding storage path at the same index.
      imageUrls: [
        ...(productFiles.existingImages ?? []).map((r) => r.url),
        ...upload.imageUrls,
      ],
      imageStoragePaths: [
        ...(productFiles.existingImages ?? []).map((r) => r.path),
        ...upload.imageStoragePaths,
      ],
      videoUrl:
        upload.videoUrl ?? productFiles.existingVideo?.url ?? null,
      videoStoragePath:
        upload.videoStoragePath ?? productFiles.existingVideo?.path ?? null,
        ...(() => {
          const merged = mergeColorImages(
            availableColors,
            productFiles.selectedColorImages,
            productFiles.existingColorImages,
            upload.colorImageUrls,
            upload.colorImageStoragePaths
          );
          return {
            colorImages: merged.colorImages,
            colorImageStoragePaths: merged.colorImageStoragePaths,
          };
        })(),
  
        colorQuantities,
        availableColors,

      // Extracted gender
      gender: genderValue,

      // Top-level spec fields (mirrors Flutter's Product model)
      ...(productType && { productType }),
      ...(clothingSizes && { clothingSizes }),
      ...(clothingFit && { clothingFit }),
      ...(clothingTypes && { clothingTypes }),
      ...(pantSizes && { pantSizes }),
      ...(pantFabricTypes && { pantFabricTypes }),
      ...(footwearSizes && { footwearSizes }),
      ...(jewelryMaterials && { jewelryMaterials }),
      ...(consoleBrand && { consoleBrand }),
      ...(curtainMaxWidth != null && { curtainMaxWidth }),
      ...(curtainMaxHeight != null && { curtainMaxHeight }),
      // Flatten any remaining dynamic attributes to top-level
      // (matches Flutter's flat document structure)
      ...cleanedAttributes,

      // Counters / flags (all zeroed for new listings)
      averageRating: 0.0,
      reviewCount: 0,
      clickCount: 0,
      clickCountAtStart: 0,
      favoritesCount: 0,
      cartCount: 0,
      purchaseCount: 0,
      isFeatured: false,
      isTrending: false,
      isBoosted: false,
      boostedImpressionCount: 0,
      boostImpressionCountAtStart: 0,
      boostClickCountAtStart: 0,
      promotionScore: 0,
      rankingScore: 0,
      dailyClickCount: 0,
      boostStartTime: null,
      boostEndTime: null,
      lastClickDate: null,
      paused: false,

      // Related products (epoch date — mirrors Flutter)
      relatedProductIds: [],
      relatedLastUpdated: new Date(0),
      relatedCount: 0,

      // Status + search
      status: "pending",
      searchIndex,
      needsSync: true,

      // Timestamps
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(
      doc(db, "vitrin_product_applications", productId),
      applicationData
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Vitrin edit application — writes the proposed changes to
  // vitrin_edit_product_applications referencing the live product.
  // The live products/{originalProductId} doc is NOT modified here;
  // approval is handled downstream by the admin flow.
  // ─────────────────────────────────────────────────────────────────────────
  const submitVitrinEditApplication = async (
    authedUser: User,
    upload: UploadResult,
    originalProductId: string
  ) => {
    if (!productData || !productFiles) return;

    const editApplicationId = crypto.randomUUID();
    const uid = authedUser.uid;

    const colorQuantities: Record<string, number> = {};
    const availableColors = Object.keys(
      productFiles.selectedColorImages ?? {}
    );
    for (const [color, info] of Object.entries(
      productFiles.selectedColorImages ?? {}
    )) {
      const qty = parseInt(info.quantity);
      if (!isNaN(qty) && qty > 0) colorQuantities[color] = qty;
    }

    let genderValue: string | null = null;
    const cleanedAttributes = { ...productData.attributes };
    if (cleanedAttributes.gender) {
      genderValue = cleanedAttributes.gender as string;
      delete cleanedAttributes.gender;
    }

    const getList = (key: string): string[] | null => {
      const v = cleanedAttributes[key];
      if (!v) return null;
      const arr = Array.isArray(v) ? v : [v];
      delete cleanedAttributes[key];
      return arr.map(String);
    };
    const getString = (key: string): string | null => {
      const v = cleanedAttributes[key];
      if (!v) return null;
      delete cleanedAttributes[key];
      return String(v);
    };
    const getNumber = (key: string): number | null => {
      const v = cleanedAttributes[key];
      if (v == null) return null;
      const n = parseFloat(String(v));
      delete cleanedAttributes[key];
      return isNaN(n) ? null : n;
    };

    const productType = getString("productType");
    const clothingSizes = getList("clothingSizes");
    const clothingFit = getString("clothingFit");
    const clothingTypes = getList("clothingTypes");
    const pantSizes = getList("pantSizes");
    const pantFabricTypes = getList("pantFabricTypes");
    const footwearSizes = getList("footwearSizes");
    const jewelryMaterials = getList("jewelryMaterials");
    const consoleBrand = getString("consoleBrand");
    const curtainMaxWidth = getNumber("curtainMaxWidth");
    const curtainMaxHeight = getNumber("curtainMaxHeight");

    const searchTerms = [
      productData.title.toLowerCase(),
      productData.description.toLowerCase(),
      productData.category.toLowerCase(),
      productData.subcategory.toLowerCase(),
      productData.subsubcategory.toLowerCase(),
      productData.brand?.toLowerCase(),
      ...Object.values(cleanedAttributes).flatMap((v) =>
        Array.isArray(v)
          ? v.map((x) => x.toString().toLowerCase())
          : [v.toString().toLowerCase()]
      ),
      ...availableColors.map((c) => c.toLowerCase()),
    ].filter((tk) => tk && tk.trim().length > 0);
    const searchIndex = [...new Set(searchTerms)];

    let sellerName = t("unknownSeller");
    const userDoc = await getDoc(doc(db, "users", uid));
    const userData = userDoc.exists() ? userDoc.data() : {};
    sellerName =
      userData.displayName ||
      userData.name ||
      productData.ibanOwnerName ||
      t("unknownSeller");

      const mergedImageUrls = [
        ...(productFiles.existingImages ?? []).map((r) => r.url),
        ...upload.imageUrls,
      ];
      const mergedImageStoragePaths = [
        ...(productFiles.existingImages ?? []).map((r) => r.path),
        ...upload.imageStoragePaths,
      ];
      const mergedVideoUrl =
        upload.videoUrl ?? productFiles.existingVideo?.url ?? null;
      const mergedVideoStoragePath =
        upload.videoStoragePath ?? productFiles.existingVideo?.path ?? null;
      const mergedColor = mergeColorImages(
        availableColors,
        productFiles.selectedColorImages,
        productFiles.existingColorImages,
        upload.colorImageUrls,
        upload.colorImageStoragePaths
      );
      const mergedColorImages = mergedColor.colorImages;
      const mergedColorImageStoragePaths = mergedColor.colorImageStoragePaths;
  
      // Colors removed during edit (present in original, absent now).
      const originalColors = Object.keys(productFiles.existingColorImages ?? {});
      const deletedColors = originalColors.filter(
        (c) => !availableColors.includes(c)
      );

   // Archived edits live in paused_products (the archive collection),
   // not products. Mirrors Flutter's isFromArchivedCollection branching
   // so the snapshot we take + the editType/sourceCollection we write
   // line up with what approveArchivedProductEdit (or the regular
   // product_edit admin merge) expects.
   const isArchivedEdit = productData?.isFromArchivedCollection === true;
   const originalCollection = isArchivedEdit ? "paused_products" : "products";
   const originalSnap = await getDoc(
     doc(db, originalCollection, originalProductId)
   );
   if (!originalSnap.exists()) {
     throw new Error("Original product not found.");
   }
   const originalProductData = originalSnap.data() as Record<string, unknown>;

   // Build the "new" product snapshot for change detection.
   const newProductSnapshot: Record<string, unknown> = {
     productName: productData.title.trim(),
     description: productData.description.trim(),
     price: parseFloat(productData.price),
     condition: productData.condition,
     brandModel: productData.brand ?? "",
     category: productData.category,
     subcategory: productData.subcategory,
     subsubcategory: productData.subsubcategory,
     gender: genderValue,
     quantity: parseInt(productData.quantity) || 1,
     deliveryOption: productData.deliveryOption,
     colorQuantities,
     availableColors,
     imageStoragePaths: mergedImageStoragePaths,
     videoStoragePath: mergedVideoStoragePath,
     colorImageStoragePaths: mergedColorImageStoragePaths,
     ...(productType && { productType }),
     ...(clothingSizes && { clothingSizes }),
     ...(clothingFit && { clothingFit }),
     ...(clothingTypes && { clothingTypes }),
     ...(pantSizes && { pantSizes }),
     ...(pantFabricTypes && { pantFabricTypes }),
     ...(footwearSizes && { footwearSizes }),
     ...(jewelryMaterials && { jewelryMaterials }),
     ...(consoleBrand && { consoleBrand }),
     ...(curtainMaxWidth != null && { curtainMaxWidth }),
     ...(curtainMaxHeight != null && { curtainMaxHeight }),
   };

   // Detect changes — mirrors Flutter's _detectChanges.
   const normalize = (v: unknown): unknown => {
     if (v === null || v === undefined || v === "") return null;
     if (Array.isArray(v) && v.length === 0) return null;
     if (
       typeof v === "object" &&
       v !== null &&
       !Array.isArray(v) &&
       Object.keys(v as object).length === 0
     )
       return null;
     return v;
   };
   const editedFields: string[] = [];
   const changes: Record<string, { old: unknown; new: unknown }> = {};
   for (const [field, newVal] of Object.entries(newProductSnapshot)) {
     const oldVal = originalProductData[field];
     if (JSON.stringify(normalize(oldVal)) !== JSON.stringify(normalize(newVal))) {
       editedFields.push(field);
       changes[field] = { old: oldVal ?? null, new: newVal };
     }
   }

   const editApplicationData: Record<string, unknown> = {
     // Identity
     id: originalProductId,
     ilanNo: originalProductData.ilanNo ?? originalProductId,
     originalProductId,
     userId: uid,
     ownerId: uid,
     shopId: null,

     // Proposed new values
     productName: productData.title.trim(),
     description: productData.description.trim(),
     price: parseFloat(productData.price),
     currency: "TL",
     condition: productData.condition,
     brandModel: productData.brand ?? "",
     category: productData.category,
     subcategory: productData.subcategory,
     subsubcategory: productData.subsubcategory,
     quantity: parseInt(productData.quantity) || 1,
     deliveryOption: productData.deliveryOption,

     sellerName,
     phone: productData.phone ?? "",
     region: productData.region ?? "",
     address: productData.address ?? "",
     ibanOwnerName: productData.ibanOwnerName ?? "",
     ibanOwnerSurname: productData.ibanOwnerSurname ?? "",
     iban: productData.iban ?? "",

     // URLs (backward-compat)
     imageUrls: mergedImageUrls,
     imageStoragePaths: mergedImageStoragePaths,
     videoUrl: mergedVideoUrl,
     videoStoragePath: mergedVideoStoragePath,
     colorImages: mergedColorImages,
     colorImageStoragePaths: mergedColorImageStoragePaths,
     colorQuantities,
     availableColors,
     deletedColors,

     gender: genderValue,

     ...(productType && { productType }),
     ...(clothingSizes && { clothingSizes }),
     ...(clothingFit && { clothingFit }),
     ...(clothingTypes && { clothingTypes }),
     ...(pantSizes && { pantSizes }),
     ...(pantFabricTypes && { pantFabricTypes }),
     ...(footwearSizes && { footwearSizes }),
     ...(jewelryMaterials && { jewelryMaterials }),
     ...(consoleBrand && { consoleBrand }),
     ...(curtainMaxWidth != null && { curtainMaxWidth }),
     ...(curtainMaxHeight != null && { curtainMaxHeight }),
     ...cleanedAttributes,

     // Edit pipeline fields — match Flutter's isFromArchivedCollection branch.
     // Archived edits route through approveArchivedProductEdit, which expects
     // editType=archived_product_update + sourceCollection=paused_products
     // and these archive-clear fields (mirrored from Flutter exactly so the
     // CF's reactivation logic finds them where it looks).
     editType: isArchivedEdit ? "archived_product_update" : "product_edit",
     sourceCollection: isArchivedEdit ? "paused_products" : "products",
     editedFields,
     changes,
     originalProductData,
     ...(isArchivedEdit && {
       needsUpdate: false,
       archiveReason: null,
       archivedByAdmin: false,
       archivedByAdminAt: null,
       archivedByAdminId: null,
       paused: false,
     }),

     status: "pending",
     searchIndex,
     submittedAt: serverTimestamp(),
     createdAt: serverTimestamp(),
     updatedAt: serverTimestamp(),
   };

   await setDoc(
     doc(db, "vitrin_edit_product_applications", editApplicationId),
     editApplicationData
   );
 };

  // ─────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────────────────

  const handleEdit = () => {
    sessionStorage.setItem("returningFromPreview", "true");
    router.back();
  };

  const getLocalizedAttributeTitle = (key: string): string => {
    const map: Record<string, string> = {
      gender: t("attributes.gender"),
      clothingSizes: t("attributes.clothingSizes"),
      clothingFit: t("attributes.clothingFit"),
      clothingType: t("attributes.clothingType"),
      footwearGender: t("attributes.footwearGender"),
      footwearSizes: t("attributes.footwearSizes"),
      pantSizes: t("attributes.pantSizes"),
      jewelryType: t("attributes.jewelryType"),
      jewelryMaterials: t("attributes.jewelryMaterials"),
      brand: t("attributes.brand"),
      productType: "Product Type",
      clothingTypes: "Clothing Types",
      pantFabricTypes: "Fabric Types",
      consoleBrand: "Console Brand",
      curtainMaxWidth: "Max Width",
      curtainMaxHeight: "Max Height",
    };
    return (
      map[key] ||
      key
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase())
    );
  };

  const mapGenderToLocal = (g: string): string => {
    const map: Record<string, string> = {
      Women: t("genderOptions.women"),
      Men: t("genderOptions.men"),
      Unisex: t("genderOptions.unisex"),
    };
    return map[g] || g;
  };

  // ─── Loading / guard states ───────────────────────────────────────

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{t("authChecking")}</p>
      </div>
    );
  }

  if (!productData || !productFiles) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-5 w-5 border-[1.5px] border-gray-200 border-t-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 text-xs">{t("previewLoading")}</p>
        </div>
      </div>
    );
  }

  // ─── Detail-row helpers ───────────────────────────────────────────

  const DetailRow = ({ title, value }: { title: string; value: string }) =>
    value ? (
      <div className="flex justify-between items-start py-2 border-b border-gray-100 last:border-b-0">
        <span className="text-gray-500 text-xs w-28 flex-shrink-0">
          {title}
        </span>
        <span className="text-gray-800 text-xs text-right flex-1">
          {value}
        </span>
      </div>
    ) : null;

  const SectionCard = ({
    title,
    icon,
    children,
  }: {
    title: string;
    icon: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <span className="text-sm">{icon}</span>
        {title}
      </h2>
      <div className="space-y-0">{children}</div>
    </div>
  );

  const isSubmitting = uploadState !== null;

  // ─── Main render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 pt-8 pb-10">
        <div>
          <div className="mb-6">
            <h1 className="text-lg font-bold text-gray-900">
              {t("pageTitle")}
            </h1>
            <p className="text-gray-500 text-xs mt-1">{t("pageDescription")}</p>
          </div>

          <div className="space-y-4">
            {/* Media Gallery — shows kept-existing URLs (edit mode) and newly picked Files together */}
            <SectionCard title={t("sections.mediaGallery")} icon="📸">
              <div className="space-y-4">
              {(productFiles.images.length > 0 ||
                  (productFiles.existingImages?.length ?? 0) > 0) && (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      {t("productImages", {
                        count:
                          productFiles.images.length +
                          (productFiles.existingImages?.length ?? 0),
                      })}
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {(productFiles.existingImages ?? []).map((ref, idx) => (
                        <div
                          key={`existing-${ref.path || ref.url || idx}`}
                          className="aspect-square relative rounded-lg overflow-hidden border border-gray-200"
                        >
                          <Image
                            src={ref.url}
                            alt={t("productImageAlt", { index: idx + 1 })}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ))}
                      {productFiles.images.map((file, idx) => (
                        <div
                          key={`new-${idx}`}
                          className="aspect-square relative rounded-lg overflow-hidden border border-gray-200"
                        >
                          <Image
                            src={URL.createObjectURL(file)}
                            alt={t("productImageAlt", { index: idx + 1 })}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {productFiles.video ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      {t("productVideo")}
                    </p>
                    <video
                      src={URL.createObjectURL(productFiles.video)}
                      controls
                      className="w-48 h-auto rounded-lg border border-gray-200"
                    />
                  </div>
                ) : productFiles.existingVideo ? (
                  <div>
                    <p className="text-xs text-gray-500 mb-2">
                      {t("productVideo")}
                    </p>
                    <video
                      src={productFiles.existingVideo.url}
                      controls
                      className="w-48 h-auto rounded-lg border border-gray-200"
                    />
                  </div>
                ) : null}
              </div>
            </SectionCard>

            {/* Product Details */}
            <SectionCard title={t("sections.productDetails")} icon="📝">
              <DetailRow title={t("fields.title")} value={productData.title} />
              <DetailRow
                title={t("fields.description")}
                value={productData.description}
              />
              <DetailRow
                title={t("fields.price")}
                value={`${productData.price} TL`}
              />
              <DetailRow
                title={t("fields.quantity")}
                value={productData.quantity}
              />
              <DetailRow
                title={t("fields.condition")}
                value={productData.condition}
              />
              <DetailRow
                title={t("fields.deliveryOption")}
                value={productData.deliveryOption}
              />
            </SectionCard>

            {/* Category & Classification */}
            <SectionCard
              title={t("sections.categoryClassification")}
              icon="🏷️"
            >
              <DetailRow
                title={t("fields.category")}
                value={productData.category}
              />
              {productData.subcategory && (
                <DetailRow
                  title={t("fields.subcategory")}
                  value={productData.subcategory}
                />
              )}
              {productData.subsubcategory && (
                <DetailRow
                  title={t("fields.subsubcategory")}
                  value={productData.subsubcategory}
                />
              )}
              {productData.brand && (
                <DetailRow
                  title={t("fields.brand")}
                  value={productData.brand}
                />
              )}
            </SectionCard>

            {/* Dynamic Product Specifications (from flow steps) */}
            {Object.keys(productData.attributes).length > 0 && (
              <SectionCard title={t("sections.productSpecs")} icon="⚙️">
                {Object.entries(productData.attributes).map(([key, value]) => {
                  if (!value) return null;
                  const displayValue =
                    Array.isArray(value)
                      ? value.join(", ")
                      : key === "gender"
                      ? mapGenderToLocal(value.toString())
                      : value.toString();
                  if (!displayValue.trim()) return null;
                  return (
                    <DetailRow
                      key={key}
                      title={getLocalizedAttributeTitle(key)}
                      value={displayValue}
                    />
                  );
                })}
              </SectionCard>
            )}

            {/* Color Options */}
            {Object.keys(productFiles.selectedColorImages ?? {}).length > 0 && (
              <SectionCard title={t("sections.availableColors")} icon="🎨">
                <div className="space-y-2">
                  {Object.entries(productFiles.selectedColorImages).map(
                    ([color, data]) => (
                      <div
                        key={color}
                        className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full border border-gray-300 bg-gray-200" />
                          <span className="text-xs font-medium text-gray-700">
                            {color}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          {data.quantity && (
                            <span className="text-[11px] text-gray-500">
                              {t("quantityLabel")}: {data.quantity}
                            </span>
                          )}
                          {data.image ? (
                            <div className="w-8 h-8 rounded overflow-hidden border border-gray-200">
                              <Image
                                src={URL.createObjectURL(data.image)}
                                alt={t("colorVariantAlt", { color })}
                                width={32}
                                height={32}
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          ) : productFiles.existingColorImages?.[color] ? (
                            <div className="w-8 h-8 rounded overflow-hidden border border-gray-200">
                              <Image
                                src={productFiles.existingColorImages[color].url}
                                alt={t("colorVariantAlt", { color })}
                                width={32}
                                height={32}
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </SectionCard>
            )}

            {/* Seller Information */}
            <SectionCard title={t("sections.sellerInfo")} icon="👤">
              {productData.ibanOwnerName && productData.ibanOwnerSurname && (
                <DetailRow
                  title={t("fields.accountHolder")}
                  value={`${productData.ibanOwnerName} ${productData.ibanOwnerSurname}`}
                />
              )}
              <DetailRow
                title={t("fields.phone")}
                value={productData.phone}
              />
              <DetailRow
                title={t("fields.region")}
                value={productData.region}
              />
              <DetailRow
                title={t("fields.address")}
                value={productData.address}
              />
              <DetailRow title={t("fields.iban")} value={productData.iban} />
            </SectionCard>

            {/* Delivery */}
            <SectionCard title={t("sections.deliveryInfo")} icon="🚚">
              <div className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded-lg">
                <span className="text-base">
                  {productData.deliveryOption === "Fast Delivery" ||
                  productData.deliveryOption === "Hızlı Teslimat"
                    ? "⚡"
                    : "🤝"}
                </span>
                <div className="flex-1">
                  <p className="text-xs font-medium text-gray-800">
                    {productData.deliveryOption}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {productData.deliveryOption === "Fast Delivery" ||
                    productData.deliveryOption === "Hızlı Teslimat"
                      ? t("deliveryDescriptions.fast")
                      : t("deliveryDescriptions.selfManaged")}
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Important Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className="text-sm flex-shrink-0 mt-0.5">⚠️</span>
                <div>
                  <p className="text-xs font-semibold text-amber-800">
                    {t("importantNotice.title")}
                  </p>
                  <p className="text-[11px] text-amber-700 mt-0.5">
                    {t("importantNotice.description")}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons — disabled while submitting (mirrors Flutter's PopScope) */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={handleEdit}
                disabled={isSubmitting}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-300 text-gray-700 text-xs font-semibold rounded-lg transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 17l-5-5m0 0l5-5m-5 5h12"
                  />
                </svg>
                {t("buttons.editProduct")}
              </button>

              <button
                onClick={handleConfirmAndList}
                disabled={isSubmitting || initializing}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-[1.5px] border-white/30 border-t-white" />
                    {t("buttons.submitting")}
                  </>
                ) : (
                  <>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    {t("buttons.confirmAndSubmit")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress overlay — last in render tree = on top (mirrors Flutter Stack) */}
      {uploadState !== null && <UploadProgressOverlay state={uploadState} />}
    </div>
  );
}