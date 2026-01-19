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
  PlusIcon,
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

// Get categories from AllInOneCategoryData with localization
const getLocalizedCategories = (t: (key: string) => string): Category[] => {
  const createAppLocalizations = (
    translateFn: (key: string) => string
  ): AppLocalizations => {
    return new Proxy({} as AppLocalizations, {
      get: (target, prop: string) => {
        try {
          return translateFn(prop);
        } catch {
          return prop;
        }
      },
    });
  };

  const appLocalizations = createAppLocalizations(t);

  return AllInOneCategoryData.kCategories.map((category) => ({
    code: category.key.toLowerCase().replace(/\s+/g, "-").replace(/&/g, ""),
    name: AllInOneCategoryData.localizeCategoryKey(
      category.key,
      appLocalizations
    ),
  }));
};

export default function CreateShopPage() {
  const router = useRouter();
  const { user } = useUser();
  const t = useTranslations("createShop");

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form data
  const [shopName, setShopName] = useState("");
  const [email, setEmail] = useState("");
  const [contactNo, setContactNo] = useState("");
  const [address, setAddress] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [acceptedAgreement, setAcceptedAgreement] = useState(false);

  const [coordinates, setCoordinates] = useState<{
    latitude: number | null;
    longitude: number | null;
  }>({
    latitude: null,
    longitude: null,
  });
  const [showMapModal, setShowMapModal] = useState(false);

  // Images
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [coverImages, setCoverImages] = useState<(File | null)[]>([
    null,
    null,
    null,
  ]);
  const [taxCertificate, setTaxCertificate] = useState<File | null>(null);

  // Image previews
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(
    null
  );
  const [coverImagePreviews, setCoverImagePreviews] = useState<
    (string | null)[]
  >([null, null, null]);
  const [taxCertificatePreview, setTaxCertificatePreview] = useState<
    string | null
  >(null);

  // Refs for file inputs
  const profileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];
  const taxInputRef = useRef<HTMLInputElement>(null);

  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // Get localized categories
  const CATEGORIES = getLocalizedCategories(t);

  // Load Google Maps when modal opens
  React.useEffect(() => {
    if (!showMapModal) return;

    const loadGoogleMaps = () => {
      if (window.google?.maps) {
        initMap();
        return;
      }

      const existingScript = document.querySelector(
        'script[src*="maps.googleapis.com"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", initMap);
        return;
      }

      const script = document.createElement("script");
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=Function.prototype`;
      script.async = true;
      script.defer = true;
      script.onload = initMap;
      script.onerror = () => {
        console.error("Failed to load Google Maps");
        alert("Failed to load map. Please try again.");
      };
      document.head.appendChild(script);
    };

    const initMap = () => {
      const mapElement = document.getElementById("shop-location-map");
      if (!mapElement) return;

      const defaultLocation = {
        lat: coordinates.latitude || 35.1264,
        lng: coordinates.longitude || 33.9293,
      };

      const map = new google.maps.Map(mapElement, {
        center: defaultLocation,
        zoom: 15,
        gestureHandling: "greedy", // ADD THIS - allows scroll zoom without Ctrl key
      });

      // ADD THIS - Prevent scroll propagation to background
      mapElement.addEventListener(
        "wheel",
        (e) => {
          e.stopPropagation();
        },
        { passive: false }
      );

      const marker = new google.maps.Marker({
        position: defaultLocation,
        map: map,
        draggable: true,
        title: t("pinShopLocation"),
      });

      marker.addListener("dragend", () => {
        const position = marker.getPosition();
        if (position) {
          setCoordinates({
            latitude: position.lat(),
            longitude: position.lng(),
          });
        }
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

    loadGoogleMaps();
  }, [showMapModal, t, coordinates.latitude, coordinates.longitude]);

  // Handle theme detection
  React.useEffect(() => {
    const checkTheme = () => {
      if (typeof document !== "undefined") {
        setIsDarkMode(document.documentElement.classList.contains("dark"));
      }
    };

    checkTheme();
    const observer = new MutationObserver(checkTheme);
    if (typeof document !== "undefined") {
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
    return () => observer.disconnect();
  }, []);

  // Handle file selection and preview
  const handleFileSelect = (
    file: File,
    type: "profile" | "cover" | "tax",
    index?: number
  ) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;

      if (type === "profile") {
        setProfileImage(file);
        setProfileImagePreview(result);
      } else if (type === "cover" && index !== undefined) {
        const newCoverImages = [...coverImages];
        const newPreviews = [...coverImagePreviews];
        newCoverImages[index] = file;
        newPreviews[index] = result;
        setCoverImages(newCoverImages);
        setCoverImagePreviews(newPreviews);
      } else if (type === "tax") {
        setTaxCertificate(file);
        setTaxCertificatePreview(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Validate file
  const validateFile = (file: File): boolean => {
    const maxSize = 30 * 1024 * 1024; // 30MB
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];

    if (file.size > maxSize) {
      alert(t("fileTooLarge"));
      return false;
    }

    if (!allowedTypes.includes(file.type)) {
      alert(t("invalidFileType"));
      return false;
    }

    return true;
  };

  // Handle image input change
  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "profile" | "cover" | "tax",
    index?: number
  ) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      handleFileSelect(file, type, index);
    }
  };

  // Upload file to Firebase Storage
  const uploadFile = async (file: File, folder: string): Promise<string> => {
    if (!user) throw new Error("User not authenticated");

    const fileName = `shop_applications/${
      user.uid
    }/${folder}_${Date.now()}.jpg`;
    const storageRef = ref(storage, fileName);

    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    return downloadURL;
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!user) {
      alert("Please log in to create a shop");
      return;
    }

    // Validation
    if (
      !shopName.trim() ||
      !email.trim() ||
      !contactNo.trim() ||
      !address.trim() ||
      selectedCategories.length === 0 ||
      !profileImage ||
      !taxCertificate ||
      coverImages.every((img) => img === null) ||
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

    // Sanitize and validate input before submission
    let sanitizedData;
    try {
      sanitizedData = sanitizeShopApplication({
        name: shopName,
        email: email,
        contactNo: contactNo,
        address: address,
      });
    } catch (validationError) {
      alert(validationError instanceof Error ? validationError.message : t("enterAllFields"));
      return;
    }

    setIsSubmitting(true);

    try {
      // Upload images
      const profileImageUrl = await uploadFile(profileImage, "profile_image");

      const coverImageUrls: string[] = [];
      for (const coverImage of coverImages) {
        if (coverImage) {
          const url = await uploadFile(coverImage, "cover_image");
          coverImageUrls.push(url);
        }
      }

      const taxCertificateUrl = await uploadFile(
        taxCertificate,
        "tax_plate_certificate"
      );

      // Save to Firestore with sanitized data
      await addDoc(collection(db, "shopApplications"), {
        ownerId: user.uid,
        name: sanitizedData.name,
        email: sanitizedData.email,
        contactNo: sanitizedData.contactNo,
        address: sanitizedData.address,
        categories: selectedCategories.map((cat) => cat.code),
        categoryNames: selectedCategories.map((cat) => cat.name),
        profileImageUrl,
        coverImageUrl: coverImageUrls.join(","),
        taxPlateCertificateUrl: taxCertificateUrl,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        createdAt: serverTimestamp(),
        status: "pending",
      });

      // Show success message
      alert(t("shopApplicationSent"));

      // Reset form
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

      // Navigate back
      router.back();
    } catch (error) {
      console.error("Error submitting application:", error);
      alert(t("errorSubmittingApplication") + ": " + error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle category selection
  const toggleCategory = (category: Category) => {
    const isSelected = selectedCategories.some(
      (cat) => cat.code === category.code
    );
    if (isSelected) {
      setSelectedCategories((prev) =>
        prev.filter((cat) => cat.code !== category.code)
      );
    } else {
      setSelectedCategories((prev) => [...prev, category]);
    }
  };

  // Remove image
  const removeImage = (type: "profile" | "cover" | "tax", index?: number) => {
    if (type === "profile") {
      setProfileImage(null);
      setProfileImagePreview(null);
    } else if (type === "cover" && index !== undefined) {
      const newCoverImages = [...coverImages];
      const newPreviews = [...coverImagePreviews];
      newCoverImages[index] = null;
      newPreviews[index] = null;
      setCoverImages(newCoverImages);
      setCoverImagePreviews(newPreviews);
    } else if (type === "tax") {
      setTaxCertificate(null);
      setTaxCertificatePreview(null);
    }
  };

  // Modern Image Picker component
  const ImagePicker = ({
    title,
    preview,
    onSelect,
    onRemove,
    size = 120,
    icon = CameraIcon,
    subtitle,
  }: {
    title?: string;
    preview: string | null;
    onSelect: () => void;
    onRemove?: () => void;
    size?: number;
    icon?: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    subtitle?: string;
  }) => {
    const Icon = icon;

    return (
      <div className="flex flex-col items-center">
        {title && (
          <div className="text-center mb-2 sm:mb-3">
            <h3
              className={`text-sm sm:text-base font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                className={`text-xs mt-0.5 ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {subtitle}
              </p>
            )}
          </div>
        )}
        <div
          className={`relative group transition-all duration-300 cursor-pointer ${
            preview ? "scale-100" : "hover:scale-105"
          }`}
          style={{ width: size, height: size }}
          onClick={onSelect}
        >
          {preview ? (
            <div className="relative w-full h-full">
              <Image
                src={preview}
                alt="Preview"
                fill
                className="object-cover rounded-xl sm:rounded-2xl shadow-lg"
              />
              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 rounded-xl sm:rounded-2xl flex items-center justify-center">
                <CameraIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove();
                  }}
                  className="absolute -top-2 -right-2 sm:-top-3 sm:-right-3 w-6 h-6 sm:w-8 sm:h-8 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg transition-colors duration-200"
                >
                  <XMarkIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                </button>
              )}
            </div>
          ) : (
            <div
              className={`w-full h-full border-2 border-dashed rounded-xl sm:rounded-2xl transition-all duration-300 flex flex-col items-center justify-center group-hover:border-blue-500 ${
                isDarkMode
                  ? "border-gray-600 bg-gray-800/50 group-hover:bg-gray-700/50"
                  : "border-gray-300 bg-gray-50 group-hover:bg-blue-50"
              }`}
            >
              <Icon
                className={`w-6 h-6 sm:w-8 sm:h-8 mb-1 sm:mb-2 transition-colors duration-300 ${
                  isDarkMode
                    ? "text-gray-400 group-hover:text-blue-400"
                    : "text-gray-400 group-hover:text-blue-500"
                }`}
              />
              <span
                className={`text-xs sm:text-sm font-medium transition-colors duration-300 ${
                  isDarkMode
                    ? "text-gray-400 group-hover:text-blue-400"
                    : "text-gray-500 group-hover:text-blue-600"
                }`}
              >
                {t("upload")}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <SecondHeader />
      <div
        className={`min-h-screen transition-colors duration-300 ${
          isDarkMode
            ? "bg-gray-900"
            : "bg-gray-50"
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          {/* Header */}
          <div
            className={`p-4 sm:p-5 rounded-xl mb-4 sm:mb-5 backdrop-blur-lg shadow-lg border transition-all duration-300 ${
              isDarkMode
                ? "bg-gradient-to-br from-gray-800/90 to-blue-900/30 border-gray-700"
                : "bg-gradient-to-br from-white to-blue-50/50 border-gray-200"
            }`}
          >
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className="relative">
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl overflow-hidden shadow-md ring-2 ring-blue-500/20">
                  <Image
                    src="/images/shopbubble.png"
                    alt="Shop"
                    width={64}
                    height={64}
                    className="object-cover"
                  />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center shadow-lg">
                  <PlusIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h1
                  className={`text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent ${
                    isDarkMode ? "" : ""
                  }`}
                >
                  {t("createAndNameYourShop")}
                </h1>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-5">
            {/* Left Column - Basic Info */}
            <div className="space-y-3 sm:space-y-4">
              {/* Shop Name */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("nameYourShop")}
                </label>
                <input
                  type="text"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  placeholder={t("enterShopName")}
                  className={`w-full p-2.5 sm:p-3 border-0 outline-none rounded-lg text-sm transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700/80 text-white placeholder-gray-400"
                      : "bg-gray-50 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Email */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("email")}
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("enterEmail")}
                  className={`w-full p-2.5 sm:p-3 border-0 outline-none rounded-lg text-sm transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700/80 text-white placeholder-gray-400"
                      : "bg-gray-50 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Contact Number */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("contactNo")}
                </label>
                <input
                  type="tel"
                  value={contactNo}
                  onChange={(e) => setContactNo(e.target.value)}
                  placeholder={t("enterContactNo")}
                  className={`w-full p-2.5 sm:p-3 border-0 outline-none rounded-lg text-sm transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700/80 text-white placeholder-gray-400"
                      : "bg-gray-50 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Address */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("shopAddress")}
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("enterAddress")}
                  rows={2}
                  className={`w-full p-2.5 sm:p-3 border-0 outline-none rounded-lg text-sm resize-none transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700/80 text-white placeholder-gray-400"
                      : "bg-gray-50 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Pin Location Button */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("pinShopLocation")}
                </label>
                <button
                  type="button"
                  onClick={() => setShowMapModal(true)}
                  className={`w-full p-2.5 sm:p-3 rounded-lg flex items-center justify-between transition-all duration-300 hover:scale-[1.01] ${
                    isDarkMode
                      ? "bg-gray-700/80 text-white hover:bg-gray-600/80"
                      : "bg-gray-50 text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <MapPinIcon className="w-4 h-4" />
                    <span className="text-sm">
                      {coordinates.latitude && coordinates.longitude
                        ? t("locationPinned")
                        : t("pinShopLocation")}
                    </span>
                  </div>
                  {coordinates.latitude && coordinates.longitude && (
                    <CheckIcon className="w-4 h-4 text-green-500" />
                  )}
                </button>
                {coordinates.latitude && coordinates.longitude && (
                  <p
                    className={`text-xs mt-1.5 text-center ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {coordinates.latitude.toFixed(6)},{" "}
                    {coordinates.longitude.toFixed(6)}
                  </p>
                )}
              </div>

              {/* Categories */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <label
                  className={`block text-sm sm:text-base font-semibold mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("selectCategory")}
                </label>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className={`w-full p-2.5 sm:p-3 rounded-lg text-left text-sm flex items-center justify-between transition-all duration-300 hover:scale-[1.01] ${
                    isDarkMode
                      ? "bg-gray-700/80 text-white hover:bg-gray-600/80"
                      : "bg-gray-50 text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  <span
                    className={
                      selectedCategories.length === 0 ? "opacity-60" : ""
                    }
                  >
                    {selectedCategories.length === 0
                      ? t("selectCategory")
                      : selectedCategories.map((cat) => cat.name).join(", ")}
                  </span>
                  <div className="flex items-center space-x-2">
                    {selectedCategories.length > 0 && (
                      <span className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs px-2 py-0.5 rounded-full">
                        {selectedCategories.length}
                      </span>
                    )}
                    <ChevronRightIcon className="w-4 h-4" />
                  </div>
                </button>
              </div>
            </div>

            {/* Right Column - Images */}
            <div className="space-y-3 sm:space-y-4">
              {/* Tax Certificate */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <ImagePicker
                  title={t("taxPlateCertificate")}
                  preview={taxCertificatePreview}
                  onSelect={() => taxInputRef.current?.click()}
                  onRemove={() => removeImage("tax")}
                  icon={DocumentTextIcon}
                  size={window.innerWidth < 640 ? 100 : 130}
                />
                <input
                  ref={taxInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange(e, "tax")}
                />
              </div>

              {/* Profile Image */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <ImagePicker
                  title={t("uploadProfileImage")}
                  preview={profileImagePreview}
                  onSelect={() => profileInputRef.current?.click()}
                  onRemove={() => removeImage("profile")}
                  size={window.innerWidth < 640 ? 100 : 130}
                />
                <input
                  ref={profileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageChange(e, "profile")}
                />
              </div>

              {/* Cover Images */}
              <div
                className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 ${
                  isDarkMode
                    ? "bg-gray-800/90 border-gray-700"
                    : "bg-white border-gray-200"
                }`}
              >
                <div className="text-center mb-3 sm:mb-4">
                  <h3
                    className={`text-sm sm:text-base font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("uploadCoverImage")}
                  </h3>
                </div>
                <div className="flex space-x-2 sm:space-x-3 justify-center">
                  {coverImages.map((_, index) => (
                    <div key={index}>
                      <ImagePicker
                        preview={coverImagePreviews[index]}
                        onSelect={() => coverInputRefs[index].current?.click()}
                        onRemove={() => removeImage("cover", index)}
                        size={window.innerWidth < 640 ? 70 : 95}
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

          {/* Seller Agreement Checkbox */}
          <div className="mt-4 sm:mt-6 flex justify-center">
            <div
              className={`p-4 sm:p-5 rounded-xl backdrop-blur-lg shadow-md border transition-all duration-300 w-full max-w-2xl ${
                isDarkMode
                  ? "bg-gray-800/90 border-gray-700"
                  : "bg-white border-gray-200"
              }`}
            >
              <div className="flex items-start space-x-2.5 sm:space-x-3">
                <div className="flex items-center h-5">
                  <input
                    type="checkbox"
                    id="agreement"
                    checked={acceptedAgreement}
                    onChange={(e) => setAcceptedAgreement(e.target.checked)}
                    className="w-4 h-4 rounded border-2 border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer transition-all duration-200"
                  />
                </div>
                <label
                  htmlFor="agreement"
                  className={`text-sm cursor-pointer select-none ${
                    isDarkMode ? "text-gray-300" : "text-gray-700"
                  }`}
                >
                  {t("iHaveReadAndAccept")}{" "}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      router.push("/agreements/seller");
                    }}
                    className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline underline-offset-2 transition-colors duration-200"
                  >
                    {t("sellerAgreement")}
                  </button>
                </label>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="mt-4 sm:mt-6 flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-8 sm:px-12 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold rounded-xl transition-all duration-300 transform hover:scale-105 disabled:scale-100 shadow-lg text-sm sm:text-base min-w-[160px] sm:min-w-[200px]"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>{t("submitting")}</span>
                </div>
              ) : (
                t("apply")
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Map Location Picker Modal */}
      {showMapModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div
            className={`w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl transition-all duration-300 flex flex-col h-[85dvh] sm:h-auto sm:max-h-[90vh] ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-3 sm:mb-5 flex-shrink-0">
              <h3
                className={`text-lg sm:text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("pinShopLocation")}
              </h3>
              <button
                onClick={() => setShowMapModal(false)}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <XMarkIcon
                  className={`w-5 h-5 sm:w-6 sm:h-6 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
            </div>

            {/* Map Container - flexible height */}
            <div className="flex-1 min-h-0 mb-3 sm:mb-5">
              <div
                id="shop-location-map"
                className="w-full h-full sm:h-[500px] rounded-xl border-2 border-gray-200 dark:border-gray-600"
              />
            </div>

            {/* Instructions & Coordinates */}
            <div className="flex-shrink-0 mb-3 sm:mb-5">
              <p
                className={`text-xs sm:text-sm text-center ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                {t("mapInstructions")}
              </p>
              {coordinates.latitude && coordinates.longitude && (
                <p className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 mt-1 sm:mt-2 text-center">
                  {coordinates.latitude.toFixed(6)},{" "}
                  {coordinates.longitude.toFixed(6)}
                </p>
              )}
            </div>

            {/* Buttons - always visible */}
            <div className="flex space-x-3 sm:space-x-4 flex-shrink-0">
              <button
                onClick={() => setShowMapModal(false)}
                className={`flex-1 py-2.5 sm:py-3 rounded-lg font-semibold transition-all duration-200 text-sm sm:text-base ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-white"
                    : "bg-gray-200 hover:bg-gray-300 text-gray-900"
                }`}
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => setShowMapModal(false)}
                disabled={!coordinates.latitude || !coordinates.longitude}
                className="flex-1 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-400 text-white font-semibold rounded-lg transition-all duration-200 text-sm sm:text-base"
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
            className={`w-full max-w-md rounded-2xl p-6 max-h-[85vh] overflow-hidden shadow-2xl transition-all duration-300 ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div className="flex justify-between items-center mb-5">
              <h3
                className={`text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("selectCategory")}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className={`p-2 rounded-lg transition-colors duration-200 ${
                  isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                }`}
              >
                <XMarkIcon
                  className={`w-6 h-6 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto space-y-2 mb-5">
              {CATEGORIES.map((category) => {
                const isSelected = selectedCategories.some(
                  (cat) => cat.code === category.code
                );
                return (
                  <button
                    key={category.code}
                    onClick={() => toggleCategory(category)}
                    className={`w-full p-4 rounded-xl text-left flex items-center justify-between transition-all duration-200 transform hover:scale-[1.01] ${
                      isSelected
                        ? "bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md"
                        : isDarkMode
                        ? "bg-gray-700 text-white hover:bg-gray-600"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    <span className="font-medium">{category.name}</span>
                    {isSelected && (
                      <div className="w-6 h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                        <CheckIcon className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                if (selectedCategories.length === 0) {
                  alert(t("selectAtLeastOneCategory"));
                } else {
                  setShowCategoryModal(false);
                }
              }}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-xl transition-all duration-200 transform hover:scale-[1.01]"
            >
              {t("done")} ({selectedCategories.length})
            </button>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black bg-opacity-40 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className={`p-8 rounded-2xl shadow-2xl ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div className="flex flex-col items-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-600" />
              <div className="text-center">
                <p
                  className={`font-semibold text-lg ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("submitting")}...
                </p>
                <p
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  Creating your shop application
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
