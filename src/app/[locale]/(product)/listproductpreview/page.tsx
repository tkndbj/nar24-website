"use client";

import React, { useState, useEffect, useCallback } from "react";
import { auth, db, storage } from "@/lib/firebase";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { User } from "firebase/auth";
import { useProduct } from "../../../../context/ProductContext";
import { useTranslations, useLocale } from "next-intl";

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
  selectedColors: { [key: string]: { quantity: string; image: File | null } };
  images: File[];
  video: File | null;
  phone: string;
  region: string;
  address: string;
  ibanOwnerName: string;
  ibanOwnerSurname: string;
  iban: string;
  shopId: string | null;
}

export default function ListProductPreview() {
  const router = useRouter();
  const { productData, productFiles, clearProductData } = useProduct();
  const t = useTranslations("productPreview");
  const [fullProductData, setFullProductData] = useState<ProductData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const uid = user?.uid;

  const locale = useLocale(); // ADD THIS

  // ADD THIS HELPER FUNCTION
  const buildLocalizedUrl = useCallback(
    (path: string): string => {
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;
      return locale === "tr" ? `/${cleanPath}` : `/${locale}/${cleanPath}`;
    },
    [locale]
  );

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

  // NEW: Use ProductContext instead of sessionStorage
  useEffect(() => {
    if (!productData || !productFiles) {
      router.push(buildLocalizedUrl("/listproduct"));
      return;
    }

    // Combine productData and productFiles from context
    const combinedData: ProductData = {
      ...productData,
      images: productFiles.images,
      video: productFiles.video,
      selectedColors: productFiles.selectedColorImages,
    };

    setFullProductData(combinedData);
  }, [productData, productFiles, router, buildLocalizedUrl]);

  // Helper function to get localized attribute titles
  const getLocalizedAttributeTitle = (attributeKey: string): string => {
    const attributeMap: Record<string, string> = {
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
    };

    return (
      attributeMap[attributeKey] ||
      attributeKey
        .replace(/([A-Z])/g, " $1")
        .trim()
        .replace(/^\w/, (c) => c.toUpperCase())
    );
  };

  if (initializing) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>{t("authChecking")}</p>
      </div>
    );
  }

  const handleEdit = () => {
    // Set a flag in sessionStorage to indicate returning from preview
    sessionStorage.setItem("returningFromPreview", "true");
    router.push(buildLocalizedUrl("/listproduct"));
  };

  const handleConfirmAndList = async () => {
    if (!uid) {
      alert(t("pleaseLogin"));
      return;
    }

    if (!fullProductData) {
      alert(t("productDataNotFound"));
      return;
    }

    setIsLoading(true);
    try {
      const productId = crypto.randomUUID();

      // 1️⃣ upload main product images
      const mainImageUrls = await Promise.all(
        fullProductData.images.map(async (file) => {
          const imgRef = storageRef(
            storage,
            `products/${uid}/default_images/${Date.now()}_${file.name}`
          );
          await uploadBytes(imgRef, file);
          return getDownloadURL(imgRef);
        })
      );

      // 2️⃣ upload optional video
      let videoUrl: string | null = null;
      if (fullProductData.video) {
        const vidRef = storageRef(
          storage,
          `products/${uid}/preview_videos/${Date.now()}_${
            fullProductData.video.name
          }`
        );
        await uploadBytes(vidRef, fullProductData.video);
        videoUrl = await getDownloadURL(vidRef);
      }

      // 3️⃣ upload each selected‐color image AND collect their URLs
      const selectedColorsPayload: Record<
        string,
        { quantity: string; imageUrl: string | null }
      > = {};

      const colorImages: Record<string, string[]> = {};
      const colorQuantities: Record<string, number> = {};
      const availableColors = Object.keys(fullProductData.selectedColors || {});

      for (const [color, info] of Object.entries(
        fullProductData.selectedColors
      )) {
        let imageUrl: string | null = null;
        if (info.image) {
          const colRef = storageRef(
            storage,
            `products/${uid}/color_images/${Date.now()}_${color}.jpg`
          );
          await uploadBytes(colRef, info.image);
          imageUrl = await getDownloadURL(colRef);

          if (imageUrl) {
            colorImages[color] = [imageUrl];
          }
        }

        selectedColorsPayload[color] = {
          quantity: info.quantity,
          imageUrl,
        };

        if (info.quantity && parseInt(info.quantity) > 0) {
          colorQuantities[color] = parseInt(info.quantity);
        }
      }

      // 4️⃣ Create searchIndex as array
      const searchTerms = [
        fullProductData.title.toLowerCase(),
        fullProductData.description.toLowerCase(),
        fullProductData.category.toLowerCase(),
        fullProductData.subcategory.toLowerCase(),
        fullProductData.subsubcategory.toLowerCase(),
        fullProductData.brand?.toLowerCase(),
        ...Object.values(fullProductData.attributes || {}).flatMap((value) => {
          if (Array.isArray(value)) {
            return value.map((v) => v.toString().toLowerCase());
          }
          return [value.toString().toLowerCase()];
        }),
        ...Object.keys(fullProductData.selectedColors).map((c) =>
          c.toLowerCase()
        ),
      ].filter((term) => term && term.trim().length > 0);

      const searchIndexArray = Array.from(new Set(searchTerms));

      // 5️⃣ Get seller name
      let sellerName = t("unknownSeller");
      const userDoc = await getDoc(doc(db, "users", uid));
      const userData = userDoc.exists() ? userDoc.data() : {};
      sellerName =
        userData.displayName ||
        userData.name ||
        fullProductData.ibanOwnerName ||
        t("unknownSeller");

      const ensureString = (value: unknown): string => {
        return value ? String(value) : "";
      };

      const ensureNumber = (value: unknown): number => {
        const num = parseFloat(value as string);
        return isNaN(num) ? 0 : num;
      };

      const ensureInteger = (value: unknown): number => {
        const num = parseInt(value as string);
        return isNaN(num) ? 0 : num;
      };

      // 6️⃣ Build complete Firestore payload
      const applicationData = {
        id: productId,
        productName: ensureString(fullProductData.title),
        description: ensureString(fullProductData.description),
        price: ensureNumber(fullProductData.price),
        currency: "TL",
        originalPrice: null,
        discountPercentage: null,
        discountThreshold: null,
        condition: ensureString(fullProductData.condition),
        brandModel: ensureString(fullProductData.brand),
        availableColors,
        imageUrls: mainImageUrls,
        videoUrl: videoUrl,
        colorImages: colorImages,
        averageRating: 0.0,
        reviewCount: 0,
        userId: uid,
        ownerId: uid,
        shopId: null,
        ilanNo: productId,
        sellerName: sellerName,
        category: ensureString(fullProductData.category),
        subcategory: ensureString(fullProductData.subcategory),
        subsubcategory: ensureString(fullProductData.subsubcategory),
        quantity: ensureInteger(fullProductData.quantity),
        colorQuantities: colorQuantities,        
        gender: fullProductData.attributes?.gender || null,
        attributes: fullProductData.attributes || {},
        deliveryOption: ensureString(fullProductData.deliveryOption),
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
        rankingScore: 0.0,
        promotionScore: 0.0,
        dailyClickCount: 0,
        boostStartTime: null,
        boostEndTime: null,
        lastClickDate: null,
        createdAt: serverTimestamp(),
        searchIndex: searchIndexArray,
        paused: false,
        bestSellerRank: null,
        needsSync: true,
        updatedAt: serverTimestamp(),
        phone: ensureString(fullProductData.phone),
        region: ensureString(fullProductData.region),
        address: ensureString(fullProductData.address),
        ibanOwnerName: ensureString(fullProductData.ibanOwnerName),
        ibanOwnerSurname: ensureString(fullProductData.ibanOwnerSurname),
        iban: ensureString(fullProductData.iban),
      };

      // 7️⃣ Validate critical fields
      if (!applicationData.productName) {
        throw new Error(t("validationErrors.productNameRequired"));
      }
      if (!applicationData.price || applicationData.price <= 0) {
        throw new Error(t("validationErrors.validPriceRequired"));
      }
      if (!applicationData.quantity || applicationData.quantity <= 0) {
        throw new Error(t("validationErrors.validQuantityRequired"));
      }
      if (
        !applicationData.imageUrls ||
        applicationData.imageUrls.length === 0
      ) {
        throw new Error(t("validationErrors.imageRequired"));
      }

      // 8️⃣ Write to Firestore
      await setDoc(doc(db, "product_applications", productId), applicationData);

      // 9️⃣ Clear context and navigate
      clearProductData();
      sessionStorage.setItem("productFormReset", "true");
      router.push(buildLocalizedUrl("/success"));
    } catch (err) {
      console.error("Product submission error:", err);
      alert(t("submitError"));
    } finally {
      setIsLoading(false);
    }
  };

  const DetailRow = ({ title, value }: { title: string; value: string }) => (
    <div className="flex justify-between items-start py-3 border-b border-slate-100 last:border-b-0">
      <span className="text-slate-600 font-medium text-sm w-32 flex-shrink-0">
        {title}:
      </span>
      <span className="text-slate-800 text-sm text-right flex-1">{value}</span>
    </div>
  );

  const SectionCard = ({
    title,
    icon,
    children,
  }: {
    title: string;
    icon: string;
    children: React.ReactNode;
  }) => (
    <div className="bg-white/70 backdrop-blur-sm rounded-3xl shadow-xl border border-white/20 p-8 transform-gpu will-change-transform transition-all duration-500 hover:shadow-2xl">
      <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">{icon}</span>
        </div>
        {title}
      </h2>
      <div className="space-y-1">{children}</div>
    </div>
  );

  const mapGenderToLocal = (englishGender: string): string => {
    const genderMap: Record<string, string> = {
      Women: t("genderOptions.women"),
      Men: t("genderOptions.men"),
      Unisex: t("genderOptions.unisex"),
    };
    return genderMap[englishGender] || englishGender;
  };

  if (!fullProductData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">{t("previewLoading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="container mx-auto px-4 pt-24 pb-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
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
                {/* Images */}
                {fullProductData.images.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-4">
                      {t("productImages", {
                        count: fullProductData.images.length,
                      })}
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {fullProductData.images.map((file, idx) => (
                        <div
                          key={idx}
                          className="aspect-square relative rounded-xl overflow-hidden shadow-md transform-gpu will-change-transform transition-all duration-300 hover:shadow-lg"
                        >
                          <Image
                            src={URL.createObjectURL(file)}
                            alt={t("productImageAlt", { index: idx + 1 })}
                            fill
                            className="object-cover"
                            unoptimized={true}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Video */}
                {fullProductData.video && (
                  <div>
                    <h4 className="text-lg font-semibold text-slate-700 mb-4">
                      {t("productVideo")}
                    </h4>
                    <div className="relative inline-block rounded-xl overflow-hidden shadow-lg">
                      <video
                        src={URL.createObjectURL(fullProductData.video)}
                        controls
                        className="w-64 h-auto"
                      />
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            {/* Product Details */}
            <SectionCard title={t("sections.productDetails")} icon="📝">
              <DetailRow
                title={t("fields.title")}
                value={fullProductData.title}
              />
              <DetailRow
                title={t("fields.description")}
                value={fullProductData.description}
              />
              <DetailRow
                title={t("fields.price")}
                value={`${fullProductData.price} TL`}
              />
              <DetailRow
                title={t("fields.quantity")}
                value={fullProductData.quantity}
              />
              <DetailRow
                title={t("fields.condition")}
                value={fullProductData.condition}
              />
              <DetailRow
                title={t("fields.deliveryOption")}
                value={fullProductData.deliveryOption}
              />
            </SectionCard>

            {/* Category & Classification */}
            <SectionCard title={t("sections.categoryClassification")} icon="🏷️">
              <DetailRow
                title={t("fields.category")}
                value={fullProductData.category}
              />
              {fullProductData.subcategory && (
                <DetailRow
                  title={t("fields.subcategory")}
                  value={fullProductData.subcategory}
                />
              )}
              {fullProductData.subsubcategory && (
                <DetailRow
                  title={t("fields.subsubcategory")}
                  value={fullProductData.subsubcategory}
                />
              )}
              {fullProductData.brand && (
                <DetailRow
                  title={t("fields.brand")}
                  value={fullProductData.brand}
                />
              )}
            </SectionCard>

            {/* Dynamic Product Specifications from Flow */}
            {fullProductData.attributes &&
              Object.keys(fullProductData.attributes).length > 0 && (
                <SectionCard title={t("sections.productSpecs")} icon="⚙️">
                  {Object.entries(fullProductData.attributes).map(
                    ([key, value]) => {
                      if (!value) return null;

                      let displayValue = "";
                      if (Array.isArray(value)) {
                        displayValue = value.join(", ");
                      } else {
                        // Show localized gender text in preview
                        if (key === "gender") {
                          displayValue = mapGenderToLocal(value.toString());
                        } else {
                          displayValue = value.toString();
                        }
                      }

                      if (!displayValue.trim()) return null;

                      return (
                        <DetailRow
                          key={key}
                          title={getLocalizedAttributeTitle(key)}
                          value={displayValue}
                        />
                      );
                    }
                  )}
                </SectionCard>
              )}

            {/* Color Options */}
            {Object.keys(fullProductData.selectedColors).length > 0 && (
              <SectionCard title={t("sections.availableColors")} icon="🎨">
                <div className="space-y-4">
                  {Object.entries(fullProductData.selectedColors).map(
                    ([color, data]) => (
                      <div
                        key={color}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl transform-gpu will-change-transform"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-6 h-6 rounded-full border-2 border-white shadow-md bg-slate-300"></div>
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
                                unoptimized={true}
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
              {fullProductData.ibanOwnerName &&
                fullProductData.ibanOwnerSurname && (
                  <DetailRow
                    title={t("fields.accountHolder")}
                    value={`${fullProductData.ibanOwnerName} ${fullProductData.ibanOwnerSurname}`}
                  />
                )}
              <DetailRow
                title={t("fields.phone")}
                value={fullProductData.phone}
              />
              <DetailRow
                title={t("fields.region")}
                value={fullProductData.region}
              />
              <DetailRow
                title={t("fields.address")}
                value={fullProductData.address}
              />
              <DetailRow
                title={t("fields.iban")}
                value={fullProductData.iban}
              />
            </SectionCard>

            {/* Delivery Information */}
            <SectionCard title={t("sections.deliveryInfo")} icon="🚚">
              <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl transform-gpu will-change-transform">
                <div className="w-16 h-16 bg-blue-100 rounded-xl flex items-center justify-center">
                  <span className="text-2xl">
                    {fullProductData.deliveryOption === "Fast Delivery" ||
                    fullProductData.deliveryOption === "Hızlı Teslimat"
                      ? "⚡"
                      : "🤝"}
                  </span>
                </div>
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-800">
                    {fullProductData.deliveryOption}
                  </h4>
                  <p className="text-slate-600 text-sm">
                    {fullProductData.deliveryOption === "Fast Delivery" ||
                    fullProductData.deliveryOption === "Hızlı Teslimat"
                      ? t("deliveryDescriptions.fast")
                      : t("deliveryDescriptions.selfManaged")}
                  </p>
                </div>
              </div>
            </SectionCard>

            {/* Important Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 transform-gpu will-change-transform">
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

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 pt-8">
              <button
                onClick={handleEdit}
                className="flex-1 px-8 py-4 bg-white border-2 border-slate-300 text-slate-700 font-semibold rounded-2xl transform-gpu will-change-transform transition-all duration-300 hover:border-slate-400 hover:bg-slate-50 shadow-lg hover:shadow-xl"
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
                disabled={isLoading || initializing}
                className="flex-1 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-2xl shadow-xl hover:shadow-2xl transform-gpu will-change-transform transition-all duration-300 hover:scale-[1.02] disabled:opacity-70 disabled:cursor-not-allowed"
              >
                <span className="flex items-center justify-center gap-2">
                  {isLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
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

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-3xl p-8 max-w-sm mx-4 text-center shadow-2xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              {t("loadingOverlay.title")}
            </h3>
            <p className="text-slate-600 text-sm">
              {t("loadingOverlay.description")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
