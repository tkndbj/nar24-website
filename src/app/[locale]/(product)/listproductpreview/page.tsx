"use client";

// Mirrors Flutter's list_product_preview_screen.dart
// (vitrin / normal-seller path only — shop path is Flutter-only).

import React, { useState, useEffect, useCallback, useRef } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  ref as storageRef,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User } from "firebase/auth";
import { useProduct } from "../../../../context/ProductContext";
import { useTranslations, useLocale } from "next-intl";
import UploadProgressOverlay from "../../../components/List-Product/UploadProgressOverlay";
import {
  UploadPhase,
  UploadState,
  makeUploadState
 
} from "../../../components/List-Product/uploadState";
import { smartCompress, shouldCompress } from "../../../utils/imageCompression";

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
}

interface ProductData {
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
    ): Promise<string> => {
      let attempt = 0;
      while (true) {
        try {
          const fileName = `${Date.now()}_${file.name}`;
          const ref = storageRef(
            storage,
            `products/${userId}/${folder}/${fileName}`
          );
          const task = uploadBytesResumable(ref, file);

          await new Promise<void>((resolve, reject) => {
            task.on(
              "state_changed",
              (snap) => onBytesUpdate(fileIndex, snap.bytesTransferred),
              reject,
              resolve
            );
          });

          return await getDownloadURL(task.snapshot.ref);
        } catch (err) {
          attempt++;
          if (attempt > maxRetries) throw err;
          // Reset this file's progress before retrying
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
        return { imageUrls: [], videoUrl: null, colorImageUrls: {} };
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
        return { imageUrls: [], videoUrl: null, colorImageUrls: {} };
      }

      const jobs: UploadJob[] = [];

      // Main images — already compressed at pick time, add directly
      for (const file of mainFiles) {
        jobs.push({ file, folder: "default_images" });
      }

      // Video — no compression
      if (videoFile) {
        jobs.push({ file: videoFile, folder: "preview_videos", isVideo: true });
      }

      // Color images — compress here (Flutter also compresses them during upload)
      for (const [colorKey, { image }] of colorEntries) {
        let fileToUpload: File = image;
        if (shouldCompress(image, 300)) {
          try {
            const result = await smartCompress(image, "gallery");
            fileToUpload = result.compressedFile;
          } catch {
            // Fall back to original if compression fails
          }
        }
        jobs.push({
          file: fileToUpload,
          folder: `color_images/${colorKey}`,
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
      const uploadedUrls: string[] = new Array(jobs.length).fill("");

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
      let videoUrl: string | null = null;
      const colorImageUrls: Record<string, string[]> = {};

      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        if (job.isVideo) {
          videoUrl = uploadedUrls[i];
        } else if (job.colorKey) {
          colorImageUrls[job.colorKey] = [uploadedUrls[i]];
        } else {
          imageUrls.push(uploadedUrls[i]);
        }
      }

      return { imageUrls, videoUrl, colorImageUrls };
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

      // Step 3 — Build Firestore payload (vitrin path)
      await submitVitrinProduct(user, upload);

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

      // Media
      imageUrls: upload.imageUrls,
      videoUrl: upload.videoUrl ?? null,
      colorImages: upload.colorImageUrls,
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

      // Remaining dynamic attributes
      attributes: cleanedAttributes,

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
          <p className="text-slate-600">{t("previewLoading")}</p>
        </div>
      </div>
    );
  }

  // ─── Detail-row helpers ───────────────────────────────────────────

  const DetailRow = ({ title, value }: { title: string; value: string }) =>
    value ? (
      <div className="flex justify-between items-start py-3 border-b border-slate-100 last:border-b-0">
        <span className="text-slate-600 font-medium text-sm w-32 flex-shrink-0">
          {title}:
        </span>
        <span className="text-slate-800 text-sm text-right flex-1">
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
    <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">{icon}</span>
        </div>
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );

  const isSubmitting = uploadState !== null;

  // ─── Main render ──────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-slate-800 mb-4">
              {t("pageTitle")}
            </h1>
            <p className="text-slate-600 text-lg">{t("pageDescription")}</p>
          </div>

          <div className="space-y-8">
            {/* Media Gallery */}
            <SectionCard title={t("sections.mediaGallery")} icon="📸">
              <div className="space-y-6">
                {productFiles.images.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-4">
                      {t("productImages", { count: productFiles.images.length })}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {productFiles.images.map((file, idx) => (
                        <div
                          key={idx}
                          className="aspect-square relative rounded-xl overflow-hidden shadow-md"
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

                {productFiles.video && (
                  <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-4">
                      {t("productVideo")}
                    </h4>
                    <video
                      src={URL.createObjectURL(productFiles.video)}
                      controls
                      className="w-64 h-auto rounded-xl shadow-lg"
                    />
                  </div>
                )}
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
                  let displayValue =
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
                <div className="space-y-4">
                  {Object.entries(productFiles.selectedColorImages).map(
                    ([color, data]) => (
                      <div
                        key={color}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border-2 border-white shadow-md bg-slate-300" />
                          <span className="font-medium text-slate-700">
                            {color}
                          </span>
                        </div>
                        <div className="flex items-center gap-4">
                          {data.quantity && (
                            <span className="text-sm text-slate-600">
                              {t("quantityLabel")}: {data.quantity}
                            </span>
                          )}
                          {data.image && (
                            <div className="w-12 h-12 rounded-lg overflow-hidden shadow-sm">
                              <Image
                                src={URL.createObjectURL(data.image)}
                                alt={t("colorVariantAlt", { color })}
                                width={48}
                                height={48}
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          )}
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
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">
                    {productData.deliveryOption === "Fast Delivery" ||
                    productData.deliveryOption === "Hızlı Teslimat"
                      ? "⚡"
                      : "🤝"}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-800">
                    {productData.deliveryOption}
                  </h4>
                  <p className="text-slate-600 text-sm">
                    {productData.deliveryOption === "Fast Delivery" ||
                    productData.deliveryOption === "Hızlı Teslimat"
                      ? t("deliveryDescriptions.fast")
                      : t("deliveryDescriptions.selfManaged")}
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Important Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm">⚠️</span>
                </div>
                <div>
                  <h3 className="font-semibold text-amber-800 mb-2">
                    {t("importantNotice.title")}
                  </h3>
                  <p className="text-amber-700 text-sm">
                    {t("importantNotice.description")}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons — disabled while submitting (mirrors Flutter's PopScope) */}
            <div className="flex flex-col sm:flex-row gap-4 pt-8">
              <button
                onClick={handleEdit}
                disabled={isSubmitting}
                className="flex-1 px-8 py-4 bg-white border-2 border-slate-300 text-slate-700 font-semibold rounded-2xl transition-all hover:border-slate-400 hover:bg-slate-50 shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="w-5 h-5"
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
                </span>
              </button>

              <button
                onClick={handleConfirmAndList}
                disabled={isSubmitting || initializing}
                className="flex-1 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transition-all hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                      {t("buttons.submitting")}
                    </>
                  ) : (
                    <>
                      <svg
                        className="w-5 h-5"
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
                </span>
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