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
  Star,
  AlertCircle,
  HelpCircle,
  ShoppingCart,
  UserPlus,
  Megaphone,
  Archive,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Tag,
  UtensilsCrossed,
  ShieldCheck,
  ShieldAlert,
  Banknote,
  Hourglass,
} from "lucide-react";
import { useUser } from "@/context/UserProvider";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
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
import { httpsCallable, getFunctions } from "firebase/functions";
import { db } from "@/lib/firebase";
import { trackReads, trackWrites } from "@/lib/firestore-read-tracker";

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
  productName?: string;
  shopId?: string;
  shopName?: string;
  campaignName?: string;
  campaignDescription?: string;
  transactionId?: string;
  senderId?: string;
  sellerId?: string;
  inviterName?: string;
  invitationId?: string;
  businessType?: string;
  role?: string;
  status?: string;
  rejectionReason?: string;
  isShopProduct?: boolean;
  restaurantName?: string;
  orderStatus?: string;
  orderId?: string;
  // boost_expired carries a `reason` ("admin_archived", "seller_archived" or
  // anything else for the generic message) plus an optional productName.
  reason?: string;
  // product_archived_by_admin carries these three:
  needsUpdate?: boolean;
  archiveReason?: string;
  boostExpired?: boolean;
  // product_question carries the asker's name for the title body.
  askerName?: string;
}

interface NotificationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode?: boolean;
}

// Parse a Firestore notification doc into our local shape. Mirrors the
// fields read by Flutter's NotificationModel.fromFirestore — kept in one
// place so initial-load and load-more paths can't drift.
function parseNotificationDoc(
  docId: string,
  data: Record<string, unknown>,
): NotificationData {
  const payload = (data.payload as Record<string, unknown> | undefined) ?? {};
  const pick = <T,>(...candidates: unknown[]): T | undefined => {
    for (const c of candidates) {
      if (c !== undefined && c !== null) return c as T;
    }
    return undefined;
  };

  return {
    id: docId,
    type: (data.type as string) || "general",
    timestamp: (data.timestamp as Timestamp) || Timestamp.now(),
    isRead: (data.isRead as boolean) || false,
    message: data.message as string | undefined,
    messageEn: data.message_en as string | undefined,
    messageTr: data.message_tr as string | undefined,
    messageRu: data.message_ru as string | undefined,
    itemType: data.itemType as string | undefined,
    productId: data.productId as string | undefined,
    productName: data.productName as string | undefined,
    shopId: data.shopId as string | undefined,
    shopName: data.shopName as string | undefined,
    campaignName: data.campaignName as string | undefined,
    campaignDescription: data.campaignDescription as string | undefined,
    transactionId: data.transactionId as string | undefined,
    senderId: data.senderId as string | undefined,
    sellerId: data.sellerId as string | undefined,
    inviterName: data.inviterName as string | undefined,
    invitationId: data.invitationId as string | undefined,
    businessType: data.businessType as string | undefined,
    role: data.role as string | undefined,
    status: data.status as string | undefined,
    rejectionReason: data.rejectionReason as string | undefined,
    isShopProduct: data.isShopProduct as boolean | undefined,
    restaurantName: pick<string>(payload.restaurantName, data.restaurantName),
    orderStatus: pick<string>(payload.orderStatus, data.orderStatus),
    orderId: pick<string>(payload.orderId, data.orderId),
    reason: data.reason as string | undefined,
    needsUpdate: data.needsUpdate as boolean | undefined,
    archiveReason: data.archiveReason as string | undefined,
    boostExpired: data.boostExpired as boolean | undefined,
    askerName: data.askerName as string | undefined,
  };
}

export const NotificationDrawer: React.FC<NotificationDrawerProps> = ({
  isOpen,
  onClose,
  isDarkMode = false,
}) => {
  const router = useRouter();
  const { user } = useUser();
  const t = useTranslations("NotificationDrawer");
  const locale = useLocale();

  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [deletingItems, setDeletingItems] = useState<Set<string>>(new Set());

  const [isAnimating, setIsAnimating] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Modal state — different notification types open one of these
  // dialogs instead of (or before) navigating. Mirrors the
  // showDialog branches in notification_screen.dart.
  type DetailModal =
    | { kind: "refundApproved"; notification: NotificationData }
    | { kind: "refundRejected"; notification: NotificationData }
    | { kind: "editRejected"; notification: NotificationData }
    | { kind: "shopDisapproved"; notification: NotificationData }
    | {
        kind: "invitationDecision";
        notification: NotificationData;
      }
    | {
        kind: "invitationProcessing";
        entityName: string;
        isRestaurant: boolean;
      }
    | { kind: "toast"; message: string };
  const [detailModal, setDetailModal] = useState<DetailModal | null>(null);

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
      document.body.style.overflow = "hidden";
      // Prevent scrolling on iOS Safari
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
    } else if (isMobile) {
      // Re-enable scrolling when drawer is closed (only for mobile)
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
    }

    // Cleanup function to ensure scrolling is restored
    return () => {
      // Only cleanup if it was mobile when the effect ran
      const wasMobile = window.innerWidth < 768;
      if (wasMobile) {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
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
        "notifications",
      );
      const q = query(
        notificationsRef,
        orderBy("timestamp", "desc"),
        startAfter(lastDoc),
        limit(LIMIT),
      );

      const unsubscribe = onSnapshot(q, async (snapshot) => {
        // Mirror Flutter NotificationScreen: count billable doc changes per
        // event, skip cache replays.
        if (!snapshot.metadata.fromCache) {
          const billable = snapshot.docChanges().length || snapshot.docs.length;
          if (billable > 0) {
            trackReads(
              `notification_drawer:notifications (page, limit: ${LIMIT})`,
              billable,
            );
          }
        }
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

          const notification: NotificationData = parseNotificationDoc(
            doc.id,
            data,
          );

          newNotifications.push(notification);

          if (!notification.isRead) {
            unreadNotifications.push(doc);
          }
        });

        // Add new notifications to existing ones
        setNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id));
          const uniqueNew = newNotifications.filter(
            (n) => !existingIds.has(n.id),
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
      ".notification-scroll-container",
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

  // Get notification icon and color — kept in sync with Flutter's
  // notification_screen.dart switch around line 1356.
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "shop_invitation":
      case "restaurant_invitation":
        return { icon: UserPlus, color: "text-orange-500" };
      case "boosted":
      case "boost_expired":
        return { icon: TrendingUp, color: "text-green-500" };
      case "order_delivered":
        return { icon: Truck, color: "text-green-500" };
      case "food_order_status_update":
        return { icon: UtensilsCrossed, color: "text-orange-500" };
      case "food_order_delivered_review":
        return { icon: Star, color: "text-amber-500" };
      case "market_order_status_update":
        return { icon: ShoppingCart, color: "text-blue-500" };
      case "market_order_delivered_review":
        return { icon: Star, color: "text-blue-400" };
      case "product_archived_by_admin":
        return { icon: Archive, color: "text-red-500" };
      case "product_review":
      case "product_review_shop":
      case "product_review_user":
      case "seller_review_shop":
      case "seller_review_user":
      case "seller_review":
        return { icon: Star, color: "text-yellow-500" };
      case "shipment":
        return { icon: Truck, color: "text-green-500" };
      case "product_question_answered":
        return { icon: MessageSquare, color: "text-green-500" };
      case "shop_approved":
        return { icon: ShieldCheck, color: "text-green-500" };
      case "shop_disapproved":
        return { icon: ShieldAlert, color: "text-red-500" };
      case "product_out_of_stock":
      case "product_out_of_stock_seller_panel":
        return { icon: AlertCircle, color: "text-orange-500" };
      case "ad_approved":
      case "campaign":
        return { icon: Megaphone, color: "text-purple-500" };
      case "product_sold_shop":
      case "product_sold_user":
        return { icon: Tag, color: "text-green-500" };
      case "product_question":
        return { icon: HelpCircle, color: "text-blue-500" };
      case "refund_request_approved":
        return { icon: CheckCircle2, color: "text-green-500" };
      case "refund_request_rejected":
        return { icon: XCircle, color: "text-red-500" };
      case "product_edit_approved":
        return { icon: CheckCircle2, color: "text-green-500" };
      case "product_edit_rejected":
        return { icon: XCircle, color: "text-red-500" };
      case "payment_completed_after_retry":
        return { icon: CheckCircle2, color: "text-green-500" };
      case "payment_refunded_order_failed":
        return { icon: Banknote, color: "text-amber-500" };
      case "payment_under_review":
        return { icon: Hourglass, color: "text-amber-500" };
      case "boost_completed_after_retry":
        return { icon: TrendingUp, color: "text-green-500" };
      case "boost_refunded_failed":
        return { icon: Banknote, color: "text-amber-500" };
      case "boost_under_review":
        return { icon: Hourglass, color: "text-amber-500" };
      case "ad_completed_after_retry":
        return { icon: Megaphone, color: "text-green-500" };
      case "ad_refunded_failed":
        return { icon: Banknote, color: "text-amber-500" };
      case "ad_under_review":
        return { icon: Hourglass, color: "text-amber-500" };
      case "food_completed_after_retry":
        return { icon: UtensilsCrossed, color: "text-green-500" };
      case "food_refunded_failed":
        return { icon: Banknote, color: "text-amber-500" };
      case "food_under_review":
        return { icon: Hourglass, color: "text-amber-500" };
      default:
        return { icon: Bell, color: "text-orange-500" };
    }
  };

  // Get notification title — every type maps to a translatable key.
  // For unknown types we fall through to the generic "Notification"
  // label rather than leaving the field blank.
  const getNotificationTitle = (notification: NotificationData): string => {
    const type = notification.type;
    // Campaign: prefer the seller-supplied campaign name as the title
    // (matches Flutter's row at line 1524). Falls back to the localized
    // "Campaign" label if absent.
    if (type === "campaign") {
      return notification.campaignName || t("campaign.title");
    }

    const titleKeys: Record<string, string> = {
      shop_invitation: "shopInvitation.title",
      restaurant_invitation: "restaurantInvitation.title",
      boosted: "boosted.title",
      boost_expired: "boost_expired.title",
      order_delivered: "order_delivered.title",
      food_order_status_update: "food_order_status_update.title",
      food_order_delivered_review: "food_order_delivered_review.title",
      market_order_status_update: "market_order_status_update.title",
      market_order_delivered_review: "market_order_delivered_review.title",
      product_archived_by_admin: "product_archived_by_admin.title",
      shipment: "shipment.title",
      shop_approved: "shop_approved.title",
      shop_disapproved: "shop_disapproved.title",
      product_review: "product_review.title",
      product_review_shop: "product_review_shop.title",
      product_review_user: "product_review_user.title",
      seller_review_shop: "seller_review_shop.title",
      seller_review_user: "seller_review_user.title",
      seller_review: "seller_review_user.title",
      product_question_answered: "product_question_answered.title",
      product_question: "product_question.title",
      product_edit_approved: "product_edit_approved.title",
      product_edit_rejected: "product_edit_rejected.title",
      product_out_of_stock: "product_out_of_stock.title",
      product_out_of_stock_seller_panel:
        "product_out_of_stock_seller_panel.title",
      product_sold_shop: "product_sold_shop.title",
      product_sold_user: "product_sold_user.title",
      refund_request_approved: "refund_request_approved.title",
      refund_request_rejected: "refund_request_rejected.title",
      ad_approved: "ad_approved.title",
      payment_completed_after_retry: "payment_completed_after_retry.title",
      payment_refunded_order_failed: "payment_refunded_order_failed.title",
      payment_under_review: "payment_under_review.title",
      boost_completed_after_retry: "boost_completed_after_retry.title",
      boost_refunded_failed: "boost_refunded_failed.title",
      boost_under_review: "boost_under_review.title",
      ad_completed_after_retry: "ad_completed_after_retry.title",
      ad_refunded_failed: "ad_refunded_failed.title",
      ad_under_review: "ad_under_review.title",
      food_completed_after_retry: "food_completed_after_retry.title",
      food_refunded_failed: "food_refunded_failed.title",
      food_under_review: "food_under_review.title",
    };

    const key = titleKeys[type];
    return key ? t(key) : t("fallbackTitle");
  };

  // Get notification body. For types where we localize on the client
  // (boost_expired variants, food/market status updates, archived-by-admin,
  // invitations, shop approval, etc.) we synthesize a message from fields
  // on the doc — same as Flutter's switch around line 1251. For everything
  // else we fall through to the server-localized message_{en,tr,ru} fields.
  const getNotificationMessage = (notification: NotificationData): string => {
    switch (notification.type) {
      case "shop_invitation":
        return t("shopInvitation.body", {
          inviterName: notification.inviterName ?? "",
          shopName: notification.shopName ?? "",
        });

      case "restaurant_invitation":
        return t("restaurantInvitation.body", {
          inviterName: notification.inviterName ?? "",
          shopName: notification.shopName ?? "",
        });

      case "boost_expired": {
        const productName = notification.productName ?? "";
        const reason = notification.reason ?? "";
        if (reason === "admin_archived") {
          return t("boost_expired.adminArchived", { productName });
        }
        if (reason === "seller_archived") {
          return t("boost_expired.sellerArchived", { productName });
        }
        return t("boost_expired.generic", { productName });
      }

      case "product_archived_by_admin": {
        const productName = notification.productName ?? "";
        const reason = notification.archiveReason ?? "";
        const needsUpdate = notification.needsUpdate ?? false;
        const base =
          needsUpdate && reason
            ? t("product_archived_by_admin.needsUpdate", {
                productName,
                reason,
              })
            : t("product_archived_by_admin.simple", { productName });
        return notification.boostExpired
          ? `${base} ${t("product_archived_by_admin.boostNote")}`
          : base;
      }

      case "food_order_delivered_review":
        return t("food_order_delivered_review.body", {
          restaurantName: notification.restaurantName ?? "",
        });

      case "food_order_status_update": {
        // Only show a body if the orderStatus is one we have a string for.
        // Flutter falls back to the bare restaurant name for unknown
        // statuses; we mirror that.
        const valid = [
          "accepted",
          "rejected",
          "preparing",
          "ready",
          "out_for_delivery",
          "delivered",
        ];
        const status = notification.orderStatus ?? "";
        if (valid.includes(status)) {
          return t(`food_order_status_update.${status}`, {
            restaurantName: notification.restaurantName ?? "",
          });
        }
        return notification.restaurantName ?? "";
      }

      case "market_order_status_update":
        switch (notification.orderStatus) {
          case "out_for_delivery":
            return t("market_order_status_update.out_for_delivery");
          case "delivered":
            return t("market_order_status_update.delivered");
          default:
            return "";
        }

      case "market_order_delivered_review":
        return t("market_order_delivered_review.body");

      case "shop_approved":
        return notification.message || t("shop_approved.body");
      case "shop_disapproved":
        return notification.message || t("shop_disapproved.body");
      case "refund_request_approved":
        return notification.message || t("refund_request_approved.body");
      case "refund_request_rejected":
        return notification.message || t("refund_request_rejected.body");
      case "product_edit_approved":
        return notification.message || t("product_edit_approved.body");
      case "product_edit_rejected":
        return notification.message || t("product_edit_rejected.body");
      case "product_question_answered":
        return notification.message || t("product_question_answered.body");
      case "product_question":
        if (notification.askerName) {
          return t("product_question.body", {
            askerName: notification.askerName,
          });
        }
        return notification.message ?? "";

      case "campaign":
        return notification.campaignDescription || notification.message || "";

      // Payment notifications written by the order-retry pipeline. The CF
      // only stores `type` + `payload` (no message_{en,tr,ru} fields), so
      // we render entirely from local i18n. See product-payment CF
      // notifyBuyer().
      case "payment_completed_after_retry":
        return t("payment_completed_after_retry.body");
      case "payment_refunded_order_failed":
        return t("payment_refunded_order_failed.body");
      case "payment_under_review":
        return t("payment_under_review.body");

      case "boost_completed_after_retry":
        return t("boost_completed_after_retry.body");
      case "boost_refunded_failed":
        return t("boost_refunded_failed.body");
      case "boost_under_review":
        return t("boost_under_review.body");

      case "ad_completed_after_retry":
        return t("ad_completed_after_retry.body");
      case "ad_refunded_failed":
        return t("ad_refunded_failed.body");
      case "ad_under_review":
        return t("ad_under_review.body");

      case "food_completed_after_retry":
        return t("food_completed_after_retry.body");
      case "food_refunded_failed":
        return t("food_refunded_failed.body");
      case "food_under_review":
        return t("food_under_review.body");

      default: {
        if (locale === "tr") {
          return notification.messageTr || notification.message || "";
        }
        if (locale === "ru") {
          return notification.messageRu || notification.message || "";
        }
        return notification.messageEn || notification.message || "";
      }
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
          "notifications",
        );
        let q = query(
          notificationsRef,
          orderBy("timestamp", "desc"),
          limit(LIMIT),
        );

        if (lastDoc && !forceRefresh) {
          q = query(
            notificationsRef,
            orderBy("timestamp", "desc"),
            startAfter(lastDoc),
            limit(LIMIT),
          );
        }

        const unsubscribe = onSnapshot(q, async (snapshot) => {
          if (!snapshot.metadata.fromCache) {
            const billable = snapshot.docChanges().length || snapshot.docs.length;
            if (billable > 0) {
              trackReads(
                `notification_drawer:notifications (initial, limit: ${LIMIT})`,
                billable,
              );
            }
          }
          if (snapshot.empty) {
            setHasMore(false);
            setIsLoading(false);
            return;
          }

          const newNotifications: NotificationData[] = [];
          const unreadNotifications: DocumentSnapshot[] = [];

          snapshot.docs.forEach((doc) => {
            const data = doc.data();

            // Filter out message types and already-actioned invitations.
            // Mirrors notification_screen.dart: shop_invitation and
            // restaurant_invitation rows are dropped once status is
            // accepted/rejected/cancelled — keeps the drawer from
            // showing dead invitations after a CF response.
            if (data.type === "message") return;
            if (
              (data.type === "shop_invitation" ||
                data.type === "restaurant_invitation") &&
              (data.status === "accepted" ||
                data.status === "rejected" ||
                data.status === "cancelled")
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
              restaurantName:
                data.payload?.restaurantName ?? data.restaurantName,
              orderStatus: data.payload?.orderStatus ?? data.orderStatus,
              orderId: data.payload?.orderId ?? data.orderId,
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
                (n) => !existingIds.has(n.id),
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
    [user, isLoading, lastDoc],
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
      trackWrites("notification_drawer:mark notifications read", docs.length);
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
        doc(db, "users", user.uid, "notifications", notificationId),
      );
      trackWrites("notification_drawer:delete notification", 1);
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

  // Handle notification tap. Mirrors notification_screen.dart's switch
  // around line 457, but routes target the website's actual paths
  // (which differ from Flutter's go_router routes — see comments inline).
  // Types that are seller-panel-only on Flutter (product_review_shop,
  // seller_review_shop, product_sold_shop, product_out_of_stock_seller_panel,
  // product_question for shops, shop_approved, campaign-as-seller) don't
  // have a corresponding consumer-website screen, so we just close the
  // drawer and let the user read the body. Marking-as-read still happens.
  const handleNotificationTap = (notification: NotificationData) => {
    const type = notification.type;

    // Modal-only types — open the dialog without closing the drawer.
    if (type === "refund_request_approved") {
      setDetailModal({ kind: "refundApproved", notification });
      return;
    }
    if (type === "refund_request_rejected") {
      setDetailModal({ kind: "refundRejected", notification });
      return;
    }
    if (type === "product_edit_rejected") {
      setDetailModal({ kind: "editRejected", notification });
      return;
    }
    if (type === "shop_disapproved") {
      setDetailModal({ kind: "shopDisapproved", notification });
      return;
    }
    if (type === "shop_invitation" || type === "restaurant_invitation") {
      setDetailModal({ kind: "invitationDecision", notification });
      return;
    }

    // Navigation types — close drawer, then push.
    switch (type) {
      case "boosted": {
        const productId = notification.productId;
        if (productId) {
          onClose();
          router.push(`/boost?productId=${productId}`);
        }
        break;
      }

      case "boost_expired": {
        onClose();
        router.push("/boostanalysis?tab=past");
        break;
      }

      case "food_order_status_update":
        onClose();
        router.push("/food-orders");
        break;

      case "food_order_delivered_review":
        onClose();
        router.push("/reviews");
        break;

      case "market_order_status_update":
        onClose();
        router.push("/market-orders");
        break;

      case "market_order_delivered_review":
        // Flutter routes to /my-reviews when an orderId is present,
        // otherwise to /my-market-orders. The web equivalent is
        // /reviews and /market-orders respectively.
        onClose();
        router.push(notification.orderId ? "/reviews" : "/market-orders");
        break;

      case "order_delivered":
        onClose();
        router.push("/reviews");
        break;

      case "product_archived_by_admin":
        onClose();
        router.push("/archived");
        break;

      case "product_question_answered":
        onClose();
        router.push("/productquestions");
        break;

      case "product_edit_approved": {
        const productId = notification.productId;
        if (productId) {
          onClose();
          router.push(`/productdetail/${productId}`);
        } else {
          setDetailModal({
            kind: "toast",
            message: t("errorGeneric"),
          });
        }
        break;
      }

      case "product_review":
      case "product_review_user": {
        const productId = notification.productId;
        if (productId) {
          onClose();
          router.push(`/productdetail/${productId}`);
        }
        break;
      }

      case "seller_review_user": {
        const sellerId = notification.sellerId;
        if (sellerId) {
          onClose();
          router.push(`/user-profile/${sellerId}`);
        }
        break;
      }

      case "product_out_of_stock": {
        const productId = notification.productId;
        if (productId) {
          onClose();
          router.push(`/productdetail/${productId}`);
        }
        break;
      }

      case "shipment":
        // Flutter opens ShipmentStatusScreen(orderId: transactionId).
        // The website doesn't have a per-order detail page yet, so we
        // route to the orders list and let the user pick.
        onClose();
        router.push("/orders");
        break;

      case "product_sold_user":
        // Flutter: /my_orders?tab=1. Web has /orders.
        onClose();
        router.push("/orders?tab=1");
        break;

      case "payment_completed_after_retry":
      case "payment_refunded_order_failed":
        // Flutter routes both to /my_orders (success → see new order; refund
        // → confirm no charge and re-checkout from cart).
        onClose();
        router.push("/orders");
        break;

      case "payment_under_review":
        // Informational only — ops is already on it. Mirrors Flutter's
        // no-op tap handler.
        onClose();
        break;

      case "boost_completed_after_retry":
      case "boost_refunded_failed":
        // Both route to the boost analysis page. Success → user sees the
        // newly-active boost; refund → user can re-attempt the boost.
        onClose();
        router.push("/boostanalysis");
        break;

      case "boost_under_review":
        // Informational only — ops handling. No nav.
        onClose();
        break;

      case "ad_completed_after_retry":
      case "ad_refunded_failed":
      case "ad_under_review":
        // Ad notifications — no navigation. The seller-side ads view
        // requires shop context that isn't carried in the notification.
        // Just close the drawer.
        onClose();
        break;

      case "food_completed_after_retry":
      case "food_refunded_failed":
        // Both route to the buyer's food order list.
        onClose();
        router.push("/food-orders");
        break;

      case "food_under_review":
        // Informational only — ops handling. No nav.
        onClose();
        break;

      case "product_question": {
        // Buyer side only — questions about products you own as a
        // shop seller go to the seller panel which the consumer site
        // doesn't have. For asks-on-your-personal-products we send
        // them to the product questions page.
        if (notification.isShopProduct) {
          // No-op on consumer site.
          break;
        }
        onClose();
        router.push("/productquestions");
        break;
      }

      // Seller-only types: close the drawer but don't navigate.
      case "shop_approved":
      case "campaign":
      case "ad_approved":
      case "product_sold_shop":
      case "product_review_shop":
      case "seller_review_shop":
      case "seller_review":
      case "product_out_of_stock_seller_panel":
      default:
        // Close the drawer; the read-mark already happened on render.
        onClose();
        break;
    }
  };

  // Accept / reject a shop or restaurant invitation. Mirrors Flutter's
  // _handleInvitationResponse — calls the same `handleShopInvitation`
  // callable in europe-west3 with {invitationId, accepted, shopId, role}.
  // On accept we force-refresh the auth token so any new shopId claim
  // applied server-side is picked up immediately.
  const handleInvitationResponse = useCallback(
    async (notification: NotificationData, accepted: boolean) => {
      const isRestaurant = notification.businessType === "restaurant";
      const entityName = notification.shopName ?? "";

      if (accepted) {
        setDetailModal({
          kind: "invitationProcessing",
          entityName,
          isRestaurant,
        });
      }

      try {
        const callable = httpsCallable<
          {
            invitationId?: string;
            accepted: boolean;
            shopId?: string;
            role?: string;
          },
          { shouldRefreshToken?: boolean }
        >(getFunctions(undefined, "europe-west3"), "handleShopInvitation");

        const result = await callable({
          invitationId: notification.invitationId,
          accepted,
          shopId: notification.shopId,
          role: notification.role,
        });

        if (accepted) {
          if (result.data?.shouldRefreshToken) {
            await user?.getIdToken(true);
          }
          // The notification doc gets status=accepted by the CF; remove
          // it from the local list so the user sees an immediate state
          // change rather than waiting for the snapshot to re-emit.
          setNotifications((prev) =>
            prev.filter((n) => n.id !== notification.id),
          );
          setDetailModal(null);
          onClose();
        } else {
          setNotifications((prev) =>
            prev.filter((n) => n.id !== notification.id),
          );
          setDetailModal({
            kind: "toast",
            message: t("invitationRejected"),
          });
        }
      } catch (err: unknown) {
        // The CF returns not-found / failed-precondition when the
        // invitation has already been actioned (e.g. on another device).
        // Treat that as a no-op success: drop the row and show a hint.
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code: unknown }).code)
            : "";
        if (
          code === "functions/not-found" ||
          code === "functions/failed-precondition"
        ) {
          setNotifications((prev) =>
            prev.filter((n) => n.id !== notification.id),
          );
          setDetailModal({
            kind: "toast",
            message: t("invitationAlreadyResponded"),
          });
        } else {
          console.error("handleShopInvitation error:", err);
          setDetailModal({
            kind: "toast",
            message: t("errorGeneric"),
          });
        }
      }
    },
    [user, onClose, t],
  );

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
                  {t("header")}
                </h2>
                {user && notifications.length > 0 && (
                  <p
                    className={`
                      text-sm
                      ${isDarkMode ? "text-gray-400" : "text-gray-500"}
                    `}
                  >
                    {t("count", { count: notifications.length })}
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
                  {t("loginRequiredTitle")}
                </h3>
                <p
                  className={`
                    text-center mb-8 leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {t("loginRequired")}
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
                  <span className="font-medium">{t("login")}</span>
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
                  {t("loading")}
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
                  {t("emptyTitle")}
                </h3>
                <p
                  className={`
                    text-center leading-relaxed
                    ${isDarkMode ? "text-gray-400" : "text-gray-600"}
                  `}
                >
                  {t("empty")}
                </p>
              </div>
            ) : (
              /* Notifications List */
              <div className="px-4 py-4">
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const { icon: IconComponent, color } = getNotificationIcon(
                      notification.type,
                    );
                    const isDeleting = deletingItems.has(notification.id);
                    const message = getNotificationMessage(notification);

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
                                  {getNotificationTitle(notification)}
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
                        <span>{t("loadingMore")}</span>
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
                        {t("endOfList")}
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
                          {t("loadMore")}
                        </button>
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal layer — sits above the drawer (z-[1100] vs drawer's
          z-[1000]) so dialogs from drawer rows can't be hidden by it. */}
      {detailModal && (
        <DetailModalRenderer
          modal={detailModal}
          isDarkMode={isDarkMode}
          t={t}
          onClose={() => setDetailModal(null)}
          onAccept={(n) => handleInvitationResponse(n, true)}
          onReject={(n) => handleInvitationResponse(n, false)}
        />
      )}
    </div>
  );
};

// ─── Detail modal renderer ──────────────────────────────────────────
// Centralized modal layer for refund/edit-rejected/shop-disapproved/
// invitation flows. Pulled out of the main component to keep the
// drawer body readable and so the same dialog primitives can serve all
// six modal kinds without nested JSX.

interface DetailModalRendererProps {
  modal:
    | { kind: "refundApproved"; notification: NotificationData }
    | { kind: "refundRejected"; notification: NotificationData }
    | { kind: "editRejected"; notification: NotificationData }
    | { kind: "shopDisapproved"; notification: NotificationData }
    | { kind: "invitationDecision"; notification: NotificationData }
    | {
        kind: "invitationProcessing";
        entityName: string;
        isRestaurant: boolean;
      }
    | { kind: "toast"; message: string };
  isDarkMode: boolean;
  t: ReturnType<typeof useTranslations>;
  onClose: () => void;
  onAccept: (n: NotificationData) => void;
  onReject: (n: NotificationData) => void;
}

const DetailModalRenderer: React.FC<DetailModalRendererProps> = ({
  modal,
  isDarkMode,
  t,
  onClose,
  onAccept,
  onReject,
}) => {
  // Auto-dismiss the toast variant after 2.5s. Other modal kinds stay
  // open until the user clicks an action button — invitations in
  // particular need an explicit decision so we never auto-close them.
  useEffect(() => {
    if (modal.kind !== "toast") return;
    const timer = setTimeout(onClose, 2500);
    return () => clearTimeout(timer);
  }, [modal, onClose]);

  // Lock body scroll while a modal is open and close on Escape.
  // Skip the scroll lock for the toast variant since it's a small
  // banner that doesn't block the page.
  useEffect(() => {
    if (modal.kind === "toast") return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && modal.kind !== "invitationProcessing") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = original;
      window.removeEventListener("keydown", onKey);
    };
  }, [modal, onClose]);

  if (modal.kind === "toast") {
    return (
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[1200] px-4 py-2 rounded-lg bg-gray-900 text-white text-sm shadow-xl">
        {modal.message}
      </div>
    );
  }

  if (modal.kind === "invitationProcessing") {
    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50">
        <div
          className={`px-6 py-5 rounded-2xl shadow-2xl flex flex-col items-center gap-3 max-w-xs w-full mx-4 ${
            isDarkMode ? "bg-gray-900 text-white" : "bg-white text-gray-900"
          }`}
        >
          <div className="w-10 h-10 border-[3px] border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
          <p className="text-sm font-semibold text-center">
            {modal.isRestaurant ? t("joiningRestaurant") : t("joiningShop")}
          </p>
          {modal.entityName && (
            <p
              className={`text-xs text-center ${
                isDarkMode ? "text-gray-400" : "text-gray-500"
              }`}
            >
              {modal.entityName}
            </p>
          )}
        </div>
      </div>
    );
  }

  const sheetClass = isDarkMode
    ? "bg-gray-900 border-gray-800 text-gray-100"
    : "bg-white border-gray-200 text-gray-900";

  // Decision modal (shop / restaurant invitation): two action buttons.
  if (modal.kind === "invitationDecision") {
    const n = modal.notification;
    const isRestaurant = n.businessType === "restaurant";
    const titleKey = isRestaurant
      ? "restaurantInvitation.title"
      : "shopInvitation.title";
    const bodyKey = isRestaurant
      ? "restaurantInvitation.body"
      : "shopInvitation.body";
    return (
      <div
        className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <div
          className={`max-w-sm w-full rounded-2xl border shadow-2xl ${sheetClass}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-5 pb-3">
            <h3 className="text-base font-bold mb-2">{t(titleKey)}</h3>
            <p className="text-sm">
              {t(bodyKey, {
                inviterName: n.inviterName ?? "",
                shopName: n.shopName ?? "",
              })}
            </p>
          </div>
          <div
            className={`flex gap-2 px-4 py-3 border-t ${
              isDarkMode ? "border-gray-800" : "border-gray-100"
            }`}
          >
            <button
              onClick={() => onReject(n)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isDarkMode
                  ? "bg-gray-800 hover:bg-gray-700 text-gray-200"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-800"
              }`}
            >
              {t("reject")}
            </button>
            <button
              onClick={() => onAccept(n)}
              className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
            >
              {t("accept")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Reason-style dialogs (refund approved/rejected, edit rejected,
  // shop disapproved). All four share the same shape: a title, a body
  // paragraph, an optional rejection-reason callout, and a single OK.
  const n = modal.notification;
  const titleByKind: Record<typeof modal.kind, string> = {
    refundApproved: "refund_request_approved.title",
    refundRejected: "refund_request_rejected.title",
    editRejected: "product_edit_rejected.title",
    shopDisapproved: "shop_disapproved.title",
  };
  const bodyByKind: Record<typeof modal.kind, string> = {
    refundApproved: "refund_request_approved.body",
    refundRejected: "refund_request_rejected.body",
    editRejected: "product_edit_rejected.body",
    shopDisapproved: "shop_disapproved.body",
  };
  const showReason =
    modal.kind === "refundRejected" ||
    modal.kind === "editRejected" ||
    modal.kind === "shopDisapproved";
  const reason = n.rejectionReason?.trim();
  const showRefundOffice = modal.kind === "refundApproved";

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className={`max-w-md w-full rounded-2xl border shadow-2xl ${sheetClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 space-y-3">
          <h3 className="text-base font-bold">{t(titleByKind[modal.kind])}</h3>
          <p className="text-sm whitespace-pre-line">
            {n.message || t(bodyByKind[modal.kind])}
          </p>
          {showRefundOffice && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/20 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200">
              {t("refund_request_approved.officeAddress")}
            </div>
          )}
          {showReason && reason && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 px-3 py-2">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">
                {t("rejectionReason")}
              </p>
              <p className="text-sm text-red-800 dark:text-red-200 whitespace-pre-line">
                {reason}
              </p>
            </div>
          )}
        </div>
        <div
          className={`px-4 py-3 border-t ${
            isDarkMode ? "border-gray-800" : "border-gray-100"
          }`}
        >
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 text-white transition-colors"
          >
            {t("ok")}
          </button>
        </div>
      </div>
    </div>
  );
};
