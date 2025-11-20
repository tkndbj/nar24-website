// components/FavoriteBasketWidget.tsx - REFACTORED v3.0
// Matches favorite_basket_widget.dart exactly

"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { Plus, X, ChevronDown } from "lucide-react";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";
import { useTranslations } from "next-intl";

interface FavoriteBasketWidgetProps {
  isDarkMode?: boolean;
  onBasketChanged?: () => void;
}

export const FavoriteBasketWidget: React.FC<FavoriteBasketWidgetProps> = ({
  isDarkMode = false,
  onBasketChanged,
}) => {
  const { user } = useUser();
  const {
    selectedBasketId,
    favoriteBaskets,
    createFavoriteBasket,
    deleteFavoriteBasket,
    setSelectedBasket,
  } = useFavorites();
  const localization = useTranslations();

  const t = useCallback(
    (key: string) => {
      if (!localization) return key;

      try {
        const translation = localization(`FavoritesDrawer.${key}`);
        if (translation && translation !== `FavoritesDrawer.${key}`) {
          return translation;
        }

        const directTranslation = localization(key);
        if (directTranslation && directTranslation !== key) {
          return directTranslation;
        }

        return key;
      } catch (error) {
        console.warn(`Translation error for key: ${key}`, error);
        return key;
      }
    },
    [localization]
  );

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBasketName, setNewBasketName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isDropdownOpen]);

  const handleBasketClick = useCallback(
    (basketId: string) => {
      // Toggle basket selection
      if (basketId === selectedBasketId) {
        setSelectedBasket(null);
      } else {
        setSelectedBasket(basketId);
      }

      // Close dropdown
      setIsDropdownOpen(false);

      // Notify parent to reload if needed
      onBasketChanged?.();
    },
    [selectedBasketId, setSelectedBasket, onBasketChanged]
  );

  const handleCreateBasket = useCallback(async () => {
    if (!newBasketName.trim()) return;

    setIsCreating(true);
    try {
      const result = await createFavoriteBasket(newBasketName.trim());

      if (result === "Basket created") {
        setNewBasketName("");
        setShowCreateDialog(false);
      } else if (result === "Maximum basket limit reached") {
        alert(t("maxBasketsReached"));
      }
    } catch (error) {
      console.error("Error creating basket:", error);
      alert("Error creating basket");
    } finally {
      setIsCreating(false);
    }
  }, [newBasketName, createFavoriteBasket, t]);

  const handleDeleteBasket = useCallback(
    async (basketId: string) => {
      try {
        await deleteFavoriteBasket(basketId);
        setShowDeleteConfirm(null);
      } catch (error) {
        console.error("Error deleting basket:", error);
        alert("Error deleting basket");
      }
    },
    [deleteFavoriteBasket]
  );

  if (!user) return null;

  // ========================================================================
  // BASKET DROPDOWN RENDER
  // ========================================================================

  const selectedBasket = favoriteBaskets.find(
    (b) => b.id === selectedBasketId
  );

  return (
    <>
      {/* Basket Dropdown Container */}
      <div className="relative" ref={dropdownRef}>
        {/* Dropdown Button */}
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className={`
            w-full flex items-center justify-between px-4 py-2.5 rounded-lg
            transition-colors duration-200 text-sm font-medium
            ${
              isDarkMode
                ? "bg-gray-800 hover:bg-gray-700 text-white border border-gray-700"
                : "bg-gray-50 hover:bg-gray-100 text-gray-900 border border-gray-300"
            }
          `}
        >
          <span>
            {selectedBasket ? selectedBasket.name : t("allFavorites")}
          </span>
          <ChevronDown
            size={18}
            className={`transition-transform duration-200 ${
              isDropdownOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isDropdownOpen && (
          <div
            className={`
              absolute top-full left-0 right-0 mt-2 rounded-lg shadow-2xl
              border overflow-hidden z-[70]
              ${
                isDarkMode
                  ? "bg-gray-800 border-gray-700"
                  : "bg-white border-gray-200"
              }
            `}
          >
            {/* All Favorites Option */}
            <button
              onClick={() => {
                setSelectedBasket(null);
                setIsDropdownOpen(false);
                onBasketChanged?.();
              }}
              className={`
                w-full px-4 py-2.5 text-left text-sm transition-colors duration-150
                ${
                  !selectedBasketId
                    ? "bg-orange-500 text-white"
                    : isDarkMode
                    ? "text-white hover:bg-gray-700"
                    : "text-gray-900 hover:bg-gray-50"
                }
              `}
            >
              {t("allFavorites")}
            </button>

            {/* Divider */}
            {favoriteBaskets.length > 0 && (
              <div
                className={`
                  border-t
                  ${isDarkMode ? "border-gray-700" : "border-gray-200"}
                `}
              />
            )}

            {/* Basket Options */}
            {favoriteBaskets.map((basket) => {
              const isSelected = basket.id === selectedBasketId;

              return (
                <div
                  key={basket.id}
                  className={`
                    flex items-center justify-between px-4 py-2.5
                    transition-colors duration-150
                    ${
                      isSelected
                        ? "bg-orange-500 text-white"
                        : isDarkMode
                        ? "text-white hover:bg-gray-700"
                        : "text-gray-900 hover:bg-gray-50"
                    }
                  `}
                >
                  <button
                    onClick={() => handleBasketClick(basket.id)}
                    className="flex-1 text-left text-sm font-medium"
                  >
                    {basket.name}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(basket.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`
                      ml-2 p-1 rounded transition-colors duration-150
                      ${
                        isSelected
                          ? "hover:bg-orange-600"
                          : isDarkMode
                          ? "hover:bg-gray-600"
                          : "hover:bg-gray-200"
                      }
                    `}
                  >
                    <X size={16} />
                  </button>
                </div>
              );
            })}

            {/* Create Basket Option */}
            <div
              className={`
                border-t
                ${isDarkMode ? "border-gray-700" : "border-gray-200"}
              `}
            >
              <button
                onClick={() => {
                  if (favoriteBaskets.length >= 10) {
                    alert(t("maxBasketsReached"));
                    return;
                  }
                  setShowCreateDialog(true);
                  setIsDropdownOpen(false);
                }}
                className={`
                  w-full flex items-center justify-center space-x-2 px-4 py-2.5
                  text-sm font-medium transition-colors duration-150
                  ${
                    isDarkMode
                      ? "text-orange-400 hover:bg-gray-700"
                      : "text-orange-600 hover:bg-gray-50"
                  }
                `}
              >
                <Plus size={16} />
                <span>{t("createNewBasket")}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Basket Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className={`
              w-full max-w-sm rounded-xl p-6 shadow-2xl
              ${isDarkMode ? "bg-gray-800" : "bg-white"}
            `}
          >
            <h3
              className={`
                text-lg font-bold mb-4
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {t("createBasket")}
            </h3>
            <input
              type="text"
              value={newBasketName}
              onChange={(e) => setNewBasketName(e.target.value)}
              placeholder={t("enterBasketNamePlaceholder")}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateBasket();
                }
              }}
              className={`
                w-full px-3 py-2 rounded-lg border mb-4
                ${
                  isDarkMode
                    ? "bg-gray-700 border-gray-600 text-white placeholder-gray-400"
                    : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                }
                focus:ring-2 focus:ring-orange-500 focus:border-transparent
                outline-none
              `}
            />
            <div className="flex space-x-3">
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewBasketName("");
                }}
                className={`
                  flex-1 py-2 px-4 rounded-lg font-medium
                  transition-colors duration-200
                  ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }
                `}
              >
                {t("cancel")}
              </button>
              <button
                onClick={handleCreateBasket}
                disabled={!newBasketName.trim() || isCreating}
                className="
                  flex-1 py-2 px-4 rounded-lg font-medium
                  bg-gradient-to-r from-orange-500 to-pink-500 text-white
                  hover:from-orange-600 hover:to-pink-600
                  disabled:opacity-50 disabled:cursor-not-allowed
                  transition-all duration-200
                "
              >
                {isCreating ? t("creating") : t("create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div
            className={`
              w-full max-w-sm rounded-xl p-6 shadow-2xl
              ${isDarkMode ? "bg-gray-800" : "bg-white"}
            `}
          >
            <h3
              className={`
                text-lg font-bold mb-4
                ${isDarkMode ? "text-white" : "text-gray-900"}
              `}
            >
              {t("deleteBasket")}
            </h3>
            <p
              className={`
                mb-6
                ${isDarkMode ? "text-gray-300" : "text-gray-600"}
              `}
            >
              {t("deleteBasketConfirmation")}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className={`
                  flex-1 py-2 px-4 rounded-lg font-medium
                  transition-colors duration-200
                  ${
                    isDarkMode
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }
                `}
              >
                {t("cancel")}
              </button>
              <button
                onClick={() => handleDeleteBasket(showDeleteConfirm)}
                className="
                  flex-1 py-2 px-4 rounded-lg font-medium
                  bg-red-500 text-white
                  hover:bg-red-600
                  transition-colors duration-200
                "
              >
                {t("delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
