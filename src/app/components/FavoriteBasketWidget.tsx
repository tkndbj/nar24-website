// components/FavoriteBasketWidget.tsx - REFACTORED v3.0
// Matches favorite_basket_widget.dart exactly

"use client";

import React, { useState, useCallback } from "react";
import { Plus, X } from "lucide-react";
import { useFavorites } from "@/context/FavoritesProvider";
import { useUser } from "@/context/UserProvider";

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

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newBasketName, setNewBasketName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(
    null
  );

  const handleBasketClick = useCallback(
    (basketId: string) => {
      // Toggle basket selection
      if (basketId === selectedBasketId) {
        setSelectedBasket(null);
      } else {
        setSelectedBasket(basketId);
      }

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
        alert("Maximum 10 baskets allowed");
      }
    } catch (error) {
      console.error("Error creating basket:", error);
      alert("Error creating basket");
    } finally {
      setIsCreating(false);
    }
  }, [newBasketName, createFavoriteBasket]);

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
  // BASKET CHIP RENDER
  // ========================================================================

  return (
    <>
      {/* Basket Chips Container */}
      <div className="overflow-x-auto scrollbar-hide">
        <div className="flex space-x-2 py-1">
          {/* Basket Chips */}
          {favoriteBaskets.map((basket) => {
            const isSelected = basket.id === selectedBasketId;

            return (
              <div
                key={basket.id}
                className={`
                  flex items-center space-x-1 px-3 py-1.5 rounded-full
                  transition-colors duration-200 cursor-pointer
                  whitespace-nowrap text-sm
                  ${
                    isSelected
                      ? "bg-orange-500 text-white"
                      : isDarkMode
                      ? "bg-gray-600 text-white hover:bg-gray-500"
                      : "bg-gray-600 text-white hover:bg-gray-500"
                  }
                `}
              >
                <span
                  onClick={() => handleBasketClick(basket.id)}
                  className="font-medium"
                >
                  {basket.name}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(basket.id);
                  }}
                  className="hover:opacity-80 transition-opacity"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}

          {/* Create Basket Chip */}
          <button
            onClick={() => {
              if (favoriteBaskets.length >= 10) {
                alert("Maximum 10 baskets allowed");
                return;
              }
              setShowCreateDialog(true);
            }}
            className={`
              flex items-center space-x-1 px-3 py-1.5 rounded-full
              transition-colors duration-200 whitespace-nowrap text-sm
              ${
                isDarkMode
                  ? "bg-gray-400 text-white hover:bg-gray-300"
                  : "bg-gray-400 text-white hover:bg-gray-300"
              }
            `}
          >
            <span className="font-medium">Create Basket</span>
            <Plus size={14} />
          </button>
        </div>
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
              Create Basket
            </h3>
            <input
              type="text"
              value={newBasketName}
              onChange={(e) => setNewBasketName(e.target.value)}
              placeholder="Enter basket name"
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
                Cancel
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
                {isCreating ? "Creating..." : "Create"}
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
              Delete Basket?
            </h3>
            <p
              className={`
                mb-6
                ${isDarkMode ? "text-gray-300" : "text-gray-600"}
              `}
            >
              Are you sure you want to delete this basket? This action cannot be
              undone.
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
                Cancel
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
