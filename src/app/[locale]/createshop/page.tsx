"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../../lib/firebase";
import { useUser } from "@/context/UserProvider";
import SecondHeader from "../../components/market_screen/SecondHeader";
import { AllInOneCategoryData } from "../../../constants/productData";
import { sanitizeShopApplication } from "@/lib/sanitize";
import {
  XMarkIcon,
  ChevronRightIcon,
  CheckIcon,
  CameraIcon,
  DocumentTextIcon,
  MapPinIcon,
} from "@heroicons/react/24/outline";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

interface AppLocalizations {
  [key: string]: string;
}
interface Category {
  code: string;
  name: string;
}

declare global {
  interface Window {
    google: typeof google;
  }
}

const getLocalizedCategories = (t: (key: string) => string): Category[] => {
  const appLocalizations = new Proxy({} as AppLocalizations, {
    get: (_, prop: string) => {
      try {
        return t(prop);
      } catch {
        return prop;
      }
    },
  });
  return AllInOneCategoryData.kCategories.map((category) => ({
    code: category.key.toLowerCase().replace(/\s+/g, "-").replace(/&/g, ""),
    name: AllInOneCategoryData.localizeCategoryKey(
      category.key,
      appLocalizations,
    ),
  }));
};

export default function CreateShopPage() {
  const router = useRouter();
  const { user } = useUser();
  const t = useTranslations("createShop");

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [address, setAddress] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [acceptedAgreement, setAcceptedAgreement] = useState(false);
  const [coordinates, setCoordinates] = useState<{
    latitude: number | null;
    longitude: number | null;
  }>({ latitude: null, longitude: null });
  const [showMapModal, setShowMapModal] = useState(false);

  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [coverImages, setCoverImages] = useState<(File | null)[]>([
    null,
    null,
    null,
  ]);
  const [taxCertificate, setTaxCertificate] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(
    null,
  );
  const [coverImagePreviews, setCoverImagePreviews] = useState<
    (string | null)[]
  >([null, null, null]);
  const [taxCertificatePreview, setTaxCertificatePreview] = useState<
    string | null
  >(null);

  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const taxInputRef = useRef<HTMLInputElement>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const CATEGORIES = getLocalizedCategories(t);

  // Google Maps
  React.useEffect(() => {
    if (!showMapModal) return;
    const initMap = () => {
      const el = document.getElementById("shop-location-map");
      if (!el) return;
      const loc = {
        lat: coordinates.latitude || 35.1264,
        lng: coordinates.longitude || 33.9293,
      };
      const map = new google.maps.Map(el, {
        center: loc,
        zoom: 15,
        gestureHandling: "greedy",
      });
      el.addEventListener("wheel", (e) => e.stopPropagation(), {
        passive: false,
      });
      const marker = new google.maps.Marker({
        position: loc,
        map,
        draggable: true,
        title: t("pinShopLocation"),
      });
      marker.addListener("dragend", () => {
        const p = marker.getPosition();
        if (p) setCoordinates({ latitude: p.lat(), longitude: p.lng() });
      });
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          marker.setPosition(e.latLng);
          setCoordinates({
            latitude: e.latLng.lat(),
            longitude: e.latLng.lng(),
          });
        }
      });
    };
    if (window.google?.maps) {
      initMap();
      return;
    }
    const existing = document.querySelector(
      'script[src*="maps.googleapis.com"]',
    );
    if (existing) {
      existing.addEventListener("load", initMap);
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=Function.prototype`;
    script.async = true;
    script.defer = true;
    script.onload = initMap;
    script.onerror = () => alert("Failed to load map.");
    document.head.appendChild(script);
  }, [showMapModal, t, coordinates.latitude, coordinates.longitude]);

  // Theme
  React.useEffect(() => {
    const check = () => {
      if (typeof document !== "undefined")
        setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    check();
    const obs = new MutationObserver(check);
    if (typeof document !== "undefined")
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => obs.disconnect();
  }, []);

  // File handling
  const handleFileSelect = (
    file: File,
    type: "profile" | "cover" | "tax",
    index?: number,
  ) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (type === "profile") {
        setProfileImage(file);
        setProfileImagePreview(result);
      } else if (type === "cover" && index !== undefined) {
        const ci = [...coverImages];
        const cp = [...coverImagePreviews];
        ci[index] = file;
        cp[index] = result;
        setCoverImages(ci);
        setCoverImagePreviews(cp);
      } else if (type === "tax") {
        setTaxCertificate(file);
        setTaxCertificatePreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  const validateFile = (file: File): boolean => {
    if (file.size > 30 * 1024 * 1024) {
      alert(t("fileTooLarge"));
      return false;
    }
    if (
      ![
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ].includes(file.type)
    ) {
      alert(t("invalidFileType"));
      return false;
    }
    return true;
  };

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "profile" | "cover" | "tax",
    index?: number,
  ) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) handleFileSelect(file, type, index);
  };

  const uploadFile = async (file: File, folder: string): Promise<string> => {
    if (!user) throw new Error("Not authenticated");
    const storageRef = ref(
      storage,
      `shop_applications/${user.uid}/${folder}_${Date.now()}.jpg`,
    );
    const snapshot = await uploadBytes(storageRef, file);
    return getDownloadURL(snapshot.ref);
  };

  const removeImage = (type: "profile" | "cover" | "tax", index?: number) => {
    if (type === "profile") {
      setProfileImage(null);
      setProfileImagePreview(null);
    } else if (type === "cover" && index !== undefined) {
      const ci = [...coverImages];
      const cp = [...coverImagePreviews];
      ci[index] = null;
      cp[index] = null;
      setCoverImages(ci);
      setCoverImagePreviews(cp);
    } else if (type === "tax") {
      setTaxCertificate(null);
      setTaxCertificatePreview(null);
    }
  };

  const toggleCategory = (category: Category) => {
    setSelectedCategories((prev) =>
      prev.some((c) => c.code === category.code)
        ? prev.filter((c) => c.code !== category.code)
        : [...prev, category],
    );
  };

  const handleSubmit = async () => {
    if (!user) {
      alert("Please log in");
      return;
    }
    if (
      !shopName.trim() ||
      !email.trim() ||
      !contactNo.trim() ||
      !address.trim() ||
      selectedCategories.length === 0 ||
      !profileImage ||
      !taxCertificate ||
      coverImages.every((i) => i === null) ||
      !coordinates.latitude ||
      !coordinates.longitude
    ) {
      alert(t("enterAllFields"));
      return;
    }
    if (!acceptedAgreement) {
      alert(t("mustAcceptAgreement"));
      return;
    }
    let sanitizedData;
    try {
      sanitizedData = sanitizeShopApplication({
        name: shopName,
        email,
        contactNo,
        address,
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : t("enterAllFields"));
      return;
    }
    setIsSubmitting(true);
    try {
      const profileImageUrl = await uploadFile(profileImage, "profile_image");
      const coverImageUrls: string[] = [];
      for (const ci of coverImages) {
        if (ci) coverImageUrls.push(await uploadFile(ci, "cover_image"));
      }
      const taxCertificateUrl = await uploadFile(
        taxCertificate,
        "tax_plate_certificate",
      );
      await addDoc(collection(db, "shopApplications"), {
        ownerId: user.uid,
        name: sanitizedData.name,
        email: sanitizedData.email,
        contactNo: sanitizedData.contactNo,
        address: sanitizedData.address,
        categories: selectedCategories.map((c) => c.code),
        categoryNames: selectedCategories.map((c) => c.name),
        profileImageUrl,
        coverImageUrl: coverImageUrls.join(","),
        taxPlateCertificateUrl: taxCertificateUrl,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        createdAt: serverTimestamp(),
        status: "pending",
      });
      alert(t("shopApplicationSent"));
      setShopName("");
      setEmail("");
      setContactNo("");
      setAddress("");
      setSelectedCategories([]);
      setAcceptedAgreement(false);
      setProfileImage(null);
      setCoverImages([null, null, null]);
      setTaxCertificate(null);
      setProfileImagePreview(null);
      setCoverImagePreviews([null, null, null]);
      setTaxCertificatePreview(null);
      router.back();
    } catch (error) {
      console.error("Error:", error);
      alert(t("errorSubmittingApplication") + ": " + error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ============================================================================
  // Image Picker Component
  // ============================================================================

  const ImagePicker = ({
    title,
    preview,
    onSelect,
    onRemove,
    size = 100,
    icon: Icon = CameraIcon,
    subtitle,
  }: {
    title?: string;
    preview: string | null;
    onSelect: () => void;
    onRemove?: () => void;
    size?: number;
    icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    subtitle?: string;
  }) => (
    <div className="flex flex-col items-center">
      {title && (
        <div className="text-center mb-2">
          <h3
            className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              className={`text-[11px] mt-0.5 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
      <div
        className="relative group cursor-pointer"
        style={{ width: size, height: size }}
        onClick={onSelect}
      >
        {preview ? (
          <div className="relative w-full h-full">
            <Image
              src={preview}
              alt="Preview"
              fill
              className="object-cover rounded-xl"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all rounded-xl flex items-center justify-center">
              <CameraIcon className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow transition-colors"
              >
                <XMarkIcon className="w-3 h-3" />
              </button>
            )}
          </div>
        ) : (
          <div
            className={`w-full h-full border-2 border-dashed rounded-xl flex flex-col items-center justify-center transition-colors ${
              isDarkMode
                ? "border-gray-600 bg-gray-700/30 group-hover:border-orange-500/50"
                : "border-gray-200 bg-gray-50 group-hover:border-orange-300"
            }`}
          >
            <Icon
              className={`w-5 h-5 mb-1 transition-colors ${isDarkMode ? "text-gray-400 group-hover:text-orange-400" : "text-gray-400 group-hover:text-orange-500"}`}
            />
            <span
              className={`text-[11px] font-medium transition-colors ${isDarkMode ? "text-gray-400 group-hover:text-orange-400" : "text-gray-400 group-hover:text-orange-500"}`}
            >
              {t("upload")}
            </span>
          </div>
        )}
      </div>
    </div>
  );

  // ============================================================================
  // Field Card Helper
  // ============================================================================
  const FieldCard = ({
    label,
    children,
  }: {
    label: string;
    children: React.ReactNode;
  }) => (
    <div
      className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
    >
      <label
        className={`block text-[11px] font-semibold uppercase tracking-wider mb-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
      >
        {label}
      </label>
      {children}
    </div>
  );

  const inputClass = `w-full px-3 py-2 rounded-xl text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-orange-500/20 ${
    isDarkMode
      ? "bg-gray-700 text-white border-gray-600 placeholder-gray-500"
      : "bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400"
  }`;

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <>
      <SecondHeader />
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        {/* Sticky Toolbar */}
        <div
          className={`sticky top-14 z-30 border-b ${isDarkMode ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80" : "bg-white/80 backdrop-blur-xl border-gray-100/80"}`}
        >
          <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
            <button
              onClick={() => router.back()}
              className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
                  : "bg-gray-50 border-gray-200 hover:bg-gray-100"
              }`}
            >
              <XMarkIcon
                className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              />
            </button>
            <h1
              className={`text-lg font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("createAndNameYourShop")}
            </h1>
          </div>
        </div>

        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4">
          {/* Header Banner */}
          <div
            className={`rounded-2xl p-4 mb-4 text-center ${isDarkMode ? "bg-orange-900/10 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
          >
            <div
              className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center overflow-hidden ${isDarkMode ? "bg-gray-800" : "bg-white"} shadow-sm`}
            >
              <Image
                src="/images/shopbubble.png"
                alt="Shop"
                width={40}
                height={40}
                className="object-cover"
              />
            </div>
            <h2
              className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("createAndNameYourShop")}
            </h2>
          </div>

          {/* Form Grid */}
          <div className="grid lg:grid-cols-2 gap-3">
            {/* Left Column */}
            <div className="space-y-3">
              <FieldCard label={t("nameYourShop")}>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder={t("enterShopName")}
                  className={inputClass}
                />
              </FieldCard>

              <FieldCard label={t("email")}>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("enterEmail")}
                  className={inputClass}
                />
              </FieldCard>

              <FieldCard label={t("contactNo")}>
                <input
                  type="tel"
                  value={contactNo}
                  onChange={(e) => setContactNo(e.target.value)}
                  placeholder={t("enterContactNo")}
                  className={inputClass}
                />
              </FieldCard>

              <FieldCard label={t("shopAddress")}>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("enterAddress")}
                  rows={2}
                  className={`${inputClass} resize-none`}
                />
              </FieldCard>

              <FieldCard label={t("pinShopLocation")}>
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className={`w-full px-3 py-2 rounded-xl text-sm border flex items-center justify-between transition-all ${
                    isDarkMode
                      ? "bg-gray-700 text-white border-gray-600 hover:border-gray-500"
                      : "bg-gray-50 text-gray-900 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <MapPinIcon className="w-4 h-4 text-orange-500" />
                    {coordinates.latitude && coordinates.longitude
                      ? t("locationPinned")
                      : t("pinShopLocation")}
                  </span>
                  {coordinates.latitude && coordinates.longitude && (
                    <CheckIcon className="w-4 h-4 text-green-500" />
                  )}
                </button>
                {coordinates.latitude && coordinates.longitude && (
                  <p
                    className={`text-[11px] mt-1 text-center ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {coordinates.latitude.toFixed(6)},{" "}
                    {coordinates.longitude.toFixed(6)}
                  </p>
                )}
              </FieldCard>

              <FieldCard label={t("selectCategory")}>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className={`w-full px-3 py-2 rounded-xl text-sm border flex items-center justify-between transition-all ${
                    isDarkMode
                      ? "bg-gray-700 text-white border-gray-600 hover:border-gray-500"
                      : "bg-gray-50 text-gray-900 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span
                    className={`truncate ${selectedCategories.length === 0 ? "opacity-50" : ""}`}
                  >
                    {selectedCategories.length === 0
                      ? t("selectCategory")
                      : selectedCategories.map((c) => c.name).join(", ")}
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {selectedCategories.length > 0 && (
                      <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {selectedCategories.length}
                      </span>
                    )}
                    <ChevronRightIcon className="w-4 h-4" />
                  </span>
                </button>
              </FieldCard>
            </div>

            {/* Right Column - Images */}
            <div className="space-y-3">
              <div
                className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
              >
                <ImagePicker
                  title={t("taxPlateCertificate")}
                  preview={taxCertificatePreview}
                  onSelect={() => taxInputRef.current?.click()}
                  onRemove={() => removeImage("tax")}
                  icon={DocumentTextIcon}
                  size={90}
                />
                <input
                  ref={taxInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange(e, "tax")}
                />
              </div>

              <div
                className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
              >
                <ImagePicker
                  title={t("uploadProfileImage")}
                  preview={profileImagePreview}
                  onSelect={() => profileInputRef.current?.click()}
                  onRemove={() => removeImage("profile")}
                  size={90}
                />
                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange(e, "profile")}
                />
              </div>

              <div
                className={`rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
              >
                <div className="text-center mb-2">
                  <h3
                    className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {t("uploadCoverImage")}
                  </h3>
                </div>
                <div className="flex gap-2 justify-center">
                  {coverImages.map((_, index) => (
                    <div key={index}>
                      <ImagePicker
                        preview={coverImagePreviews[index]}
                        onSelect={() => coverInputRefs[index].current?.click()}
                        onRemove={() => removeImage("cover", index)}
                        size={70}
                      />
                      <input
                        ref={coverInputRefs[index]}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageChange(e, "cover", index)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Agreement */}
          <div
            className={`mt-3 rounded-2xl border p-4 ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
          >
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="agreement"
                checked={acceptedAgreement}
                onChange={(e) => setAcceptedAgreement(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-2 border-gray-300 text-orange-500 focus:ring-2 focus:ring-orange-500/20 cursor-pointer"
              />
              <label
                htmlFor="agreement"
                className={`text-xs cursor-pointer select-none ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {t("iHaveReadAndAccept")}{" "}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    router.push("/agreements/seller");
                  }}
                  className="font-semibold text-orange-500 hover:text-orange-600 underline underline-offset-2 transition-colors"
                >
                  {t("sellerAgreement")}
                </button>
              </label>
            </div>
          </div>

          {/* Submit */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full sm:w-auto sm:min-w-[200px] flex items-center justify-center gap-2 py-3 px-8 bg-orange-500 text-white rounded-xl font-semibold text-sm hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t("submitting")}
                </>
              ) : (
                t("apply")
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Map Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh] ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <h3
                className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("pinShopLocation")}
              </h3>
              <button
                onClick={() => setShowMapModal(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <XMarkIcon
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4">
              <div
                id="shop-location-map"
                className={`w-full h-[400px] rounded-xl border ${isDarkMode ? "border-gray-600" : "border-gray-200"}`}
              />
              <p
                className={`text-[11px] text-center mt-2 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              >
                {t("mapInstructions")}
              </p>
              {coordinates.latitude && coordinates.longitude && (
                <p className="text-[11px] font-semibold text-orange-500 mt-1 text-center">
                  {coordinates.latitude.toFixed(6)},{" "}
                  {coordinates.longitude.toFixed(6)}
                </p>
              )}
            </div>
            <div
              className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <button
                onClick={() => setShowMapModal(false)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${isDarkMode ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => setShowMapModal(false)}
                disabled={!coordinates.latitude || !coordinates.longitude}
                className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl text-xs font-medium hover:bg-orange-600 disabled:opacity-50 transition-colors"
              >
                {t("confirmLocation")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className={`w-full max-w-sm rounded-2xl shadow-2xl max-h-[85vh] flex flex-col ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div
              className={`flex items-center justify-between p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <h3
                className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
              >
                {t("selectCategory")}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className={`w-8 h-8 flex items-center justify-center rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              >
                <XMarkIcon
                  className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {CATEGORIES.map((category) => {
                const isSelected = selectedCategories.some(
                  (c) => c.code === category.code,
                );
                return (
                  <button
                    key={category.code}
                    onClick={() => toggleCategory(category)}
                    className={`w-full px-3 py-2.5 rounded-xl text-left text-sm font-medium flex items-center justify-between transition-all ${
                      isSelected
                        ? isDarkMode
                          ? "bg-orange-900/20 text-orange-400 border border-orange-700/50"
                          : "bg-orange-50 text-orange-700 border border-orange-200"
                        : isDarkMode
                          ? "text-gray-300 hover:bg-gray-700"
                          : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span>{category.name}</span>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                        <CheckIcon className="w-3 h-3 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div
              className={`p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
            >
              <button
                onClick={() => {
                  if (selectedCategories.length === 0)
                    alert(t("selectAtLeastOneCategory"));
                  else setShowCategoryModal(false);
                }}
                className="w-full py-2.5 bg-orange-500 text-white rounded-xl text-sm font-medium hover:bg-orange-600 transition-colors"
              >
                {t("done")} ({selectedCategories.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className={`p-6 rounded-2xl shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
          >
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
              <div className="text-center">
                <p
                  className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {t("submitting")}...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
