// "use client";

// import React, { useState, useEffect, useCallback } from "react";
// import { createPortal } from "react-dom";
// import {
//   X,
//   CreditCard,
//   Plus,
//   Edit2,
//   Trash2,
//   Star,
//   User,
//   LogIn,
//   RefreshCw,
// } from "lucide-react";
// import { useUser } from "@/context/UserProvider";
// import { useRouter } from "next/navigation";
// import {
//   collection,
//   addDoc,
//   updateDoc,
//   deleteDoc,
//   doc,
//   getDocs,
//   writeBatch,
// } from "firebase/firestore";
// import { db } from "@/lib/firebase";
// import { useTranslations } from "next-intl";

// interface PaymentMethod {
//   id: string;
//   cardHolderName: string;
//   cardNumber: string;
//   expiryDate: string;
//   isPreferred: boolean;
//   cardType: string;
// }

// interface SavedPaymentMethodsDrawerProps {
//   isOpen: boolean;
//   onClose: () => void;
//   isDarkMode?: boolean;
//   localization?: ReturnType<typeof useTranslations>;
// }

// export const SavedPaymentMethodsDrawer: React.FC<
//   SavedPaymentMethodsDrawerProps
// > = ({ isOpen, onClose, isDarkMode = false, localization }) => {
//   const router = useRouter();
//   const { user } = useUser();

//   // Local state
//   const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
//   const [isLoading, setIsLoading] = useState(false);
//   const [isClearing, setIsClearing] = useState(false);
//   const [removingItems, setRemovingItems] = useState<Set<string>>(new Set());
//   const [showAddModal, setShowAddModal] = useState(false);
//   const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(
//     null
//   );

//   // Animation states
//   const [isAnimating, setIsAnimating] = useState(false);
//   const [shouldRender, setShouldRender] = useState(false);

//   // Form state
//   const [formData, setFormData] = useState({
//     cardHolderName: "",
//     cardNumber: "",
//     expiryDate: "",
//   });

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

//   // Scroll lock - matches SellerInfoDrawer pattern
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

//   // Helper functions
//   const getCardType = (cardNumber: string): string => {
//     const cleanNumber = cardNumber.replace(/\D/g, "");
//     if (cleanNumber.startsWith("4")) return "visa";
//     if (
//       cleanNumber.startsWith("5") ||
//       (cleanNumber.length >= 4 &&
//         parseInt(cleanNumber.substring(0, 4)) >= 2221 &&
//         parseInt(cleanNumber.substring(0, 4)) <= 2720)
//     ) {
//       return "mastercard";
//     }
//     if (cleanNumber.startsWith("34") || cleanNumber.startsWith("37"))
//       return "amex";
//     return "unknown";
//   };

//   const getCardTypeName = (cardNumber: string): string => {
//     const cardType = getCardType(cardNumber);
//     switch (cardType) {
//       case "visa":
//         return "Visa";
//       case "mastercard":
//         return "Mastercard";
//       case "amex":
//         return "American Express";
//       default:
//         return "Card";
//     }
//   };

//   const isValidCardNumber = (cardNumber: string): boolean => {
//     const cleanNumber = cardNumber.replace(/\D/g, "");
//     if (cleanNumber.length < 13 || cleanNumber.length > 19) return false;

//     // Luhn algorithm
//     let sum = 0;
//     let alternate = false;
//     for (let i = cleanNumber.length - 1; i >= 0; i--) {
//       let digit = parseInt(cleanNumber[i]);
//       if (alternate) {
//         digit *= 2;
//         if (digit > 9) digit = (digit % 10) + 1;
//       }
//       sum += digit;
//       alternate = !alternate;
//     }
//     return sum % 10 === 0;
//   };

//   const maskCardNumber = (cardNumber: string): string => {
//     if (cardNumber.length < 4) return cardNumber;
//     return `•••• •••• •••• ${cardNumber.slice(-4)}`;
//   };

//   const formatCardNumber = (value: string): string => {
//     const cleanValue = value.replace(/\D/g, "");
//     const formatted = cleanValue.replace(/(.{4})/g, "$1 ").trim();
//     return formatted.substring(0, 23); // Limit to 19 digits + spaces
//   };

//   const formatExpiryDate = (value: string): string => {
//     const cleanValue = value.replace(/\D/g, "");
//     if (cleanValue.length >= 2) {
//       return `${cleanValue.substring(0, 2)}/${cleanValue.substring(2, 4)}`;
//     }
//     return cleanValue;
//   };

//   // Load payment methods from Firebase
//   const loadPaymentMethods = useCallback(async () => {
//     if (!user) {
//       setPaymentMethods([]);
//       return;
//     }

//     setIsLoading(true);
//     try {
//       const paymentMethodsRef = collection(
//         db,
//         "users",
//         user.uid,
//         "paymentMethods"
//       );
//       const snapshot = await getDocs(paymentMethodsRef);

//       const methods: PaymentMethod[] = snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//         cardType: getCardType(doc.data().cardNumber || ""),
//       })) as PaymentMethod[];

//       // Sort by preferred first, then by creation time
//       methods.sort((a, b) => {
//         if (a.isPreferred && !b.isPreferred) return -1;
//         if (!a.isPreferred && b.isPreferred) return 1;
//         return 0;
//       });

//       setPaymentMethods(methods);
//     } catch (error) {
//       console.error("Error loading payment methods:", error);
//       showErrorToast("Failed to load payment methods");
//     } finally {
//       setIsLoading(false);
//     }
//   }, [user]);

//   // Load payment methods when drawer opens and user changes
//   useEffect(() => {
//     if (isOpen) {
//       loadPaymentMethods();
//     }
//   }, [user, isOpen, loadPaymentMethods]);

//   // Toast notifications (you can replace with your toast system)
//   const showErrorToast = (message: string) => {
//     // Replace with your actual toast implementation
//     console.error(message);
//     alert(`Error: ${message}`);
//   };

//   const showSuccessToast = (message: string) => {
//     // Replace with your actual toast implementation
//     console.log(message);
//     alert(`Success: ${message}`);
//   };

//   // Handle form input changes
//   const handleInputChange = (field: string, value: string) => {
//     let formattedValue = value;

//     if (field === "cardNumber") {
//       formattedValue = formatCardNumber(value);
//     } else if (field === "expiryDate") {
//       formattedValue = formatExpiryDate(value);
//     }

//     setFormData((prev) => ({
//       ...prev,
//       [field]: formattedValue,
//     }));
//   };

//   // Add or update payment method
//   const handleSavePaymentMethod = async () => {
//     if (!user) return;

//     const { cardHolderName, cardNumber, expiryDate } = formData;

//     if (!cardHolderName.trim() || !cardNumber.trim() || !expiryDate.trim()) {
//       showErrorToast("Please fill in all fields");
//       return;
//     }

//     const cleanCardNumber = cardNumber.replace(/\s/g, "");

//     if (!isValidCardNumber(cleanCardNumber)) {
//       showErrorToast("Invalid card number");
//       return;
//     }

//     const cardType = getCardType(cleanCardNumber);
//     if (cardType === "unknown") {
//       showErrorToast(
//         "Unsupported card type. Only Visa and Mastercard are supported."
//       );
//       return;
//     }

//     if (!editingMethod && paymentMethods.length >= 4) {
//       showErrorToast("Maximum 4 payment methods allowed");
//       return;
//     }

//     try {
//       const paymentMethodsRef = collection(
//         db,
//         "users",
//         user.uid,
//         "paymentMethods"
//       );

//       const paymentData = {
//         cardHolderName: cardHolderName.trim(),
//         cardNumber: cleanCardNumber,
//         expiryDate,
//         cardType,
//       };

//       if (editingMethod) {
//         // Update existing
//         const docRef = doc(
//           db,
//           "users",
//           user.uid,
//           "paymentMethods",
//           editingMethod.id
//         );
//         await updateDoc(docRef, paymentData);
//         showSuccessToast("Payment method updated successfully");
//       } else {
//         // Add new
//         const isFirstMethod = paymentMethods.length === 0;
//         await addDoc(paymentMethodsRef, {
//           ...paymentData,
//           isPreferred: isFirstMethod,
//         });
//         showSuccessToast("Payment method added successfully");
//       }

//       // Reload payment methods
//       await loadPaymentMethods();

//       // Reset form and close modal
//       setFormData({ cardHolderName: "", cardNumber: "", expiryDate: "" });
//       setShowAddModal(false);
//       setEditingMethod(null);
//     } catch (error) {
//       console.error("Error saving payment method:", error);
//       showErrorToast("An error occurred");
//     }
//   };

//   // Set as preferred
//   const setAsPreferred = async (methodId: string) => {
//     if (!user) return;

//     try {
//       const batch = writeBatch(db);

//       // Remove preferred status from all methods
//       paymentMethods.forEach((method) => {
//         const docRef = doc(db, "users", user.uid, "paymentMethods", method.id);
//         batch.update(docRef, { isPreferred: false });
//       });

//       // Set selected method as preferred
//       const selectedDocRef = doc(
//         db,
//         "users",
//         user.uid,
//         "paymentMethods",
//         methodId
//       );
//       batch.update(selectedDocRef, { isPreferred: true });

//       await batch.commit();
//       showSuccessToast("Preferred payment method set");
//       await loadPaymentMethods();
//     } catch (error) {
//       console.error("Error setting preferred method:", error);
//       showErrorToast("An error occurred");
//     }
//   };

//   // Delete payment method
//   const deletePaymentMethod = async (methodId: string) => {
//     if (!user) return;
//     if (!confirm("Are you sure you want to delete this payment method?"))
//       return;

//     setRemovingItems((prev) => new Set(prev).add(methodId));
//     try {
//       await deleteDoc(doc(db, "users", user.uid, "paymentMethods", methodId));
//       showSuccessToast("Payment method deleted");
//       await loadPaymentMethods();
//     } catch (error) {
//       console.error("Error deleting payment method:", error);
//       showErrorToast("An error occurred");
//     } finally {
//       setRemovingItems((prev) => {
//         const newSet = new Set(prev);
//         newSet.delete(methodId);
//         return newSet;
//       });
//     }
//   };

//   // Clear all payment methods
//   const clearAllPaymentMethods = async () => {
//     if (!user) return;
//     if (!confirm("Are you sure you want to delete all payment methods?"))
//       return;

//     setIsClearing(true);
//     try {
//       const batch = writeBatch(db);
//       paymentMethods.forEach((method) => {
//         const docRef = doc(db, "users", user.uid, "paymentMethods", method.id);
//         batch.delete(docRef);
//       });
//       await batch.commit();
//       showSuccessToast("All payment methods cleared");
//       await loadPaymentMethods();
//     } catch (error) {
//       console.error("Error clearing payment methods:", error);
//       showErrorToast("An error occurred");
//     } finally {
//       setIsClearing(false);
//     }
//   };

//   // Edit payment method
//   const editPaymentMethod = (method: PaymentMethod) => {
//     setFormData({
//       cardHolderName: method.cardHolderName,
//       cardNumber: method.cardNumber.replace(/(.{4})/g, "$1 ").trim(),
//       expiryDate: method.expiryDate,
//     });
//     setEditingMethod(method);
//     setShowAddModal(true);
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

//   const l = localization || ((key: string) => key.split(".").pop() || key); // Fallback if localization is not provided

//   if (!shouldRender) return null;

//   const drawerContent = (
//     <div className="fixed inset-0 z-[1000] overflow-hidden">
//       {/* Backdrop */}
//       <div
//         className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
//           isAnimating ? "opacity-100" : "opacity-0"
//         }`}
//         onClick={handleBackdropClick}
//       />

//       {/* Drawer */}
//       <div
//         className={`
//           absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
//           ${isDarkMode ? "bg-gray-900" : "bg-white"}
//           shadow-2xl flex flex-col
//           ${isAnimating ? "translate-x-0" : "translate-x-full"}
//         `}
//       >
//         {/* Header */}
//         <div
//           className={`
//             flex-shrink-0 border-b px-6 py-4
//             ${
//               isDarkMode
//                 ? "bg-gray-900 border-gray-700"
//                 : "bg-white border-gray-200"
//             }
//             backdrop-blur-xl bg-opacity-95
//           `}
//         >
//           <div className="flex items-center justify-between">
//             <div className="flex items-center space-x-3">
//               <div
//                 className={`
//                   p-2 rounded-full
//                   ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                 `}
//               >
//                 <CreditCard
//                   size={20}
//                   className={isDarkMode ? "text-gray-300" : "text-gray-700"}
//                 />
//               </div>
//               <div>
//                 <h2
//                   className={`
//                     text-lg font-bold
//                     ${isDarkMode ? "text-white" : "text-gray-900"}
//                   `}
//                 >
//                   {l("SavedPaymentMethodsDrawer.title") || "Payment Methods"}
//                 </h2>
//                 {user && paymentMethods.length > 0 && (
//                   <p
//                     className={`
//                       text-sm
//                       ${isDarkMode ? "text-gray-400" : "text-gray-500"}
//                     `}
//                   >
//                     {paymentMethods.length}{" "}
//                     {l("SavedPaymentMethodsDrawer.ofFourMethods") ||
//                       "of 4 methods"}
//                   </p>
//                 )}
//               </div>
//             </div>

//             <div className="flex items-center space-x-2">
//               {/* Add Button - Only show when not at limit */}
//               {user && paymentMethods.length < 4 && (
//                 <button
//                   onClick={() => setShowAddModal(true)}
//                   className={`
//                     p-2 rounded-full transition-colors duration-200
//                     ${
//                       isDarkMode
//                         ? "hover:bg-gray-800 text-gray-400 hover:text-white"
//                         : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
//                     }
//                   `}
//                   title={l("SavedPaymentMethodsDrawer.addNew") || "Add New"}
//                 >
//                   <Plus size={20} />
//                 </button>
//               )}

//               <button
//                 onClick={onClose}
//                 className={`
//                   p-2 rounded-full transition-colors duration-200
//                   ${
//                     isDarkMode
//                       ? "hover:bg-gray-800 text-gray-400 hover:text-white"
//                       : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
//                   }
//                 `}
//               >
//                 <X size={20} />
//               </button>
//             </div>
//           </div>

//           {/* Clear All Button */}
//           {user && paymentMethods.length > 0 && (
//             <div className="mt-4">
//               <button
//                 onClick={clearAllPaymentMethods}
//                 disabled={isClearing}
//                 className={`
//                   flex items-center space-x-2 text-sm transition-colors duration-200
//                   ${
//                     isDarkMode
//                       ? "text-red-400 hover:text-red-300"
//                       : "text-red-500 hover:text-red-600"
//                   }
//                   ${isClearing ? "opacity-50 cursor-not-allowed" : ""}
//                 `}
//               >
//                 {isClearing ? (
//                   <RefreshCw size={16} className="animate-spin" />
//                 ) : (
//                   <Trash2 size={16} />
//                 )}
//                 <span>
//                   {isClearing
//                     ? l("SavedPaymentMethodsDrawer.clearing") || "Clearing..."
//                     : l("SavedPaymentMethodsDrawer.clearAll") || "Clear All"}
//                 </span>
//               </button>
//             </div>
//           )}
//         </div>

//         {/* Content */}
//         <div className="flex-1 overflow-y-auto min-h-0">
//           {/* Not Authenticated State */}
//           {!user ? (
//             <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//               <div
//                 className={`
//                   w-20 h-20 rounded-full flex items-center justify-center mb-6
//                   ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                 `}
//               >
//                 <User
//                   size={32}
//                   className={isDarkMode ? "text-gray-400" : "text-gray-500"}
//                 />
//               </div>
//               <h3
//                 className={`
//                   text-xl font-bold mb-3 text-center
//                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                 `}
//               >
//                 {l("SavedPaymentMethodsDrawer.loginRequired") ||
//                   "Login Required"}
//               </h3>
//               <p
//                 className={`
//                   text-center mb-8 leading-relaxed
//                   ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                 `}
//               >
//                 {l("SavedPaymentMethodsDrawer.loginToManagePaymentMethods") ||
//                   "Please login to view and manage your payment methods."}
//               </p>
//               <button
//                 onClick={handleGoToLogin}
//                 className="
//                   flex items-center space-x-2 px-6 py-3 rounded-full
//                   bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                   hover:from-orange-600 hover:to-pink-600
//                   transition-all duration-200 shadow-lg hover:shadow-xl
//                   active:scale-95
//                 "
//               >
//                 <LogIn size={18} />
//                 <span className="font-medium">
//                   {l("SavedPaymentMethodsDrawer.login") || "Login"}
//                 </span>
//               </button>
//             </div>
//           ) : /* Loading State */ isLoading ? (
//             <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//               <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
//               <p
//                 className={`
//                   text-center
//                   ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                 `}
//               >
//                 {l("SavedPaymentMethodsDrawer.loading") ||
//                   "Loading payment methods..."}
//               </p>
//             </div>
//           ) : /* Empty State */ paymentMethods.length === 0 ? (
//             <div className="flex flex-col items-center justify-center h-full px-6 py-12">
//               <div
//                 className={`
//                   w-20 h-20 rounded-full flex items-center justify-center mb-6
//                   ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
//                 `}
//               >
//                 <CreditCard
//                   size={32}
//                   className={isDarkMode ? "text-gray-400" : "text-gray-500"}
//                 />
//               </div>
//               <h3
//                 className={`
//                   text-xl font-bold mb-3 text-center
//                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                 `}
//               >
//                 {l("SavedPaymentMethodsDrawer.noSavedPaymentMethods") ||
//                   "No Saved Payment Methods"}
//               </h3>
//               <p
//                 className={`
//                   text-center mb-8 leading-relaxed
//                   ${isDarkMode ? "text-gray-400" : "text-gray-600"}
//                 `}
//               >
//                 {l("SavedPaymentMethodsDrawer.addFirstPaymentMethod") ||
//                   "Add your first payment method to get started with secure payments."}
//               </p>
//               <button
//                 onClick={() => setShowAddModal(true)}
//                 className="
//                   flex items-center space-x-2 px-6 py-3 rounded-full
//                   bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                   hover:from-orange-600 hover:to-pink-600
//                   transition-all duration-200 shadow-lg hover:shadow-xl
//                   active:scale-95
//                 "
//               >
//                 <Plus size={18} />
//                 <span className="font-medium">
//                   {l("SavedPaymentMethodsDrawer.addNewPaymentMethod") ||
//                     "Add Payment Method"}
//                 </span>
//               </button>
//             </div>
//           ) : (
//             /* Payment Methods List */
//             <div className="px-4 py-4">
//               <div className="space-y-4">
//                 {paymentMethods.map((method) => {
//                   const isRemoving = removingItems.has(method.id);

//                   return (
//                     <div
//                       key={method.id}
//                       className={`
//                         transition-all duration-300 transform cursor-pointer
//                         ${
//                           isRemoving
//                             ? "opacity-50 scale-95"
//                             : "opacity-100 scale-100"
//                         }
//                       `}
//                     >
//                       <div
//                         className={`
//                           rounded-xl border p-4 transition-all duration-200 relative
//                           ${
//                             isDarkMode
//                               ? "bg-gray-800 border-gray-700 hover:border-gray-600"
//                               : "bg-gray-50 border-gray-200 hover:border-gray-300"
//                           }
//                           ${
//                             method.isPreferred
//                               ? "ring-2 ring-orange-500 border-orange-500"
//                               : ""
//                           }
//                         `}
//                         onClick={() =>
//                           !method.isPreferred && setAsPreferred(method.id)
//                         }
//                       >
//                         {/* Preferred Badge */}
//                         {method.isPreferred && (
//                           <div className="absolute top-3 right-3">
//                             <div className="flex items-center space-x-1 px-2 py-1 rounded-full bg-orange-500 text-white text-xs font-medium">
//                               <Star size={12} fill="currentColor" />
//                               <span>
//                                 {l("SavedPaymentMethodsDrawer.preferred") ||
//                                   "Preferred"}
//                               </span>
//                             </div>
//                           </div>
//                         )}

//                         <div className="flex items-center space-x-3">
//                           {/* Card Icon/Logo */}
//                           <div
//                             className={`
//                               w-12 h-8 rounded-lg flex items-center justify-center
//                               ${isDarkMode ? "bg-gray-700" : "bg-white"}
//                               border
//                               ${
//                                 isDarkMode
//                                   ? "border-gray-600"
//                                   : "border-gray-200"
//                               }
//                             `}
//                           >
//                             <CreditCard size={20} className="text-orange-500" />
//                           </div>

//                           {/* Card Details */}
//                           <div className="flex-1 min-w-0">
//                             <div className="flex items-center justify-between mb-1">
//                               <h3
//                                 className={`
//                                   font-semibold text-sm
//                                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                                 `}
//                               >
//                                 {method.cardHolderName}
//                               </h3>
//                             </div>
//                             <p
//                               className={`
//                                 text-sm font-mono
//                                 ${
//                                   isDarkMode ? "text-gray-300" : "text-gray-600"
//                                 }
//                               `}
//                             >
//                               {maskCardNumber(method.cardNumber)}
//                             </p>
//                             <div className="flex items-center justify-between mt-2">
//                               <span
//                                 className={`
//                                   text-xs
//                                   ${
//                                     isDarkMode
//                                       ? "text-gray-400"
//                                       : "text-gray-500"
//                                   }
//                                 `}
//                               >
//                                 {l("SavedPaymentMethodsDrawer.expires") ||
//                                   "Expires"}
//                                 : {method.expiryDate}
//                               </span>
//                               <span
//                                 className={`
//                                   text-xs font-medium
//                                   ${
//                                     isDarkMode
//                                       ? "text-gray-300"
//                                       : "text-gray-700"
//                                   }
//                                 `}
//                               >
//                                 {getCardTypeName(method.cardNumber)}
//                               </span>
//                             </div>
//                           </div>
//                         </div>

//                         {/* Action Buttons */}
//                         <div className="flex items-center justify-end space-x-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
//                           <button
//                             onClick={(e) => {
//                               e.stopPropagation();
//                               editPaymentMethod(method);
//                             }}
//                             className={`
//                               p-2 rounded-lg transition-colors duration-200
//                               ${
//                                 isDarkMode
//                                   ? "hover:bg-gray-700 text-gray-400 hover:text-blue-400"
//                                   : "hover:bg-blue-50 text-gray-500 hover:text-blue-600"
//                               }
//                             `}
//                           >
//                             <Edit2 size={16} />
//                           </button>

//                           <button
//                             onClick={(e) => {
//                               e.stopPropagation();
//                               deletePaymentMethod(method.id);
//                             }}
//                             disabled={isRemoving}
//                             className={`
//                               p-2 rounded-lg transition-colors duration-200
//                               ${
//                                 isDarkMode
//                                   ? "hover:bg-gray-700 text-gray-400 hover:text-red-400"
//                                   : "hover:bg-red-50 text-gray-500 hover:text-red-600"
//                               }
//                               ${
//                                 isRemoving
//                                   ? "opacity-50 cursor-not-allowed"
//                                   : ""
//                               }
//                             `}
//                           >
//                             {isRemoving ? (
//                               <RefreshCw size={16} className="animate-spin" />
//                             ) : (
//                               <Trash2 size={16} />
//                             )}
//                           </button>
//                         </div>
//                       </div>
//                     </div>
//                   );
//                 })}
//               </div>
//             </div>
//           )}
//         </div>
//       </div>

//       {/* Add/Edit Payment Method Modal */}
//       {showAddModal && (
//         <div className="absolute inset-0 bg-black/50 backdrop-blur-sm z-10 flex items-center justify-center p-6">
//           <div
//             className={`
//               w-full max-w-sm rounded-xl p-6
//               ${isDarkMode ? "bg-gray-800" : "bg-white"}
//               shadow-2xl max-h-[80vh] overflow-y-auto
//             `}
//           >
//             <div className="flex items-center justify-between mb-4">
//               <h3
//                 className={`
//                   text-lg font-bold
//                   ${isDarkMode ? "text-white" : "text-gray-900"}
//                 `}
//               >
//                 {editingMethod
//                   ? l("SavedPaymentMethodsDrawer.editPaymentMethod") ||
//                     "Edit Payment Method"
//                   : l("SavedPaymentMethodsDrawer.newPaymentMethod") ||
//                     "New Payment Method"}
//               </h3>
//               <button
//                 onClick={() => {
//                   setShowAddModal(false);
//                   setEditingMethod(null);
//                   setFormData({
//                     cardHolderName: "",
//                     cardNumber: "",
//                     expiryDate: "",
//                   });
//                 }}
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
//               {/* Card Holder Name */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SavedPaymentMethodsDrawer.cardHolderName") ||
//                     "Cardholder Name"}
//                 </label>
//                 <input
//                   type="text"
//                   value={formData.cardHolderName}
//                   onChange={(e) =>
//                     handleInputChange(
//                       "SavedPaymentMethodsDrawer.cardHolderName",
//                       e.target.value
//                     )
//                   }
//                   placeholder={
//                     l("SavedPaymentMethodsDrawer.cardHolderName") ||
//                     "Cardholder Name"
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

//               {/* Card Number */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SavedPaymentMethodsDrawer.cardNumber") || "Card Number"}
//                 </label>
//                 <input
//                   type="text"
//                   value={formData.cardNumber}
//                   onChange={(e) =>
//                     handleInputChange(
//                       "SavedPaymentMethodsDrawer.cardNumber",
//                       e.target.value
//                     )
//                   }
//                   placeholder="1234 5678 9012 3456"
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
//               </div>

//               {/* Expiry Date */}
//               <div>
//                 <label
//                   className={`
//                     block text-sm font-medium mb-2
//                     ${isDarkMode ? "text-gray-300" : "text-gray-700"}
//                   `}
//                 >
//                   {l("SavedPaymentMethodsDrawer.expiryDate") || "Expiry Date"}
//                 </label>
//                 <input
//                   type="text"
//                   value={formData.expiryDate}
//                   onChange={(e) =>
//                     handleInputChange(
//                       "SavedPaymentMethodsDrawer.expiryDate",
//                       e.target.value
//                     )
//                   }
//                   placeholder="MM/YY"
//                   maxLength={5}
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
//               </div>
//             </div>

//             {/* Actions */}
//             <div className="flex space-x-3 mt-6">
//               <button
//                 onClick={() => {
//                   setShowAddModal(false);
//                   setEditingMethod(null);
//                   setFormData({
//                     cardHolderName: "",
//                     cardNumber: "",
//                     expiryDate: "",
//                   });
//                 }}
//                 className={`
//                   flex-1 py-2 px-4 rounded-lg
//                   ${
//                     isDarkMode
//                       ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
//                       : "bg-gray-100 text-gray-700 hover:bg-gray-200"
//                   }
//                   transition-colors duration-200
//                 `}
//               >
//                 {l("SavedPaymentMethodsDrawer.cancel") || "Cancel"}
//               </button>
//               <button
//                 onClick={handleSavePaymentMethod}
//                 disabled={
//                   !formData.cardHolderName.trim() ||
//                   !formData.cardNumber.trim() ||
//                   !formData.expiryDate.trim()
//                 }
//                 className="
//                   flex-1 py-2 px-4 rounded-lg
//                   bg-gradient-to-r from-orange-500 to-pink-500 text-white
//                   hover:from-orange-600 hover:to-pink-600
//                   disabled:opacity-50 disabled:cursor-not-allowed
//                   transition-all duration-200
//                 "
//               >
//                 {l("SavedPaymentMethodsDrawer.save") || "Save"}
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );

//   return typeof window !== 'undefined'
//     ? createPortal(drawerContent, document.body)
//     : null;
// };
