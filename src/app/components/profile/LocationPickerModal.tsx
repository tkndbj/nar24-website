"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, MapPin, Crosshair, Loader2 } from "lucide-react";

interface LocationPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLocationSelect: (lat: number, lng: number) => void;
  initialLocation?: { lat: number; lng: number } | null;
  isDarkMode?: boolean;
  localization?: (key: string) => string;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  isOpen,
  onClose,
  onLocationSelect,
  initialLocation,
  isDarkMode = false,
  localization,
}) => {
  const [selectedLocation, setSelectedLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(initialLocation || null);
  const [isLoadingCurrentLocation, setIsLoadingCurrentLocation] =
    useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const l = localization || ((key: string) => key.split(".").pop() || key);

  // Initialize Google Maps
  useEffect(() => {
    if (!isOpen || !mapContainerRef.current) return;

    const initMap = async () => {
      try {
        // Check if Google Maps is already loaded
        if (typeof google === "undefined" || !google.maps) {
          setMapError("Google Maps failed to load. Please refresh the page.");
          return;
        }

        const defaultCenter = initialLocation || {
          lat: 39.9334,
          lng: 32.8597,
        }; // Ankara, Turkey

        // Create map
        const map = new google.maps.Map(mapContainerRef.current!, {
          center: defaultCenter,
          zoom: initialLocation ? 16 : 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          zoomControl: true,
          gestureHandling: "greedy",
          styles: isDarkMode
            ? [
                { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
                {
                  elementType: "labels.text.stroke",
                  stylers: [{ color: "#242f3e" }],
                },
                {
                  elementType: "labels.text.fill",
                  stylers: [{ color: "#746855" }],
                },
                {
                  featureType: "poi.business",
                  stylers: [{ visibility: "off" }],
                },
              ]
            : [
                {
                  featureType: "poi.business",
                  stylers: [{ visibility: "off" }],
                },
              ],
        });

        mapRef.current = map;

        // Create marker
        const marker = new google.maps.Marker({
          map,
          position: defaultCenter,
          draggable: true,
          animation: google.maps.Animation.DROP,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: "#00A86B",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
          },
        });

        markerRef.current = marker;

        if (initialLocation) {
          setSelectedLocation(initialLocation);
        }

        // Add click listener to map
        map.addListener("click", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setSelectedLocation({ lat, lng });
            marker.setPosition(e.latLng);
            marker.setAnimation(google.maps.Animation.BOUNCE);
            setTimeout(() => marker.setAnimation(null), 700);
          }
        });

        // Add drag listener to marker
        marker.addListener("dragend", (e: google.maps.MapMouseEvent) => {
          if (e.latLng) {
            const lat = e.latLng.lat();
            const lng = e.latLng.lng();
            setSelectedLocation({ lat, lng });
          }
        });

        setIsMapLoaded(true);
      } catch (error) {
        console.error("Error initializing map:", error);
        setMapError("Failed to initialize map. Please try again.");
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initMap, 100);

    return () => {
      clearTimeout(timer);
      if (markerRef.current) {
        markerRef.current.setMap(null);
      }
      if (mapRef.current) {
        // Clean up map
        google.maps.event.clearInstanceListeners(mapRef.current);
      }
    };
  }, [isOpen, initialLocation, isDarkMode]);

  // Get current location
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      alert(
        l("LocationPicker.geolocationNotSupported") ||
          "Geolocation is not supported by your browser"
      );
      return;
    }

    setIsLoadingCurrentLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const newLocation = { lat: latitude, lng: longitude };

        setSelectedLocation(newLocation);

        if (mapRef.current && markerRef.current) {
          const latLng = new google.maps.LatLng(latitude, longitude);
          mapRef.current.panTo(latLng);
          mapRef.current.setZoom(16);
          markerRef.current.setPosition(latLng);
          markerRef.current.setAnimation(google.maps.Animation.BOUNCE);
          setTimeout(() => markerRef.current?.setAnimation(null), 700);
        }

        setIsLoadingCurrentLocation(false);
      },
      (error) => {
        console.error("Error getting location:", error);
        let errorMessage = l("LocationPicker.locationError") || "Failed to get location";
        
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage =
              l("LocationPicker.permissionDenied") ||
              "Location permission denied";
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage =
              l("LocationPicker.positionUnavailable") ||
              "Location information unavailable";
            break;
          case error.TIMEOUT:
            errorMessage =
              l("LocationPicker.timeout") ||
              "Location request timed out";
            break;
        }

        alert(errorMessage);
        setIsLoadingCurrentLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [l]);

  // Handle confirm
  const handleConfirm = () => {
    if (selectedLocation) {
      onLocationSelect(selectedLocation.lat, selectedLocation.lng);
      onClose();
    }
  };

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`
          relative w-full max-w-4xl h-[85vh] rounded-xl shadow-2xl overflow-hidden flex flex-col
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`
            flex-shrink-0 px-6 py-4 border-b
            ${isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200"}
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`
                  p-2 rounded-full
                  ${isDarkMode ? "bg-gray-700" : "bg-gray-100"}
                `}
              >
                <MapPin
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              </div>
              <div>
                <h3
                  className={`
                    text-lg font-bold
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {l("LocationPicker.selectLocation") || "Select Location"}
                </h3>
                <p
                  className={`
                    text-sm
                    ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                  `}
                >
                  {l("LocationPicker.tapOrDragMarker") ||
                    "Tap on map or drag marker"}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`
                p-2 rounded-full transition-colors
                ${
                  isDarkMode
                    ? "hover:bg-gray-700 text-gray-400"
                    : "hover:bg-gray-100 text-gray-500"
                }
              `}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 relative">
          {mapError ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center px-6">
                <div
                  className={`
                    w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center
                    ${isDarkMode ? "bg-red-900/20" : "bg-red-100"}
                  `}
                >
                  <MapPin
                    size={32}
                    className={isDarkMode ? "text-red-400" : "text-red-600"}
                  />
                </div>
                <p
                  className={`
                    text-lg font-medium mb-2
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  {l("LocationPicker.mapError") || "Map Error"}
                </p>
                <p
                  className={`
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {mapError}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Map */}
              <div ref={mapContainerRef} className="w-full h-full" />

              {/* Loading Overlay */}
              {!isMapLoaded && (
                <div className="absolute inset-0 flex items-center justify-center bg-white dark:bg-gray-900">
                  <div className="text-center">
                    <Loader2
                      size={32}
                      className="animate-spin text-orange-500 mx-auto mb-3"
                    />
                    <p
                      className={`
                        text-sm
                        ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                      `}
                    >
                      {l("LocationPicker.loadingMap") || "Loading map..."}
                    </p>
                  </div>
                </div>
              )}

              {/* Current Location Button */}
              <button
                onClick={getCurrentLocation}
                disabled={isLoadingCurrentLocation}
                className={`
                  absolute top-4 right-4 p-3 rounded-full shadow-lg transition-all
                  ${
                    isDarkMode
                      ? "bg-gray-800 hover:bg-gray-700 text-white"
                      : "bg-white hover:bg-gray-50 text-gray-700"
                  }
                  ${isLoadingCurrentLocation ? "cursor-not-allowed opacity-50" : ""}
                  active:scale-95
                `}
                title={
                  l("LocationPicker.getCurrentLocation") ||
                  "Get Current Location"
                }
              >
                {isLoadingCurrentLocation ? (
                  <Loader2 size={20} className="animate-spin text-orange-500" />
                ) : (
                  <Crosshair size={20} className="text-orange-500" />
                )}
              </button>

              {/* Selected Coordinates Display */}
              {selectedLocation && isMapLoaded && (
                <div
                  className={`
                    absolute top-4 left-4 px-4 py-2 rounded-lg shadow-lg
                    ${
                      isDarkMode
                        ? "bg-gray-800 border border-gray-700"
                        : "bg-white border border-gray-200"
                    }
                  `}
                >
                  <div className="flex items-center space-x-2">
                    <MapPin size={14} className="text-orange-500" />
                    <p
                      className={`
                        text-xs font-mono
                        ${isDarkMode ? "text-gray-300" : "text-gray-700"}
                      `}
                    >
                      {selectedLocation.lat.toFixed(6)},{" "}
                      {selectedLocation.lng.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          className={`
            flex-shrink-0 px-6 py-4 border-t
            ${isDarkMode ? "border-gray-700 bg-gray-800" : "border-gray-200"}
          `}
        >
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              className={`
                px-6 py-2.5 rounded-lg font-medium transition-colors
                ${
                  isDarkMode
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                }
              `}
            >
              {l("LocationPicker.cancel") || "Cancel"}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedLocation}
              className={`
                px-6 py-2.5 rounded-lg font-medium text-white transition-all
                ${
                  selectedLocation
                    ? "bg-gradient-to-r from-orange-500 to-pink-500 hover:from-orange-600 hover:to-pink-600 active:scale-95"
                    : "bg-gray-300 cursor-not-allowed"
                }
              `}
            >
              {l("LocationPicker.done") || "Done"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};