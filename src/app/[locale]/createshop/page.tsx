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
import {
  XMarkIcon,
  ChevronRightIcon,
  PlusIcon,
  CheckIcon,
  CameraIcon,
  DocumentTextIcon,
} from "@heroicons/react/24/outline";

interface AppLocalizations {
  [key: string]: string;
}

interface Category {
  code: string;
  name: string;
}

// Get categories from AllInOneCategoryData with localization
const getLocalizedCategories = (t: (key: string) => string): Category[] => {
  // Create AppLocalizations object that works with your existing localization method
  const createAppLocalizations = (
    translateFn: (key: string) => string
  ): AppLocalizations => {
    return new Proxy({} as AppLocalizations, {
      get: (target, prop: string) => {
        try {
          return translateFn(prop);
        } catch {
          return prop; // fallback to the key itself if translation doesn't exist
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
      coverImages.every((img) => img === null)
    ) {
      alert(t("enterAllFields"));
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

      // Save to Firestore
      await addDoc(collection(db, "shopApplications"), {
        ownerId: user.uid,
        name: shopName.trim(),
        email: email.trim(),
        contactNo: contactNo.trim(),
        address: address.trim(),
        categories: selectedCategories.map((cat) => cat.code),
        categoryNames: selectedCategories.map((cat) => cat.name), // Store localized names
        profileImageUrl,
        coverImageUrl: coverImageUrls.join(","),
        taxPlateCertificateUrl: taxCertificateUrl,
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
          <div className="text-center mb-2 sm:mb-4">
            <h3
              className={`text-base sm:text-lg font-semibold ${
                isDarkMode ? "text-white" : "text-gray-900"
              }`}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                className={`text-xs sm:text-sm mt-1 ${
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
              className={`w-full h-full border-2 border-dashed rounded-xl sm:rounded-2xl transition-all duration-300 flex flex-col items-center justify-center group-hover:border-blue-400 ${
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
                Upload
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
            ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
            : "bg-gradient-to-br from-blue-50 via-white to-purple-50"
        }`}
      >
        <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-8">
          {/* Modern Header */}
          <div
            className={`p-4 sm:p-8 rounded-2xl sm:rounded-3xl mb-4 sm:mb-8 backdrop-blur-lg shadow-xl border transition-all duration-300 relative overflow-hidden ${
              isDarkMode
                ? "bg-gray-800/70 border-gray-700/50"
                : "bg-white/80 border-white/20"
            }`}
          >
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-500 rounded-t-2xl sm:rounded-t-3xl"></div>

            <div className="flex items-center space-x-3 sm:space-x-6">
              <div className="relative">
                <div className="w-12 h-12 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl overflow-hidden shadow-lg">
                  <Image
                    src="/images/shopbubble.png"
                    alt="Shop"
                    width={80}
                    height={80}
                    className="object-cover"
                  />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 sm:-bottom-1 sm:-right-1 w-4 h-4 sm:w-6 sm:h-6 bg-green-500 rounded-full flex items-center justify-center">
                  <PlusIcon className="w-2 h-2 sm:w-3 sm:h-3 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h1
                  className={`text-xl sm:text-3xl font-bold mb-1 sm:mb-2 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("createAndNameYourShop")}
                </h1>
                <p
                  className={`text-sm sm:text-lg ${
                    isDarkMode ? "text-gray-300" : "text-gray-600"
                  }`}
                >
                  Set up your online store in minutes
                </p>
              </div>
            </div>
          </div>

          {/* Form Content */}
          <div className="grid lg:grid-cols-2 gap-4 sm:gap-8">
            {/* Left Column - Basic Info */}
            <div className="space-y-4 sm:space-y-6">
              {/* Shop Name */}
              <div
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-green-500 to-blue-500 rounded-t-xl sm:rounded-t-2xl"></div>

                <label
                  className={`block text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${
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
                  className={`w-full p-3 sm:p-4 border-0 outline-none rounded-lg sm:rounded-xl text-sm sm:text-base transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700 text-white placeholder-gray-400"
                      : "bg-gray-100 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Email */}
              <div
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <label
                  className={`block text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${
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
                  className={`w-full p-3 sm:p-4 border-0 outline-none rounded-lg sm:rounded-xl text-sm sm:text-base transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700 text-white placeholder-gray-400"
                      : "bg-gray-100 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Contact Number */}
              <div
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <label
                  className={`block text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${
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
                  className={`w-full p-3 sm:p-4 border-0 outline-none rounded-lg sm:rounded-xl text-sm sm:text-base transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700 text-white placeholder-gray-400"
                      : "bg-gray-100 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Address */}
              <div
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-pink-500 to-purple-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <label
                  className={`block text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("shopAddress")}
                </label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder={t("enterAddress")}
                  rows={3}
                  className={`w-full p-3 sm:p-4 border-0 outline-none rounded-lg sm:rounded-xl text-sm sm:text-base resize-none transition-all duration-300 focus:ring-2 focus:ring-blue-500 ${
                    isDarkMode
                      ? "bg-gray-700 text-white placeholder-gray-400"
                      : "bg-gray-100 text-gray-900 placeholder-gray-500"
                  }`}
                />
              </div>

              {/* Categories */}
              <div
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <label
                  className={`block text-base sm:text-lg font-semibold mb-2 sm:mb-4 ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("selectCategory")}
                </label>
                <button
                  onClick={() => setShowCategoryModal(true)}
                  className={`w-full p-3 sm:p-4 rounded-lg sm:rounded-xl text-left text-sm sm:text-base flex items-center justify-between transition-all duration-300 hover:scale-[1.02] ${
                    isDarkMode
                      ? "bg-gray-700 text-white hover:bg-gray-600"
                      : "bg-gray-100 text-gray-900 hover:bg-gray-200"
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
                      <span className="bg-blue-500 text-white text-xs px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">
                        {selectedCategories.length}
                      </span>
                    )}
                    <ChevronRightIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                </button>
              </div>
            </div>

            {/* Right Column - Images */}
            <div className="space-y-4 sm:space-y-6">
              {/* Tax Certificate */}
              <div
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <ImagePicker
                  title={t("taxPlateCertificate")}
                  preview={taxCertificatePreview}
                  onSelect={() => taxInputRef.current?.click()}
                  onRemove={() => removeImage("tax")}
                  icon={DocumentTextIcon}
                  size={window.innerWidth < 640 ? 100 : 140}
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
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-blue-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <ImagePicker
                  title={t("uploadProfileImage")}
                  preview={profileImagePreview}
                  onSelect={() => profileInputRef.current?.click()}
                  onRemove={() => removeImage("profile")}
                  size={window.innerWidth < 640 ? 100 : 140}
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
                className={`p-4 sm:p-6 rounded-xl sm:rounded-2xl backdrop-blur-lg shadow-lg border transition-all duration-300 relative overflow-hidden ${
                  isDarkMode
                    ? "bg-gray-800/70 border-gray-700/50"
                    : "bg-white/80 border-white/20"
                }`}
              >
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-pink-500 rounded-t-xl sm:rounded-t-2xl"></div>
                <div className="text-center mb-3 sm:mb-6">
                  <h3
                    className={`text-base sm:text-lg font-semibold ${
                      isDarkMode ? "text-white" : "text-gray-900"
                    }`}
                  >
                    {t("uploadCoverImage")}
                  </h3>
                </div>
                <div className="flex space-x-2 sm:space-x-4 justify-center">
                  {coverImages.map((_, index) => (
                    <div key={index}>
                      <ImagePicker
                        preview={coverImagePreviews[index]}
                        onSelect={() => coverInputRefs[index].current?.click()}
                        onRemove={() => removeImage("cover", index)}
                        size={window.innerWidth < 640 ? 70 : 100}
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

          {/* Submit Button */}
          <div className="mt-6 sm:mt-12 flex justify-center">
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-8 sm:px-12 py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold rounded-xl sm:rounded-2xl transition-all duration-300 transform hover:scale-105 disabled:scale-100 shadow-lg text-sm sm:text-lg min-w-[160px] sm:min-w-[200px]"
            >
              {isSubmitting ? (
                <div className="flex items-center space-x-2 sm:space-x-3">
                  <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white" />
                  <span>{t("submitting")}</span>
                </div>
              ) : (
                t("apply")
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modern Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-2 sm:p-4">
          <div
            className={`w-full max-w-sm sm:max-w-md rounded-2xl sm:rounded-3xl p-4 sm:p-6 max-h-[80vh] overflow-hidden shadow-2xl transition-all duration-300 ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div className="flex justify-between items-center mb-4 sm:mb-6">
              <h3
                className={`text-lg sm:text-xl font-bold ${
                  isDarkMode ? "text-white" : "text-gray-900"
                }`}
              >
                {t("selectCategory")}
              </h3>
              <button
                onClick={() => setShowCategoryModal(false)}
                className={`p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-colors duration-200 ${
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

            <div className="max-h-80 sm:max-h-96 overflow-y-auto space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              {CATEGORIES.map((category) => {
                const isSelected = selectedCategories.some(
                  (cat) => cat.code === category.code
                );
                return (
                  <button
                    key={category.code}
                    onClick={() => toggleCategory(category)}
                    className={`w-full p-3 sm:p-4 rounded-lg sm:rounded-xl text-left flex items-center justify-between transition-all duration-200 transform hover:scale-[1.02] text-sm sm:text-base ${
                      isSelected
                        ? "bg-gradient-to-r from-blue-500 to-purple-500 text-white shadow-lg"
                        : isDarkMode
                        ? "bg-gray-700 text-white hover:bg-gray-600"
                        : "bg-gray-100 text-gray-900 hover:bg-gray-200"
                    }`}
                  >
                    <span className="font-medium">{category.name}</span>
                    {isSelected && (
                      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                        <CheckIcon className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
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
              className="w-full py-3 sm:py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold rounded-lg sm:rounded-xl transition-all duration-200 transform hover:scale-[1.02] text-sm sm:text-base"
            >
              {t("done")} ({selectedCategories.length})
            </button>
          </div>
        </div>
      )}

      {/* Modern Loading Overlay */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center z-50">
          <div
            className={`p-6 sm:p-8 rounded-xl sm:rounded-2xl shadow-2xl ${
              isDarkMode ? "bg-gray-800" : "bg-white"
            }`}
          >
            <div className="flex flex-col items-center space-y-3 sm:space-y-4">
              <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-4 border-blue-200 border-t-blue-600" />
              <div className="text-center">
                <p
                  className={`font-semibold text-base sm:text-lg ${
                    isDarkMode ? "text-white" : "text-gray-900"
                  }`}
                >
                  {t("submitting")}...
                </p>
                <p
                  className={`text-xs sm:text-sm ${
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
