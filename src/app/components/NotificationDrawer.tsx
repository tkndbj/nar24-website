"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  Bell,
  Trash2,
  RefreshCw,
  User,
  LogIn,
  TrendingUp,
  Truck,
  Store,
  Star,
  AlertCircle,
  HelpCircle,
  ShoppingBag,
  UserPlus,
  Megaphone,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import {
  collection,
  query,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  doc,
  deleteDoc,
  writeBatch,
  DocumentSnapshot,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

interface NotificationData {
  id: string;
  type: string;
  timestamp: Timestamp;
  isRead: boolean;
  message?: string;
  messageEn?: string;
  messageTr?: string;
  messageRu?: string;
  itemType?: string;
  productId?: string;
  shopId?: string;
  campaignName?: string;
  campaignDescription?: string;
  transactionId?: string;
  senderId?: string;
  sellerId?: string;
  inviterName?: string;
  shopName?: string;
  role?: string;
  status?: string;
  rejectionReason?: string;
  isShopProduct?: boolean;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
}) => {
  const router = useRouter();
  const { user } = useUser();

  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());

  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  const LIMIT = 20;

  // Animation control
  useEffect(() => {
    if (isOpen) {
      setShouldRender(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    // Check if it's mobile (you can adjust the breakpoint as needed)
    const isMobile = window.innerWidth < 768; // md breakpoint
    
    if (isMobile && isOpen) {
      // Disable scrolling when drawer is open
      document.body.style.overflow = 'hidden';
      // Prevent scrolling on iOS Safari
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
    } else if (isMobile) {
      // Re-enable scrolling when drawer is closed (only for mobile)
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
    }
  
    // Cleanup function to ensure scrolling is restored
    return () => {
      // Only cleanup if it was mobile when the effect ran
      const wasMobile = window.innerWidth < 768;
      if (wasMobile) {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
      }
    };
  }, [isOpen]);

  // Load more notifications function
  const loadMoreNotifications = useCallback(async () => {
    if (!hasMore || isLoadingMore || !user) return;

    setIsLoadingMore(true);

    try {
      const notificationsRef = collection(
        db,
        "users",
        user.uid,
        "notifications"
      );
      const q = query(
        notificationsRef,
        orderBy("timestamp", "desc"),
        startAfter(lastDoc),
        limit(LIMIT)
      );

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
          setHasMore(false);
          setIsLoadingMore(false);
          return;
        }

        const newNotifications: NotificationData[] = [];
        const unreadNotifications: DocumentSnapshot[] = [];

        snapshot.docs.forEach((doc) => {
          const data = doc.data();

          // Filter out message types and answered invitations
          if (data.type === "message") return;
          if (
            data.type === "shop_invitation" &&
            (data.status === "accepted" || data.status === "rejected")
          )
            return;

          const notification: NotificationData = {
            id: doc.id,
            type: data.type || "general",
            timestamp: data.timestamp || Timestamp.now(),
            isRead: data.isRead || false,
            message: data.message,
            messageEn: data.message_en,
            messageTr: data.message_tr,
            messageRu: data.message_ru,
            itemType: data.itemType,
            productId: data.productId,
            shopId: data.shopId,
            campaignName: data.campaignName,
            campaignDescription: data.campaignDescription,
            transactionId: data.transactionId,
            senderId: data.senderId,
            sellerId: data.sellerId,
            inviterName: data.inviterName,
            shopName: data.shopName,
            role: data.role,
            status: data.status,
            rejectionReason: data.rejectionReason,
            isShopProduct: data.isShopProduct,
          };

          newNotifications.push(notification);

          if (!notification.isRead) {
            unreadNotifications.push(doc);
          }
        });

        // Add new notifications to existing ones
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const uniqueNew = newNotifications.filter(
            (n) => !existingIds.has(n.id)
          );
          return [...prev, ...uniqueNew];
        });

        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
        setHasMore(snapshot.docs.length === LIMIT);

        // Mark unread notifications as read
        if (unreadNotifications.length > 0) {
          markNotificationsAsRead(unreadNotifications);
        }

        setIsLoadingMore(false);
        unsubscribe(); // Unsubscribe after getting the data
      });
    } catch (error) {
      console.error("Error loading more notifications:", error);
      setIsLoadingMore(false);
    }
  }, [user, hasMore, isLoadingMore, lastDoc]);

  // ✅ FIXED: Auto-scroll pagination with proper scroll detection
  useEffect(() => {
    const handleScroll = (e: Event) => {
      const target = e.target as HTMLDivElement;
      const { scrollTop, scrollHeight, clientHeight } = target;

      // Load more when user scrolls to bottom (with 50px threshold)
      const isNearBottom = scrollHeight - scrollTop <= clientHeight + 50;

      if (
        isNearBottom &&
        hasMore &&
        !isLoadingMore &&
        notifications.length > 0
      ) {
        console.log("Loading more notifications..."); // Debug log
        loadMoreNotifications();
      }
    };

    const scrollContainer = document.querySelector(
      ".notification-scroll-container"
    );
    if (scrollContainer && isOpen) {
      scrollContainer.addEventListener("scroll", handleScroll);
      return () => scrollContainer.removeEventListener("scroll", handleScroll);
    }
  }, [
    isOpen,
    hasMore,
    isLoadingMore,
    notifications.length,
    loadMoreNotifications,
  ]);

  // Get notification icon and color
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "shop_invitation":
        return { icon: UserPlus, color: "text-orange-500" };
      case "boosted":
      case "boost_expired":
        return { icon: TrendingUp, color: "text-green-500" };
      case "product_review_shop":
      case "product_review_user":
      case "seller_review_shop":
      case "seller_review_user":
        return { icon: Star, color: "text-yellow-500" };
      case "shipment":
        return { icon: Truck, color: "text-blue-500" };
      case "shop_approved":
        return { icon: Store, color: "text-green-500" };
      case "shop_disapproved":
        return { icon: Store, color: "text-red-500" };
      case "product_out_of_stock":
      case "product_out_of_stock_seller_panel":
        return { icon: AlertCircle, color: "text-orange-500" };
      case "campaign":
        return { icon: Megaphone, color: "text-purple-500" };
      case "product_sold_shop":
      case "product_sold_user":
        return { icon: ShoppingBag, color: "text-green-500" };
      case "product_question":
        return { icon: HelpCircle, color: "text-blue-500" };
      default:
        return { icon: Bell, color: "text-gray-500" };
    }
  };

  // Get notification title
  const getNotificationTitle = (type: string) => {
    switch (type) {
      case "product_sold_shop":
      case "product_sold_user":
        return "Ürün Satıldı";
      case "shop_invitation":
        return "Davet";
      case "boosted":
        return "Yükseltildi";
      case "boost_expired":
        return "Yükseltme Süresi Doldu";
      case "shipment":
        return "Kargo";
      case "shop_approved":
        return "Mağaza Onaylandı";
      case "shop_disapproved":
        return "Mağaza Reddedildi";
      case "product_review_shop":
      case "product_review_user":
        return "Ürün Yorumu";
      case "seller_review_shop":
      case "seller_review_user":
        return "Satıcı Yorumu";
      case "product_out_of_stock":
      case "product_out_of_stock_seller_panel":
        return "Stok Tükendi";
      case "campaign":
        return "Kampanya";
      case "product_question":
        return "Ürün Sorusu";
      default:
        return "Bildirim";
    }
  };

  // Format timestamp
  const formatTimestamp = (timestamp: Timestamp) => {
    const date = timestamp.toDate();
    const hour = date.getHours().toString().padStart(2, "0");
    const minute = date.getMinutes().toString().padStart(2, "0");
    return `${date.getDate()}/${
      date.getMonth() + 1
    }/${date.getFullYear()} ${hour}:${minute}`;
  };

  // Fetch notifications
  const fetchNotifications = useCallback(
    async (forceRefresh = false) => {
      if (!user) return;
      if (isLoading && !forceRefresh) return;

      if (forceRefresh) {
        setLastDoc(null);
        setHasMore(true);
        setNotifications([]);
      }

      setIsLoading(true);

      try {
        const notificationsRef = collection(
          db,
          "users",
          user.uid,
          "notifications"
        );
        let q = query(
          notificationsRef,
          orderBy("timestamp", "desc"),
          limit(LIMIT)
        );

        if (lastDoc && !forceRefresh) {
          q = query(
            notificationsRef,
            orderBy("timestamp", "desc"),
            startAfter(lastDoc),
            limit(LIMIT)
          );
        }

        const unsubscribe = onSnapshot(q, async (snapshot) => {
          if (snapshot.empty) {
            setHasMore(false);
            setIsLoading(false);
            return;
          }

          const newNotifications: NotificationData[] = [];
          const unreadNotifications: DocumentSnapshot[] = [];

          snapshot.docs.forEach((doc) => {
            const data = doc.data();

            // Filter out message types and answered invitations
            if (data.type === "message") return;
            if (
              data.type === "shop_invitation" &&
              (data.status === "accepted" || data.status === "rejected")
            )
              return;

            const notification: NotificationData = {
              id: doc.id,
              type: data.type || "general",
              timestamp: data.timestamp || Timestamp.now(),
              isRead: data.isRead || false,
              message: data.message,
              messageEn: data.message_en,
              messageTr: data.message_tr,
              messageRu: data.message_ru,
              itemType: data.itemType,
              productId: data.productId,
              shopId: data.shopId,
              campaignName: data.campaignName,
              campaignDescription: data.campaignDescription,
              transactionId: data.transactionId,
              senderId: data.senderId,
              sellerId: data.sellerId,
              inviterName: data.inviterName,
              shopName: data.shopName,
              role: data.role,
              status: data.status,
              rejectionReason: data.rejectionReason,
              isShopProduct: data.isShopProduct,
            };

            newNotifications.push(notification);

            if (!notification.isRead) {
              unreadNotifications.push(doc);
            }
          });

          if (forceRefresh) {
            setNotifications(newNotifications);
          } else {
            setNotifications((prev) => {
              const existingIds = new Set(prev.map((n) => n.id));
              const uniqueNew = newNotifications.filter(
                (n) => !existingIds.has(n.id)
              );
              return [...prev, ...uniqueNew];
            });
          }

          setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
          setHasMore(snapshot.docs.length === LIMIT);

          // Mark unread notifications as read
          if (unreadNotifications.length > 0) {
            markNotificationsAsRead(unreadNotifications);
          }

          setIsLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error fetching notifications:", error);
        setIsLoading(false);
      }
    },
    [user, isLoading, lastDoc]
  );

  // Mark notifications as read
  const markNotificationsAsRead = async (docs: DocumentSnapshot[]) => {
    if (!user || docs.length === 0) return;

    try {
      const batch = writeBatch(db);
      docs.forEach((doc) => {
        batch.update(doc.ref, { isRead: true });
      });
      await batch.commit();
    } catch (error) {
      console.error("Error marking notifications as read:", error);
    }
  };

  // Delete notification
  const deleteNotification = async (notificationId: string) => {
    if (!user) return;

    setDeletingItems((prev) => new Set(prev).add(notificationId));

    try {
      await deleteDoc(
        doc(db, "users", user.uid, "notifications", notificationId)
      );
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    } catch (error) {
      console.error("Error deleting notification:", error);
    } finally {
      setDeletingItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(notificationId);
        return newSet;
      });
    }
  };

  // Handle notification tap
  const handleNotificationTap = (notification: NotificationData) => {
    onClose();

    switch (notification.type) {
      case "boosted":
      case "boost_expired":
        if (notification.productId) {
          router.push(`/boost/${notification.productId}`);
        }
        break;
      case "product_edit_approved":
        if (notification.productId) {
          router.push(`/product/${notification.productId}`);
        }
        break;
      case "product_review":
        if (notification.productId) {
          router.push(`/product/${notification.productId}`);
        }
        break;
      case "shipment":
        if (notification.transactionId) {
          router.push(`/orders/${notification.transactionId}`);
        }
        break;
      case "shop_approved":
        if (notification.shopId) {
          router.push(`/seller-panel?shopId=${notification.shopId}`);
        }
        break;
      case "product_sold_user":
        router.push("/my-orders?tab=1");
        break;
      default:
        break;
    }
  };

  // Initialize notifications when drawer opens
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    if (isOpen && user) {
      const initNotifications = async () => {
        unsubscribe = await fetchNotifications(true);
      };
      initNotifications();
    }

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isOpen, user]);

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!shouldRender) return null;

  return (
    <div className="fixed inset-0 z-[1000] overflow-hidden">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isAnimating ? "opacity-100" : "opacity-0"
        }`}
        onClick={handleBackdropClick}
      />

      {/* ✅ FIXED: Drawer with proper height constraints */}
      <div
        className={`
          absolute right-0 top-0 h-full w-full max-w-md transform transition-transform duration-300 ease-out
          ${isDarkMode ? "bg-gray-900" : "bg-white"}
          shadow-2xl flex flex-col
          ${isAnimating ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div
          className={`
            flex-shrink-0 border-b px-6 py-4
            ${
              isDarkMode
                ? "bg-gray-900 border-gray-700"
                : "bg-white border-gray-200"
            }
            backdrop-blur-xl bg-opacity-95
          `}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div
                className={`
                  p-2 rounded-full
                  ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                `}
              >
                <Bell
                  size={20}
                  className={isDarkMode ? "text-gray-300" : "text-gray-700"}
                />
              </div>
              <div>
                <h2
                  className={`
                    text-lg font-bold
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  Bildirimler
                </h2>
                {user && notifications.length > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {notifications.length} bildirim
                  </p>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className={`
                p-2 rounded-full transition-colors duration-200
                ${
                  isDarkMode
                    ? "hover:bg-gray-800 text-gray-400 hover:text-white"
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                }
              `}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ✅ FIXED: Content with proper flex and overflow */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto notification-scroll-container">
            {/* Not Authenticated State */}
            {!user ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center mb-6
                    ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                  `}
                >
                  <User
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
                <h3
                  className={`
                    text-xl font-bold mb-3 text-center
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  Giriş Yapın
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  Bildirimlerinizi görüntülemek için lütfen giriş yapın.
                </p>
                <button
                  onClick={() => {
                    onClose();
                    router.push("/login");
                  }}
                  className="
                    flex items-center space-x-2 px-6 py-3 rounded-full
                    bg-gradient-to-r from-orange-500 to-pink-500 text-white
                    hover:from-orange-600 hover:to-pink-600
                    transition-all duration-200 shadow-lg hover:shadow-xl
                    active:scale-95
                  "
                >
                  <LogIn size={18} />
                  <span className="font-medium">Giriş Yap</span>
                </button>
              </div>
            ) : /* Loading State */ isLoading && notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div className="animate-spin w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full mb-4"></div>
                <p
                  className={`
                    text-center
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  Bildirimleriniz yükleniyor...
                </p>
              </div>
            ) : /* Empty Notifications State */ notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full px-6 py-12">
                <div
                  className={`
                    w-20 h-20 rounded-full flex items-center justify-center mb-6
                    ${isDarkMode ? "bg-gray-800" : "bg-gray-100"}
                  `}
                >
                  <Bell
                    size={32}
                    className={isDarkMode ? "text-gray-400" : "text-gray-500"}
                  />
                </div>
                <h3
                  className={`
                    text-xl font-bold mb-3 text-center
                    ${isDarkMode ? "text-white" : "text-gray-900"}
                  `}
                >
                  Bildirim Yok
                </h3>
                <p
                  className={`
                    text-center leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  Henüz hiç bildiriminiz bulunmuyor.
                </p>
              </div>
            ) : (
              /* Notifications List */
              <div className="px-4 py-4">
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const { icon: IconComponent, color } = getNotificationIcon(
                      notification.type
                    );
                    const isDeleting = deletingItems.has(notification.id);
                    const message =
                      notification.messageTr || notification.message || "";

                    return (
                      <div
                        key={notification.id}
                        className={`
                          transition-all duration-300 transform
                          ${
                            isDeleting
                              ? "opacity-50 scale-95"
                              : "opacity-100 scale-100"
                          }
                        `}
                      >
                        <div
                          className={`
                            rounded-xl border p-4 transition-all duration-200 cursor-pointer
                            ${
                              isDarkMode
                                ? "bg-gray-800 border-gray-700 hover:border-gray-600"
                                : "bg-gray-50 border-gray-200 hover:border-gray-300"
                            }
                          `}
                          onClick={() => handleNotificationTap(notification)}
                        >
                          <div className="flex items-start space-x-3">
                            <div className="flex-shrink-0 mt-1">
                              <IconComponent size={20} className={color} />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-1">
                                <h4 className="text-sm font-bold text-orange-500">
                                  {notification.type === "campaign"
                                    ? notification.campaignName ||
                                      getNotificationTitle(notification.type)
                                    : getNotificationTitle(notification.type)}
                                </h4>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteNotification(notification.id);
                                  }}
                                  disabled={isDeleting}
                                  className={`
                                    p-1 rounded transition-colors duration-200
                                    ${
                                      isDarkMode
                                        ? "text-gray-400 hover:text-red-400 hover:bg-red-900/20"
                                        : "text-gray-400 hover:text-red-500 hover:bg-red-50"
                                    }
                                    ${
                                      isDeleting
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                    }
                                  `}
                                >
                                  {isDeleting ? (
                                    <RefreshCw
                                      size={14}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                </button>
                              </div>

                              <p
                                className={`
                                  text-sm mb-2
                                  ${
                                    isDarkMode
                                      ? "text-gray-300"
                                      : "text-gray-700"
                                  }
                                `}
                              >
                                {notification.type === "campaign"
                                  ? notification.campaignDescription || message
                                  : message}
                              </p>

                              <p
                                className={`
                                  text-xs
                                  ${
                                    isDarkMode
                                      ? "text-gray-500"
                                      : "text-gray-500"
                                  }
                                `}
                              >
                                {formatTimestamp(notification.timestamp)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Auto-load indicator - shows when loading more */}
                  {isLoadingMore && (
                    <div className="flex justify-center py-6">
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Daha fazla bildirim yükleniyor...</span>
                      </div>
                    </div>
                  )}

                  {/* End of list indicator */}
                  {!hasMore && notifications.length > 0 && (
                    <div className="flex justify-center py-6">
                      <p
                        className={`text-sm ${
                          isDarkMode ? "text-gray-400" : "text-gray-500"
                        }`}
                      >
                        Tüm bildirimler yüklendi
                      </p>
                    </div>
                  )}

                  {/* ✅ FIXED: Manual Load More Button with proper spacing */}
                  {hasMore &&
                    !isLoadingMore &&
                    notifications.length >= LIMIT && (
                      <div className="flex justify-center pt-6 pb-4">
                        <button
                          onClick={loadMoreNotifications}
                          className={`
                          px-6 py-3 rounded-lg text-sm font-medium transition-colors duration-200
                          ${
                            isDarkMode
                              ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                          }
                        `}
                        >
                          Daha Fazla Göster
                        </button>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
