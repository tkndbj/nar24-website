// "use client";

// import React, { useState, useEffect, useCallback, useRef } from "react";
// import { useRouter } from "next/navigation";
// import {
//   ArrowLeft,
//   MapPin,
//   List,
//   RefreshCw,
//   Clock,
//   Phone,
//   Navigation,
//   X,
//   AlertCircle,
// } from "lucide-react";
// import { collection, getDocs, query, where } from "firebase/firestore";
// import { db } from "@/lib/firebase";
// import { useTranslations } from "next-intl";

// interface PickupPoint {
//   id: string;
//   name: string;
//   address: string;
//   latitude: number;
//   longitude: number;
//   phone?: string;
//   openingHours?: string;
//   isActive: boolean;
//   description?: string;
// }

// // Updated script loader utility for modern Google Maps
// const loadGoogleMapsScript = (): Promise<void> => {
//   return new Promise((resolve, reject) => {
//     // Check if already loaded and fully initialized
//     if (typeof window !== 'undefined' &&
//         window.google?.maps &&
//         'importLibrary' in window.google.maps) {
//       resolve();
//       return;
//     }

//     // Check if script is already loading
//     const existingScript = document.querySelector(
//       'script[src*="maps.googleapis.com"]'
//     );
//     if (existingScript) {
//       // Wait for full initialization
//       const checkReady = setInterval(() => {
//         if (window.google?.maps && 'importLibrary' in window.google.maps) {
//           clearInterval(checkReady);
//           resolve();
//         }
//       }, 100);

//       // Timeout after 10 seconds
//       setTimeout(() => {
//         clearInterval(checkReady);
//         reject(new Error('Google Maps API failed to initialize'));
//       }, 10000);
//       return;
//     }

//     // Create and load script with marker library for AdvancedMarkerElement
//     const script = document.createElement("script");
//     script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=marker,places&v=weekly`;
//     script.async = true;
//     script.defer = true;

//     script.onload = () => {
//       // Wait for importLibrary to be available
//       const checkReady = setInterval(() => {
//         if (window.google?.maps && 'importLibrary' in window.google.maps) {
//           clearInterval(checkReady);
//           resolve();
//         }
//       }, 100);

//       // Timeout after 10 seconds
//       setTimeout(() => {
//         clearInterval(checkReady);
//         reject(new Error('Google Maps API failed to initialize'));
//       }, 10000);
//     };

//     script.onerror = reject;
//     document.head.appendChild(script);
//   });
// };

// // Dark map style for dark mode
// const darkMapStyle = [
//   { elementType: "geometry", stylers: [{ color: "#1d2c4d" }] },
//   {
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#8ec3b9" }],
//   },
//   {
//     elementType: "labels.text.stroke",
//     stylers: [{ color: "#1a3646" }],
//   },
//   {
//     featureType: "administrative.country",
//     elementType: "geometry.stroke",
//     stylers: [{ color: "#4b6878" }],
//   },
//   {
//     featureType: "administrative.land_parcel",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#64779f" }],
//   },
//   {
//     featureType: "administrative.province",
//     elementType: "geometry.stroke",
//     stylers: [{ color: "#4b6878" }],
//   },
//   {
//     featureType: "landscape.man_made",
//     elementType: "geometry.stroke",
//     stylers: [{ color: "#334e87" }],
//   },
//   {
//     featureType: "landscape.natural",
//     elementType: "geometry",
//     stylers: [{ color: "#023e58" }],
//   },
//   {
//     featureType: "poi",
//     elementType: "geometry",
//     stylers: [{ color: "#283d6a" }],
//   },
//   {
//     featureType: "poi",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#6f9ba5" }],
//   },
//   {
//     featureType: "poi",
//     elementType: "labels.text.stroke",
//     stylers: [{ color: "#1d2c4d" }],
//   },
//   {
//     featureType: "poi.park",
//     elementType: "geometry.fill",
//     stylers: [{ color: "#023e58" }],
//   },
//   {
//     featureType: "poi.park",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#3C7680" }],
//   },
//   {
//     featureType: "road",
//     elementType: "geometry",
//     stylers: [{ color: "#304a7d" }],
//   },
//   {
//     featureType: "road",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#98a5be" }],
//   },
//   {
//     featureType: "road",
//     elementType: "labels.text.stroke",
//     stylers: [{ color: "#1d2c4d" }],
//   },
//   {
//     featureType: "road.highway",
//     elementType: "geometry",
//     stylers: [{ color: "#2c6675" }],
//   },
//   {
//     featureType: "road.highway",
//     elementType: "geometry.stroke",
//     stylers: [{ color: "#255763" }],
//   },
//   {
//     featureType: "road.highway",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#b0d5ce" }],
//   },
//   {
//     featureType: "road.highway",
//     elementType: "labels.text.stroke",
//     stylers: [{ color: "#023e58" }],
//   },
//   {
//     featureType: "transit",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#98a5be" }],
//   },
//   {
//     featureType: "transit",
//     elementType: "labels.text.stroke",
//     stylers: [{ color: "#1d2c4d" }],
//   },
//   {
//     featureType: "transit.line",
//     elementType: "geometry.fill",
//     stylers: [{ color: "#283d6a" }],
//   },
//   {
//     featureType: "transit.station",
//     elementType: "geometry",
//     stylers: [{ color: "#3a4762" }],
//   },
//   {
//     featureType: "water",
//     elementType: "geometry",
//     stylers: [{ color: "#0e1626" }],
//   },
//   {
//     featureType: "water",
//     elementType: "labels.text.fill",
//     stylers: [{ color: "#4e6d70" }],
//   },
// ];

// export default function PickupPointsPage() {
//   const [isDarkMode, setIsDarkMode] = useState(false);
//   const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
//   const [isLoading, setIsLoading] = useState(true);
//   const [errorMessage, setErrorMessage] = useState<string | null>(null);
//   const [mapsLoaded, setMapsLoaded] = useState(false);
//   const [showPointsList, setShowPointsList] = useState(false);
//   const [selectedPoint, setSelectedPoint] = useState<PickupPoint | null>(null);
//   const [showDetailModal, setShowDetailModal] = useState(false);

//   const mapRef = useRef<HTMLDivElement>(null);
//   const mapInstanceRef = useRef<google.maps.Map | null>(null);
//   const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

//   const router = useRouter();
//   const t = useTranslations();

//   // Cyprus center coordinates
//   const cyprusCenter = { lat: 35.1264, lng: 33.4299 };

//   useEffect(() => {
//     const checkTheme = () => {
//       if (typeof document !== "undefined") {
//         setIsDarkMode(document.documentElement.classList.contains("dark"));
//       }
//     };

//     checkTheme();
//     const observer = new MutationObserver(checkTheme);
//     if (typeof document !== "undefined") {
//       observer.observe(document.documentElement, {
//         attributes: true,
//         attributeFilter: ["class"],
//       });
//     }
//     return () => observer.disconnect();
//   }, []);

//   // Load Google Maps script
//   useEffect(() => {
//     if (typeof window !== "undefined") {
//       loadGoogleMapsScript()
//         .then(() => setMapsLoaded(true))
//         .catch((err) => {
//           console.error("Failed to load Google Maps:", err);
//           setErrorMessage("Failed to load Google Maps. Please check your connection and API key.");
//         });
//     }
//   }, []);

//   // Load pickup points from Firestore
//   const loadPickupPoints = useCallback(async () => {
//     setIsLoading(true);
//     setErrorMessage(null);

//     try {
//       const pickupPointsRef = collection(db, "pickup_points");
//       const q = query(pickupPointsRef, where("isActive", "==", true));
//       const snapshot = await getDocs(q);

//       const points: PickupPoint[] = snapshot.docs.map((doc) => ({
//         id: doc.id,
//         ...doc.data(),
//       })) as PickupPoint[];

//       setPickupPoints(points);
//     } catch (error) {
//       console.error("Error loading pickup points:", error);
//       setErrorMessage("Failed to load pickup points. Please try again.");
//     } finally {
//       setIsLoading(false);
//     }
//   }, []);

//   // Initialize map
//   useEffect(() => {
//     if (!mapsLoaded || !mapRef.current) return;

//     const initializeMap = async () => {
//       try {
//         // Import the marker library
//         const { AdvancedMarkerElement } = (await google.maps.importLibrary(
//           "marker"
//         )) as google.maps.MarkerLibrary;

//         // Create map
//         const map = new google.maps.Map(mapRef.current!, {
//           center: cyprusCenter,
//           zoom: 10,
//           mapId: process.env.NEXT_PUBLIC_MAP_ID || "DEMO_MAP_ID",
//           clickableIcons: false,
//           gestureHandling: "greedy",
//           styles: isDarkMode ? darkMapStyle : [],
//           zoomControl: true,
//           mapTypeControl: false,
//           scaleControl: true,
//           streetViewControl: false,
//           rotateControl: false,
//           fullscreenControl: true,
//         });

//         mapInstanceRef.current = map;

//         // Clear existing markers
//         markersRef.current.forEach(marker => {
//           marker.map = null;
//         });
//         markersRef.current = [];

//         // Create markers for pickup points
//         pickupPoints.forEach((point) => {
//           // Create custom marker element
//           const markerElement = document.createElement('div');
//           markerElement.className = 'pickup-point-marker';
//           markerElement.innerHTML = `
//             <div style="
//               width: 40px;
//               height: 40px;
//               background: linear-gradient(135deg, #f97316, #ec4899);
//               border-radius: 50%;
//               display: flex;
//               align-items: center;
//               justify-content: center;
//               box-shadow: 0 4px 12px rgba(249, 115, 22, 0.4);
//               border: 3px solid white;
//               cursor: pointer;
//               transition: transform 0.2s ease;
//             ">
//               <svg width="20" height="20" fill="white" viewBox="0 0 24 24">
//                 <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
//               </svg>
//             </div>
//           `;

//           // Add hover effect
//           markerElement.addEventListener('mouseenter', () => {
//             markerElement.style.transform = 'scale(1.1)';
//           });
//           markerElement.addEventListener('mouseleave', () => {
//             markerElement.style.transform = 'scale(1)';
//           });

//           const marker = new AdvancedMarkerElement({
//             map: map,
//             position: { lat: point.latitude, lng: point.longitude },
//             content: markerElement,
//             title: point.name,
//           });

//           // Add click listener
//           markerElement.addEventListener('click', () => {
//             setSelectedPoint(point);
//             setShowDetailModal(true);
//           });

//           markersRef.current.push(marker);
//         });

//       } catch (error) {
//         console.error("Error initializing map:", error);
//         setErrorMessage("Failed to initialize map. Please refresh the page.");
//       }
//     };

//     if (pickupPoints.length > 0) {
//       initializeMap();
//     }
//   }, [mapsLoaded, pickupPoints, isDarkMode]);

//   // Load pickup points on component mount
//   useEffect(() => {
//     loadPickupPoints();
//   }, [loadPickupPoints]);

//   // Navigate to specific pickup point on map
//   const goToPickupPoint = useCallback((point: PickupPoint) => {
//     if (mapInstanceRef.current) {
//       mapInstanceRef.current.panTo({ lat: point.latitude, lng: point.longitude });
//       mapInstanceRef.current.setZoom(15);

//       // Close list modal and show detail after a delay
//       setShowPointsList(false);
//       setTimeout(() => {
//         setSelectedPoint(point);
//         setShowDetailModal(true);
//       }, 300);
//     }
//   }, []);

//   // Get directions to pickup point
//   const getDirections = useCallback((point: PickupPoint) => {
//     const url = `https://www.google.com/maps/dir/?api=1&destination=${point.latitude},${point.longitude}`;
//     window.open(url, '_blank');
//   }, []);

//   const l = (key: string) => t(key) || key.split('.').pop() || key;

//   return (
//     <div className={`h-screen flex flex-col ${isDarkMode ? "bg-gray-900" : "bg-gray-50"}`}>
//       {/* Header */}
//       <div
//         className={`relative z-20 ${
//           isDarkMode ? "bg-gray-900/95" : "bg-white/95"
//         } backdrop-blur-sm border-b ${
//           isDarkMode ? "border-gray-700" : "border-gray-200"
//         }`}
//       >
//         <div className="flex items-center justify-between px-4 h-16">
//           <div className="flex items-center space-x-3">
//             <button
//               onClick={() => router.back()}
//               className={`p-2 rounded-lg transition-colors ${
//                 isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
//               }`}
//               title={l("PickupPoints.goBack") || "Go Back"}
//             >
//               <ArrowLeft className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
//             </button>
//             <h1 className={`text-lg font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//               {l("PickupPoints.pickupPointsMap") || "Pickup Points Map"}
//             </h1>
//           </div>

//           <div className="flex items-center space-x-2">
//             <button
//               onClick={loadPickupPoints}
//               disabled={isLoading}
//               className={`p-2 rounded-lg transition-colors ${
//                 isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
//               } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
//               title={l("PickupPoints.refresh") || "Refresh"}
//             >
//               <RefreshCw
//                 className={`w-5 h-5 ${isDarkMode ? "text-white" : "text-gray-900"} ${
//                   isLoading ? "animate-spin" : ""
//                 }`}
//               />
//             </button>
//           </div>
//         </div>
//       </div>

//       {/* Floating Back Button - Top Left Corner */}
//       <div className="absolute top-4 left-4 z-30">
//         <button
//           onClick={() => router.back()}
//           className={`
//             w-12 h-12 rounded-full shadow-lg transition-all duration-200
//             flex items-center justify-center
//             ${isDarkMode
//               ? "bg-gray-900/90 hover:bg-gray-800 border border-gray-700"
//               : "bg-white/90 hover:bg-gray-50 border border-gray-200"
//             }
//             backdrop-blur-md hover:scale-105 active:scale-95
//           `}
//           title={l("PickupPoints.goBack") || "Go Back"}
//         >
//           <ArrowLeft className={`w-6 h-6 ${isDarkMode ? "text-white" : "text-gray-900"}`} />
//         </button>
//       </div>

//       {/* Map Container */}
//       <div className="flex-1 relative">
//         {/* Map */}
//         <div ref={mapRef} className="w-full h-full" />

//         {/* Loading Overlay */}
//         {isLoading && (
//           <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
//             <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-xl">
//               <div className="flex items-center space-x-3">
//                 <div className="animate-spin w-6 h-6 border-3 border-orange-500 border-t-transparent rounded-full"></div>
//                 <span className={isDarkMode ? "text-white" : "text-gray-900"}>
//                   {l("PickupPoints.loading") || "Loading pickup points..."}
//                 </span>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* Error Message */}
//         {errorMessage && (
//           <div className="absolute top-4 left-4 right-4 z-20">
//             <div className="bg-red-500 text-white p-4 rounded-lg shadow-lg flex items-center justify-between">
//               <div className="flex items-center space-x-3">
//                 <AlertCircle className="w-5 h-5" />
//                 <span>{errorMessage}</span>
//               </div>
//               <button
//                 onClick={() => setErrorMessage(null)}
//                 className="p-1 hover:bg-red-600 rounded"
//               >
//                 <X className="w-4 h-4" />
//               </button>
//             </div>
//           </div>
//         )}

//         {/* Floating Action Button - List */}
//         <div className="absolute bottom-6 right-6 z-20">
//           <button
//             onClick={() => setShowPointsList(true)}
//             className="w-14 h-14 bg-orange-500 hover:bg-orange-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center"
//           >
//             <List className="w-6 h-6" />
//           </button>
//         </div>

//         {/* Info Card */}
//         <div className="absolute bottom-6 left-6 right-24 z-20">
//           <div
//             className={`p-4 rounded-lg shadow-lg ${
//               isDarkMode ? "bg-gray-800/95" : "bg-white/95"
//             } backdrop-blur-sm border ${
//               isDarkMode ? "border-gray-700" : "border-gray-200"
//             }`}
//           >
//             <div className="flex items-center space-x-3">
//               <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
//                 <MapPin className="w-5 h-5 text-orange-500" />
//               </div>
//               <div className="flex-1">
//                 <h3 className={`font-semibold text-sm ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                   {l("PickupPoints.pickupPointsAvailable") || "Pickup Points Available"}
//                 </h3>
//                 <p className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
//                   {l("PickupPoints.tapMarkerForDetails") || "Tap on a marker for details"}
//                 </p>
//               </div>
//               <div className="text-xl font-bold text-orange-500">
//                 {pickupPoints.length}
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       {/* Pickup Points List Modal */}
//       {showPointsList && (
//         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center">
//           <div
//             className={`w-full max-w-md h-3/4 md:h-auto md:max-h-3/4 rounded-t-3xl md:rounded-2xl overflow-hidden ${
//               isDarkMode ? "bg-gray-800" : "bg-white"
//             } shadow-2xl flex flex-col`}
//           >
//             {/* Handle Bar (Mobile) */}
//             <div className="md:hidden flex justify-center pt-3 pb-1">
//               <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
//             </div>

//             {/* Header */}
//             <div className="flex items-center justify-between p-6">
//               <h2 className={`text-xl font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                 {l("PickupPoints.allPickupPoints") || "All Pickup Points"}
//               </h2>
//               <div className="flex items-center space-x-3">
//                 <span className="text-lg font-bold text-orange-500">
//                   {pickupPoints.length}
//                 </span>
//                 <button
//                   onClick={() => setShowPointsList(false)}
//                   className={`p-2 rounded-full ${
//                     isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
//                   }`}
//                 >
//                   <X className={`w-5 h-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
//                 </button>
//               </div>
//             </div>

//             {/* List */}
//             <div className="flex-1 overflow-y-auto px-6 pb-6">
//               <div className="space-y-3">
//                 {pickupPoints.map((point) => (
//                   <button
//                     key={point.id}
//                     onClick={() => goToPickupPoint(point)}
//                     className={`w-full p-4 rounded-xl border text-left transition-all duration-200 hover:shadow-md ${
//                       isDarkMode
//                         ? "bg-gray-700 border-gray-600 hover:border-gray-500"
//                         : "bg-gray-50 border-gray-200 hover:border-gray-300"
//                     }`}
//                   >
//                     <div className="flex items-center space-x-3">
//                       <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
//                         <MapPin className="w-5 h-5 text-orange-500" />
//                       </div>
//                       <div className="flex-1 min-w-0">
//                         <h3 className={`font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                           {point.name}
//                         </h3>
//                         <p className={`text-sm truncate ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
//                           {point.address}
//                         </p>
//                       </div>
//                       <div className="text-right">
//                         <div className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}>
//                           {l("PickupPoints.viewOnMap") || "View on Map"}
//                         </div>
//                       </div>
//                     </div>
//                   </button>
//                 ))}
//               </div>
//             </div>
//           </div>
//         </div>
//       )}

//       {/* Pickup Point Detail Modal */}
//       {showDetailModal && selectedPoint && (
//         <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-4">
//           <div
//             className={`w-full max-w-sm rounded-t-3xl md:rounded-2xl overflow-hidden ${
//               isDarkMode ? "bg-gray-800" : "bg-white"
//             } shadow-2xl`}
//           >
//             {/* Handle Bar (Mobile) */}
//             <div className="md:hidden flex justify-center pt-3 pb-1">
//               <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full"></div>
//             </div>

//             {/* Header */}
//             <div className="flex items-center justify-between p-6 pb-4">
//               <h2 className={`text-lg font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                 {l("PickupPoints.pickupPointDetails") || "Pickup Point Details"}
//               </h2>
//               <button
//                 onClick={() => setShowDetailModal(false)}
//                 className={`p-2 rounded-full ${
//                   isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
//                 }`}
//               >
//                 <X className={`w-5 h-5 ${isDarkMode ? "text-gray-400" : "text-gray-600"}`} />
//               </button>
//             </div>

//             {/* Content */}
//             <div className="px-6 pb-6">
//               <div className="space-y-4">
//                 {/* Name & Address */}
//                 <div>
//                   <h3 className={`font-bold text-lg ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                     {selectedPoint.name}
//                   </h3>
//                   <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
//                     {selectedPoint.address}
//                   </p>
//                 </div>

//                 {/* Description */}
//                 {selectedPoint.description && (
//                   <div>
//                     <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
//                       {selectedPoint.description}
//                     </p>
//                   </div>
//                 )}

//                 {/* Opening Hours */}
//                 {selectedPoint.openingHours && (
//                   <div className="flex items-center space-x-3">
//                     <Clock className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
//                     <div>
//                       <p className={`text-sm font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                         {l("PickupPoints.openingHours") || "Opening Hours"}
//                       </p>
//                       <p className={`text-sm ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
//                         {selectedPoint.openingHours}
//                       </p>
//                     </div>
//                   </div>
//                 )}

//                 {/* Phone */}
//                 {selectedPoint.phone && (
//                   <div className="flex items-center space-x-3">
//                     <Phone className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
//                     <div>
//                       <p className={`text-sm font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                         {l("PickupPoints.phone") || "Phone"}
//                       </p>
//                       <a
//                         href={`tel:${selectedPoint.phone}`}
//                         className="text-sm text-orange-500 hover:text-orange-600"
//                       >
//                         {selectedPoint.phone}
//                       </a>
//                     </div>
//                   </div>
//                 )}

//                 {/* Coordinates */}
//                 <div className="flex items-center space-x-3">
//                   <MapPin className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`} />
//                   <div>
//                     <p className={`text-sm font-medium ${isDarkMode ? "text-white" : "text-gray-900"}`}>
//                       {l("PickupPoints.coordinates") || "Coordinates"}
//                     </p>
//                     <p className={`text-sm font-mono ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}>
//                       {selectedPoint.latitude.toFixed(4)}, {selectedPoint.longitude.toFixed(4)}
//                     </p>
//                   </div>
//                 </div>

//                 {/* Get Directions Button */}
//                 <button
//                   onClick={() => getDirections(selectedPoint)}
//                   className="w-full mt-6 py-3 px-4 bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 text-white rounded-lg font-medium transition-all duration-200 flex items-center justify-center space-x-2"
//                 >
//                   <Navigation className="w-4 h-4" />
//                   <span>{l("PickupPoints.getDirections") || "Get Directions"}</span>
//                 </button>
//               </div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// Placeholder export - page is currently disabled
export default function PickupPointsPage() {
  return null;
}
