"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { X, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCouponOptional } from "@/context/CouponProvider";
import { useUser } from "@/context/UserProvider";
import { Coupon } from "@/app/models/coupon";

// ============================================================================
// TYPES
// ============================================================================

interface CelebrationContextType {
  showCelebration: (coupon: Coupon) => void;
  checkAndShowCelebrations: () => void;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
  delay: number;
}

// ============================================================================
// CONTEXT
// ============================================================================

const CelebrationContext = createContext<CelebrationContextType | null>(null);

export const useCelebration = () => {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error("useCelebration must be used within CelebrationProvider");
  }
  return context;
};

// ============================================================================
// STORAGE HELPERS
// ============================================================================

const STORAGE_KEY_PREFIX = "coupon_celebration_ids_";

const getCelebratedIds = (userId: string): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch {
    return new Set();
  }
};

const setCelebratedIds = (userId: string, ids: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${userId}`,
      JSON.stringify([...ids])
    );
  } catch (e) {
    console.error("Failed to save celebrated IDs:", e);
  }
};

// ============================================================================
// PARTICLE GENERATOR
// ============================================================================

const generateParticles = (count: number): Particle[] => {
  const colors = [
    "rgba(249, 115, 22, 0.6)",
    "rgba(236, 72, 153, 0.6)",
    "rgba(250, 204, 21, 0.6)",
    "rgba(255, 255, 255, 0.4)",
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 6 + 2,
    speed: Math.random() * 15 + 10,
    color: colors[Math.floor(Math.random() * colors.length)],
    delay: Math.random() * 5,
  }));
};

// ============================================================================
// CELEBRATION OVERLAY COMPONENT
// ============================================================================

interface CelebrationOverlayProps {
  coupon: Coupon;
  onDismiss: () => void;
}

const CelebrationOverlay: React.FC<CelebrationOverlayProps> = ({
  coupon,
  onDismiss,
}) => {
  const t = useTranslations("coupons");
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [particles] = useState(() => generateParticles(20));

  useEffect(() => {
    requestAnimationFrame(() => {
      setIsVisible(true);
    });
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleDismiss = useCallback(() => {
    if (isExiting) return;
    setIsExiting(true);
    setIsVisible(false);
    setTimeout(() => {
      onDismiss();
    }, 400);
  }, [isExiting, onDismiss]);

  const couponAmount = coupon.amount?.toFixed(0) || "0";
  const couponCurrency = coupon.currency || "TL";

  const overlayVisibility = isVisible && !isExiting ? "opacity-100" : "opacity-0";
  const contentTransform = isVisible && !isExiting
    ? "translate-y-0 scale-100 opacity-100"
    : "translate-y-20 scale-75 opacity-0";
  const buttonTransform = isVisible && !isExiting
    ? "translate-y-0 opacity-100"
    : "-translate-y-4 opacity-0";

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center transition-opacity duration-400 ${overlayVisibility}`}
      onClick={handleDismiss}
    >
      {/* Dark overlay background */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-400 ${overlayVisibility}`}
      />

      {/* Floating particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute rounded-full"
            style={{
              left: `${particle.x}%`,
              bottom: "-10%",
              width: particle.size,
              height: particle.size,
              backgroundColor: particle.color,
              animation: `float-up ${particle.speed}s linear infinite`,
              animationDelay: `${particle.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleDismiss();
        }}
        className={`absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/20 border border-white/30 flex items-center justify-center hover:bg-white/30 transition-all duration-200 transform ${buttonTransform}`}
        style={{ transitionDelay: "200ms" }}
      >
        <X className="w-6 h-6 text-white" />
      </button>

      {/* Main content */}
      <div
        className={`relative z-10 flex flex-col items-center transform transition-all duration-500 ${contentTransform}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Coupon card with glow */}
        <div className="relative" style={{ animation: "pulse-slow 2s ease-in-out infinite" }}>
          {/* Glow effect */}
          <div
            className="absolute inset-0 rounded-3xl blur-3xl"
            style={{
              background: "linear-gradient(135deg, rgba(249, 115, 22, 0.4), rgba(236, 72, 153, 0.4))",
              transform: "scale(1.2)",
            }}
          />

          {/* Coupon card */}
          <div className="relative w-72 sm:w-80 rounded-3xl overflow-hidden bg-gradient-to-br from-orange-500 via-pink-500 to-rose-500 shadow-2xl" style={{ aspectRatio: "1.4 / 1" }}>
            {/* Shimmer overlay */}
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.4) 50%, transparent 60%)",
                animation: "shimmer 2s ease-in-out infinite",
              }}
            />

            {/* Decorative circles */}
            <div className="absolute -left-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10" />
            <div className="absolute -right-8 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10" />

            {/* Dashed line */}
            <div className="absolute left-1/2 top-4 bottom-4 w-px border-l-2 border-dashed border-white/30" />

            {/* Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
              {/* Icon */}
              <div className="mb-2">
                <Sparkles className="w-8 h-8 text-yellow-300 animate-bounce" />
              </div>

              {/* Amount */}
              <div className="text-white text-center">
                <span className="text-5xl sm:text-6xl font-black tracking-tight">
                  {couponAmount}
                </span>
                <span className="text-2xl sm:text-3xl font-bold ml-1">
                  {couponCurrency}
                </span>
              </div>

              {/* Label */}
              <div className="mt-2 px-4 py-1 bg-white/20 rounded-full">
                <span className="text-white text-sm font-semibold">
                  {t("discountCouponDesc") || "Discount Coupon"}
                </span>
              </div>

              {/* Expiry if exists */}
              {coupon.daysUntilExpiry !== null &&
                coupon.daysUntilExpiry !== undefined &&
                coupon.daysUntilExpiry <= 7 && (
                  <div className="mt-3 text-white/80 text-xs font-medium">
                    {coupon.daysUntilExpiry === 0
                      ? t("today") || "Expires today"
                      : `${coupon.daysUntilExpiry} ${t("days") || "days"} left`}
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Celebration text */}
        <div className="mt-8 text-center">
          <h2
            className="text-2xl sm:text-3xl font-extrabold bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(to right, #fb923c, #ec4899, #fb923c)",
              backgroundSize: "200% 200%",
              animation: "gradient-x 3s ease infinite",
            }}
          >
            🎉 {t("youHaveACoupon") || "You have a coupon!"}
          </h2>

          <p className="mt-3 text-white/90 text-sm sm:text-base font-medium max-w-xs">
            {t("couponWaitingForYou") || "A special discount is waiting for you in your cart!"}
          </p>
        </div>

        {/* CTA Button */}
        <button
          onClick={handleDismiss}
          className="mt-8 px-8 py-3 bg-white text-gray-900 rounded-full font-semibold hover:bg-gray-100 active:scale-95 transition-all duration-200 shadow-lg hover:shadow-xl"
        >
          {t("gotIt") || "Got it!"}
        </button>
      </div>

      {/* Global CSS for animations */}
      <style jsx global>{`
        @keyframes float-up {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-100vh) rotate(720deg);
            opacity: 0;
          }
        }

        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        @keyframes pulse-slow {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes gradient-x {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
      `}</style>
    </div>
  );
};

// ============================================================================
// CELEBRATION PROVIDER
// ============================================================================

interface CelebrationProviderProps {
  children: ReactNode;
}

export const CelebrationProvider: React.FC<CelebrationProviderProps> = ({
  children,
}) => {
  const { user } = useUser();
  const couponContext = useCouponOptional();
  const coupons = couponContext?.coupons ?? [];
  const isInitialized = couponContext?.isInitialized ?? false;
  const [, setCelebrationQueue] = useState<Coupon[]>([]);
  const [currentCoupon, setCurrentCoupon] = useState<Coupon | null>(null);
  const hasCheckedRef = useRef(false);

  const checkAndShowCelebrations = useCallback(() => {
    if (!user?.uid || !isInitialized || coupons.length === 0) return;

    const celebratedIds = getCelebratedIds(user.uid);
    const now = new Date();

    const newCoupons = coupons.filter((coupon) => {
      if (celebratedIds.has(coupon.id)) return false;
      if (coupon.isUsed) return false;
      if (coupon.expiresAt && coupon.expiresAt.toDate() < now) return false;
      return true;
    });

    if (newCoupons.length > 0) {
      setCelebrationQueue(newCoupons);
      setCurrentCoupon(newCoupons[0]);
    }
  }, [user?.uid, isInitialized, coupons]);

  useEffect(() => {
    if (!hasCheckedRef.current && isInitialized && user?.uid) {
      const timer = setTimeout(() => {
        checkAndShowCelebrations();
        hasCheckedRef.current = true;
      }, 1500);

      return () => clearTimeout(timer);
    }
  }, [isInitialized, user?.uid, checkAndShowCelebrations]);

  const handleDismiss = useCallback(() => {
    if (!currentCoupon || !user?.uid) return;

    const celebratedIds = getCelebratedIds(user.uid);
    celebratedIds.add(currentCoupon.id);
    setCelebratedIds(user.uid, celebratedIds);

    setCelebrationQueue((prev) => {
      const newQueue = prev.slice(1);
      if (newQueue.length > 0) {
        setTimeout(() => {
          setCurrentCoupon(newQueue[0]);
        }, 300);
      } else {
        setCurrentCoupon(null);
      }
      return newQueue;
    });
  }, [currentCoupon, user?.uid]);

  const showCelebration = useCallback((coupon: Coupon) => {
    setCurrentCoupon(coupon);
    setCelebrationQueue([coupon]);
  }, []);

  return (
    <CelebrationContext.Provider
      value={{ showCelebration, checkAndShowCelebrations }}
    >
      {children}
      {currentCoupon && (
        <CelebrationOverlay coupon={currentCoupon} onDismiss={handleDismiss} />
      )}
    </CelebrationContext.Provider>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export default CelebrationOverlay;

export const resetCelebrations = (userId: string) => {
  if (typeof window === "undefined") return;
  localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
  console.log(`🎟️ Reset coupon celebrations for user: ${userId}`);
};