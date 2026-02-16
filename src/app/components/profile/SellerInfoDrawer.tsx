// "use client";

// import React, { useState, useEffect, useCallback } from "react";
// import { createPortal } from "react-dom";
// import dynamic from "next/dynamic";
// import {
//   X,
//   User,
//   Plus,
//   Edit2,
//   Trash2,
//   LogIn,
//   RefreshCw,
//   MapPin,
//   Phone,
//   CreditCard,
//   Building,
//   AlertCircle,
// } from "lucide-react";
// import { useUser } from "@/context/UserProvider";
// import { useRouter } from "next/navigation";
// import {
//   doc,
//   getDoc,
//   setDoc,
//   updateDoc,
//   deleteDoc,
//   collection,
//   query,
//   where,
//   limit,
//   getDocs,
// } from "firebase/firestore";
// import { db } from "@/lib/firebase";
// import { useTranslations } from "next-intl";

// // Lazy load LocationPickerModal - Google Maps modal, heavy third-party dependency
// const LocationPickerModal = dynamic(
//   () => import("./LocationPickerModal").then(mod => ({ default: mod.LocationPickerModal })),
//   { ssr: false }
// );

// // ============================================================================
// // Phone number formatting utilities (matching Flutter implementation)
// // Format: (5XX) XXX XX XX for Turkish phone numbers
// // ============================================================================

// /**
//  * Formats phone input as user types: (5XX) XXX XX XX
//  * Matches Flutter's _PhoneNumberFormatter
//  */
// const formatPhoneNumber = (value: string): string => {
//   // Remove all non-digit characters
//   const digitsOnly = value.replace(/\D/g, '');
//   // Limit to 10 digits
//   const limited = digitsOnly.slice(0, 10);
  
//   let formatted = '';
//   for (let i = 0; i < limited.length; i++) {
//     if (i === 0) formatted += '(';
//     formatted += limited[i];
//     if (i === 2) formatted += ') ';
//     if (i === 5) formatted += ' ';
//     if (i === 7) formatted += ' ';
//   }
  
//   return formatted;
// };

// /**
//  * Converts stored phone "05XXXXXXXXX" to display format "(5XX) XXX XX XX"
//  * Matches Flutter's _formatPhoneForDisplay
//  */
// const formatPhoneForDisplay = (phone: string): string => {
//   if (!phone) return '';
  
//   const digitsOnly = phone.replace(/\D/g, '');
//   // Remove leading 0 if present
//   const digits = digitsOnly.startsWith('0') ? digitsOnly.slice(1) : digitsOnly;
  
//   if (digits.length !== 10) return phone; // Return as-is if not valid
  
//   return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
// };

// /**
//  * Normalizes phone for storage: "(5XX) XXX XX XX" -> "05XXXXXXXXX"
//  * Matches Flutter's normalization: '0${_phoneController.text.replaceAll(RegExp(r'\D'), '')}'
//  */
// const normalizePhoneForStorage = (phone: string): string => {
//   const digitsOnly = phone.replace(/\D/g, '');
//   // Add leading 0 if not present (matching Flutter behavior)
//   return digitsOnly.startsWith('0') ? digitsOnly : `0${digitsOnly}`;
// };

// /**
//  * Validates phone number (must be 10 digits starting with 5 for Turkish mobile)
//  */
// const isValidPhoneNumber = (phone: string): boolean => {
//   const digitsOnly = phone.replace(/\D/g, '');
//   // Should be 10 digits and start with 5 (Turkish mobile format)
//   return digitsOnly.length === 10 && digitsOnly.startsWith('5');
// };

// // ============================================================================
// // IBAN formatting utilities (matching Flutter implementation)
// // Format: TR## #### #### #### #### #### ## for Turkish IBAN
// // ============================================================================

// /**
//  * Formats IBAN input as user types: TR## #### #### #### #### #### ##
//  * Matches Flutter's _TurkishIbanFormatter
//  */
// const formatIbanNumber = (value: string): string => {
//   // Remove all non-alphanumeric and get uppercase
//   let cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
//   // Remove TR prefix if present (we'll add it back)
//   if (cleaned.startsWith('TR')) {
//     cleaned = cleaned.slice(2);
//   }
  
//   // Keep only digits after TR
//   const digitsOnly = cleaned.replace(/[^0-9]/g, '');
  
//   // Limit to 24 digits
//   const limited = digitsOnly.slice(0, 24);
  
//   // Format as TR## #### #### #### #### #### ##
//   let formatted = 'TR';
//   for (let i = 0; i < limited.length; i++) {
//     if (i === 2 || i === 6 || i === 10 || i === 14 || i === 18 || i === 22) {
//       formatted += ' ';
//     }
//     formatted += limited[i];
//   }
  
//   return formatted;
// };

// /**
//  * Converts stored IBAN "TRXXXXXXXXXXXXXXXXXXXXXXXXXX" to display format "TR## #### #### #### #### #### ##"
//  * Matches Flutter's _formatIbanForDisplay
//  */
// const formatIbanForDisplay = (iban: string): string => {
//   if (!iban) return '';
  
//   const cleaned = iban.toUpperCase().replace(/\s/g, '');
//   if (cleaned.length !== 26 || !cleaned.startsWith('TR')) return iban;
  
//   let formatted = '';
//   for (let i = 0; i < cleaned.length; i++) {
//     if (i === 4 || i === 8 || i === 12 || i === 16 || i === 20 || i === 24) {
//       formatted += ' ';
//     }
//     formatted += cleaned[i];
//   }
  
//   return formatted;
// };

// /**
//  * Normalizes IBAN for storage: "TR## #### #### #### #### #### ##" -> "TRXXXXXXXXXXXXXXXXXXXXXXXXXX"
//  * Matches Flutter's normalization: _ibanController.text.replaceAll(' ', '').toUpperCase()
//  */
// const normalizeIbanForStorage = (iban: string): string => {
//   return iban.replace(/\s/g, '').toUpperCase();
// };

// /**
//  * Validates Turkish IBAN (must be TR + 24 digits = 26 characters)
//  */
// const isValidTurkishIban = (iban: string): boolean => {
//   const normalized = normalizeIbanForStorage(iban);
//   return normalized.length === 26 && normalized.startsWith('TR') && /^TR\d{24}$/.test(normalized);
// };

// // ============================================================================

// interface SellerInfo {
//   ibanOwnerName: string;
//   ibanOwnerSurname: string;
//   phone: string;
//   latitude: number;
//   longitude: number;
//   address: string;
//   iban: string;
// }

// interface SellerInfoDrawerProps {
//   isOpen: boolean;
//   onClose: () => void;
//   isDarkMode?: boolean;
//   localization?: ReturnType<typeof useTranslations>;
//   shopId?: string;
// }

// export const SellerInfoDrawer: React.FC<SellerInfoDrawerProps> = ({
//   isOpen,
//   onClose,
//   isDarkMode = false,
//   localization,
//   shopId,
// }) => {
//   const router = useRouter();
//   const { user } = useUser();

//   // Local state
//   const [sellerInfo, setSellerInfo] = useState<SellerInfo | null>(null);
//   const [isLoading, setIsLoading] = useState(false);
//   const [showAddModal, setShowAddModal] = useState(false);
//   const [isDeleting, setIsDeleting] = useState(false);
//   const [showLocationPicker, setShowLocationPicker] = useState(false);

//   // Product check states
//   const [checkingProducts, setCheckingProducts] = useState(false);
//   const [showCannotDeleteModal, setShowCannotDeleteModal] = useState(false);

//   // Animation states
//   const [isAnimating, setIsAnimating] = useState(false);
//   const [shouldRender, setShouldRender] = useState(false);

//   // Form state
//   const [formData, setFormData] = useState({
//     ibanOwnerName: "",
//     ibanOwnerSurname: "",
//     phone: "",
//     latitude: null as number | null,
//     longitude: null as number | null,
//     address: "",
//     iban: "",
//   });

//   // Deduplication key to prevent multiple simultaneous saves
//   const [isSaving, setIsSaving] = useState(false);

//   // Animation handling
//   useEffect(() => {
//     if (isOpen) {
//       setShouldRender(true);
//       setTimeout(() => setIsAnimating(true), 10);
//     } else {
//       setIsAnimating(false);
//       setTimeout(() => setShouldRender(false), 300);
//     }
//   }, [isOpen]);

//   // Scroll lock - matches FavoritesDrawer pattern
//   useEffect(() => {
//     if (isOpen) {
//       // Disable body scroll
//       const scrollY = window.scrollY;
//       document.body.style.overflow = "hidden";
//       document.body.style.position = "fixed";
//       document.body.style.width = "100%";
//       document.body.style.top = `-${scrollY}px`;
//     } else {
//       // Re-enable body scroll
//       const scrollY = document.body.style.top;
//       document.body.style.overflow = "";
//       document.body.style.position = "";
//       document.body.style.width = "";
//       document.body.style.top = "";

//       if (scrollY) {
//         window.scrollTo(0, parseInt(scrollY || "0") * -1);
//       }
//     }

//     return () => {
//       document.body.style.overflow = "";
//       document.body.style.position = "";
//       document.body.style.width = "";
//       document.body.style.top = "";
//     };
//   }, [isOpen]);

//   // Load seller info from Firebase with deduplication
//   const loadSellerInfo = useCallback(async () => {
//     if (!user) {
//       setSellerInfo(null);
//       return;
//     }

//     setIsLoading(true);
//     try {
//       let docRef;

//       if (shopId) {
//         docRef = doc(db, "shops", shopId, "seller_info", "info");
//       } else {
//         docRef = doc(db, "users", user.uid);
//       }

//       const docSnap = await getDoc(docRef);

//       if (docSnap.exists()) {
//         const data = docSnap.data();

//         if (shopId) {
//           setSellerInfo(data as SellerInfo);
//         } else {
//           const sellerInfoData = data.sellerInfo;
//           setSellerInfo(sellerInfoData || null);
//         }
//       } else {
//         setSellerInfo(null);
//       }
//     } catch (error) {
//       console.error("Error loading seller info:", error);
//       showErrorToast(
//         l("SellerInfoDrawer.errorLoadingSellerInfo") ||
//           "Failed to load seller information"
//       );
//     } finally {
//       setIsLoading(false);
//     }
//   }, [user, shopId]);

//   // Load seller info when drawer opens
//   useEffect(() => {
//     if (isOpen) {
//       loadSellerInfo();
//     }
//   }, [user, isOpen, loadSellerInfo, shopId]);

//   /**
//    * Checks if the current user has any listed products.
//    * For normal users: checks "products" collection with ownerId
//    * For shops: checks "shop_products" collection with shopId
//    * Returns true if products exist, false otherwise.
//    * On error, returns true to prevent accidental deletion.
//    */
//   const checkUserHasListedProducts = async (): Promise<boolean> => {
//     if (!user) return false;

//     try {
//       let productsQuery;

//       if (shopId) {
//         // Shop context - check shop_products collection
//         productsQuery = query(
//           collection(db, "shop_products"),
//           where("shopId", "==", shopId),
//           limit(1)
//         );
//       } else {
//         // Normal user context - check products collection
//         productsQuery = query(
//           collection(db, "products"),
//           where("ownerId", "==", user.uid),
//           limit(1)
//         );
//       }

//       const snapshot = await getDocs(productsQuery);
//       return !snapshot.empty;
//     } catch (error) {
//       console.error("Error checking user products:", error);
//       // Return true on error to be safe - prevents accidental deletion
//       return true;
//     }
//   };

//   // Toast notifications
//   const showErrorToast = (message: string) => {
//     console.error(message);
//     // Replace with your toast system
//     if (typeof window !== "undefined") {
//       alert(`Error: ${message}`);
//     }
//   };

//   const showSuccessToast = (message: string) => {
//     console.log(message);
//     // Replace with your toast system
//     if (typeof window !== "undefined") {
//       // You can replace this with a proper toast notification
//       const toast = document.createElement("div");
//       toast.textContent = message;
//       toast.style.cssText = `
//         position: fixed;
//         bottom: 20px;
//         left: 50%;
//         transform: translateX(-50%);
//         background: #00A86B;
//         color: white;
//         padding: 12px 24px;
//         border-radius: 8px;
//         box-shadow: 0 4px 12px rgba(0,0,0,0.15);
//         z-index: 10000;
//         font-family: system-ui, -apple-system, sans-serif;
//         font-size: 14px;
//       `;
//       document.body.appendChild(toast);
//       setTimeout(() => {
//         toast.remove();
//       }, 3000);
//     }
//   };

//   // Handle form input changes with formatting
//   const handleInputChange = (field: string, value: string) => {
//     if (field === 'phone') {
//       // Apply phone number formatting (matching Flutter's _PhoneNumberFormatter)
//       const formattedPhone = formatPhoneNumber(value);
//       setFormData((prev) => ({
//         ...prev,
//         [field]: formattedPhone,
//       }));
//     } else if (field === 'iban') {
//       // Apply IBAN formatting (matching Flutter's _TurkishIbanFormatter)
//       const formattedIban = formatIbanNumber(value);
//       setFormData((prev) => ({
//         ...prev,
//         [field]: formattedIban,
//       }));
//     } else {
//       setFormData((prev) => ({
//         ...prev,
//         [field]: value,
//       }));
//     }
//   };

//   // Handle location selection
//   const handleLocationSelect = (lat: number, lng: number) => {
//     setFormData((prev) => ({
//       ...prev,
//       latitude: lat,
//       longitude: lng,
//     }));
//   };

//   // Mask IBAN for display
//   const maskIban = (iban: string): string => {
//     if (iban.length <= 8) return iban;
//     const start = iban.substring(0, 4);
//     const end = iban.substring(iban.length - 4);
//     return `${start}••••••••${end}`;
//   };

//   // Validate form data
//   const validateFormData = (): boolean => {
//     const {
//       ibanOwnerName,
//       ibanOwnerSurname,
//       phone,
//       latitude,
//       longitude,
//       address,
//       iban,
//     } = formData;

//     if (
//       !ibanOwnerName.trim() ||
//       !ibanOwnerSurname.trim() ||
//       !phone.trim() ||
//       latitude === null ||
//       longitude === null ||
//       !address.trim() ||
//       !iban.trim()
//     ) {
//       showErrorToast(
//         l("SellerInfoDrawer.fillAllFields") || "Please fill in all fields"
//       );
//       return false;
//     }

//     // Validate phone number format (matching Flutter validation)
//     if (!isValidPhoneNumber(phone)) {
//       showErrorToast(
//         l("SellerInfoDrawer.invalidPhone") ||
//           "Please enter a valid phone number starting with 5"
//       );
//       return false;
//     }

//     // Validate IBAN format (matching Flutter validation: TR + 24 digits)
//     if (!isValidTurkishIban(iban)) {
//       showErrorToast(
//         l("SellerInfoDrawer.invalidIban") ||
//           "Invalid IBAN. Turkish IBAN must be TR followed by 24 digits."
//       );
//       return false;
//     }

//     return true;
//   };

//   // Add or update seller info with deduplication
//   const handleSaveSellerInfo = async () => {
//     if (!user) return;

//     // Prevent duplicate submissions
//     if (isSaving) {
//       console.log("Save already in progress, ignoring duplicate request");
//       return;
//     }

//     // Validate form data
//     if (!validateFormData()) {
//       return;
//     }

//     setIsSaving(true);

//     try {
//       // Normalize phone and IBAN for storage (matching Flutter)
//       const normalizedPhone = normalizePhoneForStorage(formData.phone);
//       const normalizedIban = normalizeIbanForStorage(formData.iban);

//       const sellerData: SellerInfo = {
//         ibanOwnerName: formData.ibanOwnerName.trim(),
//         ibanOwnerSurname: formData.ibanOwnerSurname.trim(),
//         phone: normalizedPhone, // Store as "05XXXXXXXXX"
//         latitude: formData.latitude!,
//         longitude: formData.longitude!,
//         address: formData.address.trim(),
//         iban: normalizedIban, // Store as "TRXXXXXXXXXXXXXXXXXXXXXXXXXX"
//       };

//       // Debug log
//       console.log("=== SELLER DATA TO SAVE ===");
//       console.log("Keys:", Object.keys(sellerData));
//       Object.entries(sellerData).forEach(([key, value]) => {
//         console.log(`${key}: ${value} (${typeof value})`);
//       });
//       console.log("===========================");

//       let docRef;

//       if (shopId) {
//         // For shop-specific seller info
//         docRef = doc(db, "shops", shopId, "seller_info", "info");
//         await setDoc(docRef, sellerData, { merge: true });
//       } else {
//         // For user's personal seller info
//         docRef = doc(db, "users", user.uid);
//         await updateDoc(docRef, { sellerInfo: sellerData });
//       }

//       showSuccessToast(
//         sellerInfo
//           ? l("SellerInfoDrawer.sellerInfoUpdated") ||
//               "Seller information updated successfully"
//           : l("SellerInfoDrawer.sellerInfoAdded") ||
//               "Seller information added successfully"
//       );

//       // Reload seller info
//       await loadSellerInfo();

//       // Reset form and close modal
//       resetForm();
//       setShowAddModal(false);
//     } catch (error) {
//       console.error("Error saving seller info:", error);
//       showErrorToast(
//         l("SellerInfoDrawer.errorOccurred") || "An error occurred"
//       );
//     } finally {
//       setIsSaving(false);
//     }
//   };

//   // Reset form to initial state
//   const resetForm = () => {
//     setFormData({
//       ibanOwnerName: "",
//       ibanOwnerSurname: "",
//       phone: "",
//       latitude: null,
//       longitude: null,
//       address: "",
//       iban: "",
//     });
//   };

//   // Delete seller info with product check
//   const deleteSellerInfo = async () => {
//     if (!user) return;

//     // First check if user has listed products
//     setCheckingProducts(true);
//     const hasProducts = await checkUserHasListedProducts();
//     setCheckingProducts(false);

//     if (hasProducts) {
//       // Show cannot delete modal
//       setShowCannotDeleteModal(true);
//       return;
//     }

//     // No products - show confirmation dialog
//     if (
//       !confirm(
//         l("SellerInfoDrawer.deleteConfirmation") ||
//           "Are you sure you want to delete your seller information?"
//       )
//     )
//       return;

//     setIsDeleting(true);
//     try {
//       let docRef;

//       if (shopId) {
//         docRef = doc(db, "shops", shopId, "seller_info", "info");
//         await deleteDoc(docRef);
//       } else {
//         docRef = doc(db, "users", user.uid);
//         await updateDoc(docRef, { sellerInfo: null });
//       }

//       showSuccessToast(
//         l("SellerInfoDrawer.sellerInfoDeleted") || "Seller information deleted"
//       );
//       await loadSellerInfo();
//     } catch (error) {
//       console.error("Error deleting seller info:", error);
//       showErrorToast(
//         l("SellerInfoDrawer.errorOccurred") || "An error occurred"
//       );
//     } finally {
//       setIsDeleting(false);
//     }
//   };

//   // Edit seller info - format phone and IBAN for display when loading
//   const editSellerInfo = () => {
//     if (sellerInfo) {
//       setFormData({
//         ibanOwnerName: sellerInfo.ibanOwnerName,
//         ibanOwnerSurname: sellerInfo.ibanOwnerSurname,
//         // Convert stored "05XXXXXXXXX" to display format "(5XX) XXX XX XX"
//         phone: formatPhoneForDisplay(sellerInfo.phone),
//         latitude: sellerInfo.latitude,
//         longitude: sellerInfo.longitude,
//         address: sellerInfo.address,
//         // Convert stored "TRXXXXXXXXXXXXXXXXXXXXXXXXXX" to display format "TR## #### #### #### #### #### ##"
//         iban: formatIbanForDisplay(sellerInfo.iban),
//       });
//       setShowAddModal(true);
//     }
//   };

//   // Handle navigation to login
//   const handleGoToLogin = () => {
//     onClose();
//     router.push("/login");
//   };

//   // Backdrop click handler
//   const handleBackdropClick = (e: React.MouseEvent) => {
//     if (e.target === e.currentTarget) {
//       onClose();
//     }
//   };

//   // Close modal handler
//   const handleCloseModal = () => {
//     setShowAddModal(false);
//     resetForm();
//   };

//   const l = localization || ((key: string) => key.split(".").pop() || key);

//   if (!shouldRender) return null;

//   const drawerContent = (
//     <>
//       {/* Cannot Delete Modal */}
//       {showCannotDeleteModal && (
//         <div className="fixed inset-0 z-[1002] overflow-hidden">
//           <div
//             className="absolute inset-0 bg-black/70 backdrop-blur-sm"
//             onClick={() => setShowCannotDeleteModal(false)}
//           />
//           <div className="absolute inset-0 flex items-center justify-center p-4">
//             <div
//               className={`
//                 w-full max-w-md rounded-xl p-6 shadow-2xl
//                 ${isDarkMode ? "bg-gray-800" : "bg-white"}
//                 animate-in fade-in zoom-in duration-200
//               `}
//               onClick={(e) => e.stopPropagation()}
//             >
//               <div className="flex items-center gap-3 mb-4">
//                 <div className="p-2.5 bg-red-100 rounded-lg">
//                   <AlertCircle className="w-6 h-6 text-red-600" />
//                 </div>
//                 <h3
//                   className={`
//                     text-lg font-semibold
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.cannotDelete") || "Cannot Delete"}
//                 </h3>
//               </div>
//               <p
//                 className={`
//                   mb-6
//                   ${isDarkMode ? "text-gray-300" : "text-gray-600"}
//                 `}
//               >
//                 {l("SellerInfoDrawer.cannotDeleteWithProducts") ||
//                   "You cannot delete your seller information while you have listed products. Please delete all your products first."}
//               </p>
//               <button
//                 onClick={() => setShowCannotDeleteModal(false)}
//                 className={`
//                   w-full px-4 py-2.5 rounded-lg font-medium transition-colors
//                   ${
//                     isDarkMode
//                       ? "bg-gray-700 hover:bg-gray-600 text-white"
//                       : "bg-gray-900 hover:bg-gray-800 text-white"
//                   }
//                 `}
//               >
//                 {l("SellerInfoDrawer.understood") || "OK"}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       <div className="fixed inset-0 z-[1000] overflow-hidden">
//         {/* Backdrop */}
//         <div
//           className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
//             isAnimating ? "opacity-100" : "opacity-0"
//           }`}
//           onClick={handleBackdropClick}
//         />

//         {/* Drawer */}
//         <div
//           className={`
//               absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
//               ${isDarkMode ? "bg-gray-900" : "bg-white"}
//               shadow-2xl flex flex-col
//               ${isAnimating ? "translate-x-0" : "translate-x-full"}
//             `}
//         >
//           {/* Header */}
//           <div
//             className={`
//               flex-shrink-0 border-b px-6 py-4
//               ${
//                 isDarkMode
//                   ? "bg-gray-900 border-gray-700"
//                   : "bg-white border-gray-200"
//               }
//               backdrop-blur-xl bg-opacity-95
//             `}
//           >
//             <div className="flex items-center justify-between">
//               <div className="flex items-center space-x-3">
//                 <div
//                   className={`
//                     p-2 rounded-full
//                     ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                   `}
//                 >
//                   <Building
//                     size={20}
//                     className={isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   />
//                 </div>
//                 <div>
//                   <h2
//                     className={`
//                       text-lg font-bold
//                       ${isDarkMode ? "text-white" : "text-gray-900"}
//                     `}
//                   >
//                     {l("SellerInfoDrawer.title") || "Seller Information"}
//                   </h2>
//                   {user && sellerInfo && (
//                     <p
//                       className={`
//                         text-sm
//                         ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                       `}
//                     >
//                       {l("SellerInfoDrawer.yourSellerDetails") ||
//                         "Your seller details"}
//                     </p>
//                   )}
//                 </div>
//               </div>

//               <div className="flex items-center space-x-2">
//                 {user && !sellerInfo && !isLoading && (
//                   <button
//                     onClick={() => setShowAddModal(true)}
//                     className={`
//                       p-2 rounded-full transition-colors duration-200
//                       ${
//                         isDarkMode
//                           ? "hover:bg-gray-800 text-gray-400 hover:text-white"
//                           : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
//                       }
//                     `}
//                     title={
//                       l("SellerInfoDrawer.addSellerInfo") || "Add Seller Info"
//                     }
//                   >
//                     <Plus size={20} />
//                   </button>
//                 )}

//                 <button
//                   onClick={onClose}
//                   className={`
//                     p-2 rounded-full transition-colors duration-200
//                     ${
//                       isDarkMode
//                         ? "hover:bg-gray-800 text-gray-400 hover:text-white"
//                         : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
//                     }
//                   `}
//                 >
//                   <X size={20} />
//                 </button>
//               </div>
//             </div>
//           </div>

//           {/* Content */}
//           <div className="flex-1 overflow-y-auto min-h-0">
//             {!user ? (
//               // Not Authenticated State
//               <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//                 <div
//                   className={`
//                     w-20 h-20 rounded-full flex items-center justify-center mb-6
//                     ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                   `}
//                 >
//                   <User
//                     size={32}
//                     className={isDarkMode ? "text-gray-400" : "text-gray-500"}
//                   />
//                 </div>
//                 <h3
//                   className={`
//                     text-xl font-bold mb-3 text-center
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.loginRequired") || "Login Required"}
//                 </h3>
//                 <p
//                   className={`
//                     text-center mb-8 leading-relaxed
//                     ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.loginToManageSellerInfo") ||
//                     "Please login to view and manage your seller information."}
//                 </p>
//                 <button
//                   onClick={handleGoToLogin}
//                   className="
//                     flex items-center space-x-2 px-6 py-3 rounded-full
//                     bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                     hover:from-orange-600 hover:to-pink-600
//                     transition-all duration-200 shadow-lg hover:shadow-xl
//                     active:scale-95
//                   "
//                 >
//                   <LogIn size={18} />
//                   <span className="font-medium">
//                     {l("SellerInfoDrawer.login") || "Login"}
//                   </span>
//                 </button>
//               </div>
//             ) : isLoading ? (
//               // Loading State
//               <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//                 <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
//                 <p
//                   className={`
//                     text-center
//                     ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.loading") ||
//                     "Loading seller information..."}
//                 </p>
//               </div>
//             ) : !sellerInfo ? (
//               // Empty State
//               <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//                 <div
//                   className={`
//                     w-20 h-20 rounded-full flex items-center justify-center mb-6
//                     ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                   `}
//                 >
//                   <Building
//                     size={32}
//                     className={isDarkMode ? "text-gray-400" : "text-gray-500"}
//                   />
//                 </div>
//                 <h3
//                   className={`
//                     text-xl font-bold mb-3 text-center
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.noSellerInfo") ||
//                     "No Seller Information"}
//                 </h3>
//                 <p
//                   className={`
//                     text-center mb-8 leading-relaxed
//                     ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.addSellerInfoDescription") ||
//                     "Add your seller information to start selling products."}
//                 </p>
//                 <button
//                   onClick={() => setShowAddModal(true)}
//                   className="
//                     flex items-center space-x-2 px-6 py-3 rounded-full
//                     bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                     hover:from-orange-600 hover:to-pink-600
//                     transition-all duration-200 shadow-lg hover:shadow-xl
//                     active:scale-95
//                   "
//                 >
//                   <Plus size={18} />
//                   <span className="font-medium">
//                     {l("SellerInfoDrawer.addSellerInfo") || "Add Seller Info"}
//                   </span>
//                 </button>
//               </div>
//             ) : (
//               // Seller Info Display
//               <div className="px-4 py-4">
//                 <div
//                   className={`
//                     rounded-xl border p-6 transition-all duration-200
//                     ${
//                       isDarkMode
//                         ? "bg-gray-800 border-gray-700"
//                         : "bg-gray-50 border-gray-200"
//                     }
//                   `}
//                 >
//                   {/* Header Section */}
//                   <div className="flex items-center space-x-4 mb-6">
//                     <div
//                       className={`
//                         w-16 h-16 rounded-full flex items-center justify-center
//                         ${isDarkMode ? "bg-gray-700" : "bg-white"}
//                         border-2 border-orange-500/20
//                       `}
//                     >
//                       <Building size={24} className="text-orange-500" />
//                     </div>
//                     <div className="flex-1">
//                       <h3
//                         className={`
//                           text-lg font-semibold
//                           ${isDarkMode ? "text-white" : "text-gray-900"}
//                         `}
//                       >
//                         {`${sellerInfo.ibanOwnerName} ${sellerInfo.ibanOwnerSurname}`.trim()}
//                       </h3>
//                       <p
//                         className={`
//                           text-sm flex items-center space-x-1
//                           ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                         `}
//                       >
//                         <Phone size={14} />
//                         {/* Display formatted phone number */}
//                         <span>{formatPhoneForDisplay(sellerInfo.phone)}</span>
//                       </p>
//                     </div>
//                   </div>

//                   {/* Details Section */}
//                   <div className="space-y-4">
//                     {/* Location */}
//                     <div
//                       className={`
//                         p-3 rounded-lg
//                         ${isDarkMode ? "bg-gray-700/50" : "bg-white"}
//                       `}
//                     >
//                       <div className="flex items-center space-x-2 mb-1">
//                         <MapPin
//                           size={14}
//                           className={
//                             isDarkMode ? "text-gray-400" : "text-gray-500"
//                           }
//                         />
//                         <span
//                           className={`
//                             text-xs font-medium
//                             ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                           `}
//                         >
//                           {l("SellerInfoDrawer.location") || "Location"}
//                         </span>
//                       </div>
//                       <p
//                         className={`
//                           text-sm font-medium font-mono
//                           ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                         `}
//                       >
//                         {sellerInfo.latitude.toFixed(4)},{" "}
//                         {sellerInfo.longitude.toFixed(4)}
//                       </p>
//                     </div>

//                     {/* Address */}
//                     <div
//                       className={`
//                         p-3 rounded-lg
//                         ${isDarkMode ? "bg-gray-700/50" : "bg-white"}
//                       `}
//                     >
//                       <div className="flex items-center space-x-2 mb-1">
//                         <MapPin
//                           size={14}
//                           className={
//                             isDarkMode ? "text-gray-400" : "text-gray-500"
//                           }
//                         />
//                         <span
//                           className={`
//                             text-xs font-medium
//                             ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                           `}
//                         >
//                           {l("SellerInfoDrawer.addressDetails") ||
//                             "Address Details"}
//                         </span>
//                       </div>
//                       <p
//                         className={`
//                           text-sm font-medium
//                           ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                         `}
//                       >
//                         {sellerInfo.address}
//                       </p>
//                     </div>

//                     {/* IBAN */}
//                     <div
//                       className={`
//                         p-3 rounded-lg
//                         ${isDarkMode ? "bg-gray-700/50" : "bg-white"}
//                       `}
//                     >
//                       <div className="flex items-center space-x-2 mb-1">
//                         <CreditCard
//                           size={14}
//                           className={
//                             isDarkMode ? "text-gray-400" : "text-gray-500"
//                           }
//                         />
//                         <span
//                           className={`
//                             text-xs font-medium
//                             ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                           `}
//                         >
//                           IBAN
//                         </span>
//                       </div>
//                       <p
//                         className={`
//                           text-sm font-mono font-medium
//                           ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                         `}
//                       >
//                         {maskIban(sellerInfo.iban)}
//                       </p>
//                     </div>
//                   </div>

//                   {/* Action Buttons */}
//                   <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
//                     <button
//                       onClick={editSellerInfo}
//                       className={`
//                         flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200
//                         ${
//                           isDarkMode
//                             ? "hover:bg-gray-700 text-gray-400 hover:text-blue-400"
//                             : "hover:bg-blue-50 text-gray-500 hover:text-blue-600"
//                         }
//                       `}
//                     >
//                       <Edit2 size={16} />
//                       <span className="text-sm font-medium">
//                         {l("SellerInfoDrawer.edit") || "Edit"}
//                       </span>
//                     </button>

//                     <button
//                       onClick={deleteSellerInfo}
//                       disabled={isDeleting || checkingProducts}
//                       className={`
//                         flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors duration-200
//                         ${
//                           isDarkMode
//                             ? "hover:bg-gray-700 text-gray-400 hover:text-red-400"
//                             : "hover:bg-red-50 text-gray-500 hover:text-red-600"
//                         }
//                         ${isDeleting || checkingProducts ? "opacity-50 cursor-not-allowed" : ""}
//                       `}
//                     >
//                       {isDeleting || checkingProducts ? (
//                         <RefreshCw size={16} className="animate-spin" />
//                       ) : (
//                         <Trash2 size={16} />
//                       )}
//                       <span className="text-sm font-medium">
//                         {checkingProducts
//                           ? l("SellerInfoDrawer.checking") || "Checking..."
//                           : isDeleting
//                           ? l("SellerInfoDrawer.deleting") || "Deleting..."
//                           : l("SellerInfoDrawer.delete") || "Delete"}
//                       </span>
//                     </button>
//                   </div>
//                 </div>
//               </div>
//             )}
//           </div>
//         </div>
//       </div>

//       {/* Add/Edit Seller Info Modal */}
//       {showAddModal && (
//         <div
//           className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1001] p-6"
//           style={{
//             display: "flex",
//             alignItems: "center",
//             justifyContent: "center",
//             overflow: "hidden",
//           }}
//           onClick={handleCloseModal}
//         >
//           <div
//             className={`
//               w-full max-w-sm rounded-xl p-6
//               ${isDarkMode ? "bg-gray-800" : "bg-white"}
//               shadow-2xl max-h-[85vh] overflow-y-auto
//             `}
//             onClick={(e) => e.stopPropagation()}
//           >
//             <div className="flex items-center justify-between mb-4">
//               <h3
//                 className={`
//                   text-lg font-bold
//                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                 `}
//               >
//                 {sellerInfo
//                   ? l("SellerInfoDrawer.editSellerInfo") || "Edit Seller Info"
//                   : l("SellerInfoDrawer.newSellerInfo") || "New Seller Info"}
//               </h3>
//               <button
//                 onClick={handleCloseModal}
//                 className={`
//                   p-1 rounded-full transition-colors
//                   ${
//                     isDarkMode
//                       ? "hover:bg-gray-700 text-gray-400"
//                       : "hover:bg-gray-100 text-gray-500"
//                   }
//                 `}
//               >
//                 <X size={20} />
//               </button>
//             </div>

//             <div className="space-y-4">
//               {/* IBAN Owner Name */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.ibanOwnerName") || "IBAN Owner Name"} *
//                 </label>
//                 <input
//                   type="text"
//                   value={formData.ibanOwnerName}
//                   onChange={(e) =>
//                     handleInputChange("ibanOwnerName", e.target.value)
//                   }
//                   placeholder={
//                     l("SellerInfoDrawer.ibanOwnerName") || "IBAN Owner Name"
//                   }
//                   className={`
//                     w-full px-3 py-2 rounded-lg border
//                     ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
//                         : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
//                     }
//                     focus:ring-2 focus:ring-orange-500 focus:border-transparent
//                   `}
//                 />
//               </div>

//               {/* IBAN Owner Surname */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.ibanOwnerSurname") ||
//                     "IBAN Owner Surname"} *
//                 </label>
//                 <input
//                   type="text"
//                   value={formData.ibanOwnerSurname}
//                   onChange={(e) =>
//                     handleInputChange("ibanOwnerSurname", e.target.value)
//                   }
//                   placeholder={
//                     l("SellerInfoDrawer.ibanOwnerSurname") ||
//                     "IBAN Owner Surname"
//                   }
//                   className={`
//                     w-full px-3 py-2 rounded-lg border
//                     ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
//                         : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
//                     }
//                     focus:ring-2 focus:ring-orange-500 focus:border-transparent
//                   `}
//                 />
//               </div>

//               {/* Phone Number - Updated with formatting */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.phoneNumber") || "Phone Number"} *
//                 </label>
//                 <input
//                   type="tel"
//                   value={formData.phone}
//                   onChange={(e) => handleInputChange("phone", e.target.value)}
//                   placeholder="(5__) ___ __ __"
//                   className={`
//                     w-full px-3 py-2 rounded-lg border
//                     ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
//                         : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
//                     }
//                     focus:ring-2 focus:ring-orange-500 focus:border-transparent
//                   `}
//                 />
//                 {/* Phone format hint */}
//                 <p
//                   className={`
//                     mt-1 text-xs
//                     ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.phoneFormatHint") || "Format: (5XX) XXX XX XX"}
//                 </p>
//               </div>

//               {/* Location Selection Button */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.location") || "Location"} *
//                 </label>
//                 <button
//                   onClick={() => setShowLocationPicker(true)}
//                   type="button"
//                   className={`
//                     w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between
//                     ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 text-white"
//                         : "bg-white border-gray-300 text-gray-900"
//                     }
//                     hover:border-orange-500 transition-colors
//                   `}
//                 >
//                   <span
//                     className={
//                       formData.latitude !== null && formData.longitude !== null
//                         ? ""
//                         : "text-gray-500"
//                     }
//                   >
//                     {formData.latitude !== null && formData.longitude !== null
//                       ? `${formData.latitude.toFixed(
//                           4
//                         )}, ${formData.longitude.toFixed(4)}`
//                       : l("SellerInfoDrawer.pinLocationOnMap") ||
//                         "Pin location on map"}
//                   </span>
//                   <MapPin
//                     size={18}
//                     className={
//                       formData.latitude !== null && formData.longitude !== null
//                         ? "text-orange-500"
//                         : isDarkMode
//                         ? "text-gray-400"
//                         : "text-gray-500"
//                     }
//                   />
//                 </button>
//               </div>

//               {/* Address */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.addressDetails") || "Address Details"} *
//                 </label>
//                 <textarea
//                   value={formData.address}
//                   onChange={(e) => handleInputChange("address", e.target.value)}
//                   placeholder={
//                     l("SellerInfoDrawer.addressDetails") || "Address Details"
//                   }
//                   rows={3}
//                   className={`
//                     w-full px-3 py-2 rounded-lg border resize-none
//                     ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
//                         : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
//                     }
//                     focus:ring-2 focus:ring-orange-500 focus:border-transparent
//                   `}
//                 />
//               </div>

//               {/* IBAN - Updated with formatting */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.bankAccountNumberIban") ||
//                     "Bank Account Number (IBAN)"} *
//                 </label>
//                 <input
//                   type="text"
//                   value={formData.iban}
//                   onChange={(e) => handleInputChange("iban", e.target.value)}
//                   placeholder="TR__ ____ ____ ____ ____ ____ __"
//                   className={`
//                     w-full px-3 py-2 rounded-lg border font-mono
//                     ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
//                         : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
//                     }
//                     focus:ring-2 focus:ring-orange-500 focus:border-transparent
//                   `}
//                 />
//                 {/* IBAN format hint */}
//                 <p
//                   className={`
//                     mt-1 text-xs
//                     ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                   `}
//                 >
//                   {l("SellerInfoDrawer.ibanFormatHint") || "Format: TR + 24 digits"}
//                 </p>
//               </div>
//             </div>

//             {/* Actions */}
//             <div className="flex space-x-3 mt-6">
//               <button
//                 onClick={handleCloseModal}
//                 disabled={isSaving}
//                 className={`
//                   flex-1 py-2 px-4 rounded-lg
//                   ${
//                     isDarkMode
//                       ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
//                       : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                   }
//                   transition-colors duration-200
//                   ${isSaving ? "opacity-50 cursor-not-allowed" : ""}
//                 `}
//               >
//                 {l("SellerInfoDrawer.cancel") || "Cancel"}
//               </button>
//               <button
//                 onClick={handleSaveSellerInfo}
//                 disabled={
//                   isSaving ||
//                   !formData.ibanOwnerName.trim() ||
//                   !formData.ibanOwnerSurname.trim() ||
//                   !formData.phone.trim() ||
//                   formData.latitude === null ||
//                   formData.longitude === null ||
//                   !formData.address.trim() ||
//                   !formData.iban.trim() ||
//                   !isValidPhoneNumber(formData.phone) ||
//                   !isValidTurkishIban(formData.iban)
//                 }
//                 className="
//                   flex-1 py-2 px-4 rounded-lg flex items-center justify-center space-x-2
//                   bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                   hover:from-orange-600 hover:to-pink-600
//                   disabled:opacity-50 disabled:cursor-not-allowed
//                   transition-all duration-200
//                 "
//               >
//                 {isSaving ? (
//                   <>
//                     <RefreshCw size={16} className="animate-spin" />
//                     <span>{l("SellerInfoDrawer.saving") || "Saving..."}</span>
//                   </>
//                 ) : (
//                   <span>{l("SellerInfoDrawer.save") || "Save"}</span>
//                 )}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Location Picker Modal */}
//       {showLocationPicker && (
//         <LocationPickerModal
//           isOpen={showLocationPicker}
//           onClose={() => setShowLocationPicker(false)}
//           onLocationSelect={handleLocationSelect}
//           initialLocation={
//             formData.latitude !== null && formData.longitude !== null
//               ? { lat: formData.latitude, lng: formData.longitude }
//               : null
//           }
//           isDarkMode={isDarkMode}
//           localization={localization}
//         />
//       )}
//     </>
//   );

//   return typeof window !== "undefined"
//     ? createPortal(drawerContent, document.body)
//     : null;
// };