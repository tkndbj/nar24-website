import React, { useState, useMemo } from "react";
import {
  Heart,
  ShoppingCart,
  Star,
  Minus,
  Plus,
  Image,
  ImageOff,
} from "lucide-react";

interface ProductCard3Props {
  imageUrl: string;
  colorImages: Record<string, string[]>;
  selectedColor?: string;
  productName: string;
  brandModel: string;
  price: number;
  currency: string;
  averageRating?: number;
  scaleFactor?: number;
  showOverlayIcons?: boolean;
  productId?: string;
  onFavoriteToggled?: () => void;
  originalPrice?: number;
  discountPercentage?: number;
  showQuantityController?: boolean;
  maxQuantityAllowed?: number;
  showQuantityLabelOnly?: boolean;
  selectedColorImage?: string;
  quantity: number;
  onQuantityChanged?: (quantity: number) => void;
  isDarkMode?: boolean;
  hideStockInfo?: boolean;
  noStockText?: string;
  // Mock provider states for demo
  isFavorited?: boolean;
  isInCart?: boolean;
  onAddToCart?: () => void;
  onToggleFavorite?: () => void;
}

export const ProductCard3: React.FC<ProductCard3Props> = ({
  imageUrl,
  colorImages,
  selectedColor,
  productName,
  brandModel,
  price,
  currency,
  averageRating = 0.0,
  scaleFactor = 1.0,
  showOverlayIcons = false,
  productId,
  onFavoriteToggled,
  originalPrice,
  discountPercentage,
  maxQuantityAllowed,
  showQuantityLabelOnly = false,
  selectedColorImage,
  quantity,
  onQuantityChanged,
  isDarkMode = false,
  hideStockInfo = false,
  noStockText = "No Stock",
  isFavorited = false,
  isInCart = false,
  onAddToCart,
  onToggleFavorite,
}) => {
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);

  // Compute effective scale factor (simulating Flutter's MediaQuery)
  const computeEffectiveScaleFactor = () => {
    const windowWidth = typeof window !== "undefined" ? window.innerWidth : 375;
    const baseScale = Math.max(0.8, Math.min(1.0, windowWidth / 375));
    return baseScale * scaleFactor;
  };

  const effectiveScaleFactor = computeEffectiveScaleFactor();
  const imageHeight = 80 * effectiveScaleFactor;

  // Get display image URL with priority logic
  const getDisplayImageUrl = useMemo(() => {
    // Priority 1: selectedColorImage passed from parent
    if (selectedColorImage && selectedColorImage.trim() !== "") {
      return selectedColorImage;
    }

    // Priority 2: colorImages lookup with selected color
    if (
      selectedColor &&
      selectedColor.trim() !== "" &&
      Object.keys(colorImages).length > 0 &&
      colorImages[selectedColor]
    ) {
      const colorImagesList = colorImages[selectedColor];
      if (colorImagesList && colorImagesList.length > 0) {
        return colorImagesList[0];
      }
    }

    // Priority 3: default imageUrl
    return imageUrl && imageUrl.trim() !== "" ? imageUrl : "";
  }, [selectedColorImage, selectedColor, colorImages, imageUrl]);

  // Check if quantity controller can be shown
  const canShowController = useMemo(() => {
    return (
      maxQuantityAllowed != null &&
      maxQuantityAllowed > 0 &&
      onQuantityChanged != null
    );
  }, [maxQuantityAllowed, onQuantityChanged]);

  // Colors
  const textColor = isDarkMode ? "#ffffff" : "#000000";
  const priceColor = isDarkMode ? "#ffab40" : "#f44336";
  const jadeGreen = "#00A86B";

  // Star Rating Component
  const StarRating = ({ rating, size }: { rating: number; size: number }) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating - fullStars >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

    return (
      <div className="flex items-center">
        {Array.from({ length: fullStars }, (_, i) => (
          <Star
            key={`full-${i}`}
            size={size}
            className="fill-amber-400 text-amber-400"
          />
        ))}
        {hasHalfStar && (
          <Star
            size={size}
            className="fill-amber-400 text-amber-400 opacity-50"
          />
        )}
        {Array.from({ length: emptyStars }, (_, i) => (
          <Star key={`empty-${i}`} size={size} className="text-gray-300" />
        ))}
      </div>
    );
  };

  // Quantity Controller Component
  const QuantityController = () => {
    const canDecrement = quantity > 1;
    const canIncrement =
      maxQuantityAllowed == null ? true : quantity < maxQuantityAllowed;

    return (
      <div
        className="flex items-center border border-gray-300 rounded-full"
        style={{ borderRadius: `${20 * effectiveScaleFactor}px` }}
      >
        {/* Decrement Button */}
        <button
          onClick={
            canDecrement ? () => onQuantityChanged?.(quantity - 1) : undefined
          }
          disabled={!canDecrement}
          className={`p-1 ${
            canDecrement ? "text-orange-500" : "text-gray-400"
          }`}
          style={{
            paddingLeft: `${8 * effectiveScaleFactor}px`,
            paddingRight: `${8 * effectiveScaleFactor}px`,
            paddingTop: `${4 * effectiveScaleFactor}px`,
            paddingBottom: `${4 * effectiveScaleFactor}px`,
          }}
        >
          <Minus size={16 * effectiveScaleFactor} />
        </button>

        {/* Current Quantity */}
        <div
          className="bg-gray-200 px-2 py-1 text-center font-bold"
          style={{
            paddingLeft: `${8 * effectiveScaleFactor}px`,
            paddingRight: `${8 * effectiveScaleFactor}px`,
            paddingTop: `${4 * effectiveScaleFactor}px`,
            paddingBottom: `${4 * effectiveScaleFactor}px`,
            fontSize: `${14 * effectiveScaleFactor}px`,
          }}
        >
          {quantity}
        </div>

        {/* Increment Button */}
        <button
          onClick={
            canIncrement ? () => onQuantityChanged?.(quantity + 1) : undefined
          }
          disabled={!canIncrement}
          className={`p-1 ${
            canIncrement ? "text-orange-500" : "text-gray-400"
          }`}
          style={{
            paddingLeft: `${8 * effectiveScaleFactor}px`,
            paddingRight: `${8 * effectiveScaleFactor}px`,
            paddingTop: `${4 * effectiveScaleFactor}px`,
            paddingBottom: `${4 * effectiveScaleFactor}px`,
          }}
        >
          <Plus size={16 * effectiveScaleFactor} />
        </button>
      </div>
    );
  };

  const handleImageLoad = () => {
    setImageLoading(false);
    setImageError(false);
  };

  const handleImageError = () => {
    setImageLoading(false);
    setImageError(true);
  };

  const cardContent = (
    <div
      className="flex rounded-lg overflow-hidden"
      style={{
        height: `${imageHeight}px`,
        borderRadius: `${8 * effectiveScaleFactor}px`,
      }}
    >
      {/* Product Image */}
      <div
        className="relative flex-shrink-0 bg-gray-200"
        style={{
          width: `${90 * effectiveScaleFactor}px`,
          height: `${imageHeight}px`,
        }}
      >
        {getDisplayImageUrl ? (
          <>
            <img
              src={getDisplayImageUrl}
              alt={productName}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoading || imageError ? "opacity-0" : "opacity-100"
              }`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />

            {/* Loading State */}
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                <Image
                  size={25 * effectiveScaleFactor}
                  className="text-gray-400"
                />
              </div>
            )}

            {/* Error State */}
            {imageError && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                <ImageOff
                  size={25 * effectiveScaleFactor}
                  className="text-gray-400"
                />
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <ImageOff
              size={25 * effectiveScaleFactor}
              className="text-gray-400"
            />
          </div>
        )}
      </div>

      {/* Product Info and Quantity */}
      <div
        className="flex-1 flex flex-col justify-between"
        style={{
          padding: `${4 * effectiveScaleFactor}px`,
        }}
      >
        {/* Product Title (Brand + Name) */}
        <div className="flex items-start min-h-0 min-w-0 overflow-hidden">
          <span
            className="font-semibold text-blue-500 flex-shrink-0"
            style={{
              fontSize: `${14 * effectiveScaleFactor}px`,
              color: "#428cc9",
            }}
          >
            {brandModel}{" "}
          </span>
          <span
            className="font-semibold truncate flex-1 min-w-0"
            style={{
              fontSize: `${14 * effectiveScaleFactor}px`,
              color: textColor,
            }}
          >
            {productName}
          </span>
        </div>

        {/* Star Rating */}
        <div
          className="flex items-center"
          style={{ marginTop: `${2 * effectiveScaleFactor}px` }}
        >
          <StarRating rating={averageRating} size={12 * effectiveScaleFactor} />
          <span
            className="text-gray-500 ml-1"
            style={{ fontSize: `${10 * effectiveScaleFactor}px` }}
          >
            {averageRating.toFixed(1)}
          </span>
        </div>

        {/* Price and Quantity Row */}
        <div
          className="flex items-center justify-between"
          style={{ marginTop: `${4 * effectiveScaleFactor}px` }}
        >
          {/* Price Section */}
          <div className="flex items-center space-x-1">
            {originalPrice && discountPercentage && discountPercentage > 0 ? (
              <>
                <span
                  className="text-gray-500 line-through"
                  style={{ fontSize: `${12 * effectiveScaleFactor}px` }}
                >
                  {originalPrice.toFixed(0)} {currency}
                </span>
                <span
                  className="font-bold"
                  style={{
                    fontSize: `${12 * effectiveScaleFactor}px`,
                    color: jadeGreen,
                  }}
                >
                  {price.toFixed(0)} {currency}
                </span>
              </>
            ) : (
              <span
                className="font-bold"
                style={{
                  fontSize: `${12 * effectiveScaleFactor}px`,
                  color: priceColor,
                }}
              >
                {price.toFixed(0)} {currency}
              </span>
            )}
          </div>

          {/* Quantity/Stock Section */}
          {!hideStockInfo && (
            showQuantityLabelOnly ? (
              // Payment screen: show only quantity label
              <span
                className="text-orange-500 font-bold"
                style={{ fontSize: `${12 * effectiveScaleFactor}px` }}
              >
                ({quantity})
              </span>
            ) : canShowController ? (
              // Normal cart: show quantity controller
              <QuantityController />
            ) : (
              // No stock: show pink "No Stock" badge
              <div
                className="border border-pink-500 text-pink-500 font-semibold px-3 py-1 rounded-full"
                style={{
                  fontSize: `${12 * effectiveScaleFactor}px`,
                  borderRadius: `${20 * effectiveScaleFactor}px`,
                  paddingLeft: `${12 * effectiveScaleFactor}px`,
                  paddingRight: `${12 * effectiveScaleFactor}px`,
                  paddingTop: `${4 * effectiveScaleFactor}px`,
                  paddingBottom: `${4 * effectiveScaleFactor}px`,
                }}
              >
                {noStockText}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );

  // If overlay icons should be shown (favorite, cart icons)
  if (showOverlayIcons && productId) {
    return (
      <div className="relative">
        {cardContent}
        <div
          className="absolute flex items-center space-x-2"
          style={{
            bottom: `${4 * effectiveScaleFactor}px`,
            right: `${4 * effectiveScaleFactor}px`,
          }}
        >
          {/* Favorite Icon */}
          <button
            onClick={() => {
              onToggleFavorite?.();
              onFavoriteToggled?.();
            }}
            className="p-1"
          >
            <Heart
              size={16}
              className={
                isFavorited ? "fill-red-500 text-red-500" : "text-white"
              }
            />
          </button>

          {/* Cart Icon */}
          <button onClick={onAddToCart} className="p-1">
            <ShoppingCart
              size={16}
              className={isInCart ? "text-orange-500" : "text-white"}
            />
          </button>
        </div>
      </div>
    );
  }

  return cardContent;
};

// Demo component to show the card in action
const ProductCard3Demo = () => {
  const [quantity, setQuantity] = useState(2);
  const [isFavorited, setIsFavorited] = useState(false);
  const [isInCart, setIsInCart] = useState(true);

  const sampleProduct = {
    imageUrl:
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop",
    colorImages: {
      black: [
        "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=400&fit=crop",
      ],
      white: [
        "https://images.unsplash.com/photo-1484704849700-f032a568e944?w=400&h=400&fit=crop",
      ],
    },
    selectedColor: "black",
    productName: "Wireless Headphones Pro Max",
    brandModel: "AudioTech",
    price: 299.99,
    currency: "USD",
    averageRating: 4.5,
    originalPrice: 399.99,
    discountPercentage: 25,
    maxQuantityAllowed: 10,
    productId: "prod123",
  };

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="max-w-md mx-auto space-y-6">
        <h2 className="text-2xl font-bold text-center mb-8">
          ProductCard3 Demo
        </h2>

        {/* Regular Card */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">Regular Card</h3>
          <ProductCard3
            {...sampleProduct}
            quantity={quantity}
            onQuantityChanged={setQuantity}
            isFavorited={isFavorited}
            isInCart={isInCart}
          />
        </div>

        {/* Card with Overlay Icons */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">
            Card with Overlay Icons
          </h3>
          <ProductCard3
            {...sampleProduct}
            quantity={quantity}
            onQuantityChanged={setQuantity}
            showOverlayIcons={true}
            isFavorited={isFavorited}
            isInCart={isInCart}
            onToggleFavorite={() => setIsFavorited(!isFavorited)}
            onAddToCart={() => setIsInCart(!isInCart)}
          />
        </div>

        {/* Quantity Label Only */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">
            Payment Screen (Quantity Label Only)
          </h3>
          <ProductCard3
            {...sampleProduct}
            quantity={3}
            showQuantityLabelOnly={true}
          />
        </div>

        {/* No Stock */}
        <div className="bg-white rounded-lg shadow-md p-4">
          <h3 className="text-lg font-semibold mb-4">No Stock</h3>
          <ProductCard3
            {...sampleProduct}
            quantity={0}
            maxQuantityAllowed={0}
          />
        </div>
      </div>
    </div>
  );
};

export default ProductCard3Demo;
