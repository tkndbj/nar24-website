"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserProvider";
import { doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import {
  httpsCallable,
  getFunctions,
  type Functions,
  type HttpsCallable,
  type HttpsCallableResult,
} from "firebase/functions";
import { signOut } from "firebase/auth";
import {
  ArrowLeft,
  Shield,
  AlertTriangle,
  Key,
  Trash2,
  ChevronRight,
  LogIn,
  X,
  Loader2,
  ArrowRightLeft,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";

// ──────────────────────────────────────────────────────────────────────────────
// Cloud Function bindings — cached at module scope so we reuse the same
// httpsCallable instance across precheck / transfer / delete (and across
// component remounts). Avoids re-creating the callable on every click.
// ──────────────────────────────────────────────────────────────────────────────

type PrecheckRequest = { uid?: string };
type EntitySummary = { id: string; type: "shop" | "restaurant"; name: string };
type EntityMember = {
  uid: string;
  displayName: string;
  role: "co-owner" | "editor" | "viewer";
};
type TransferEntity = EntitySummary & { members: EntityMember[] };
type PrecheckResponse = {
  status: "clear" | "solo_owner_warning" | "transfer_required";
  soloOwned: EntitySummary[];
  transferRequired: TransferEntity[];
  messages: { en: string; tr: string; ru: string };
};

type TransferRequest = {
  entityId: string;
  entityType: "shop" | "restaurant";
  newOwnerId: string;
};
type TransferResponse = {
  success: boolean;
  entityId: string;
  entityType: "shop" | "restaurant";
  previousOwnerId: string;
  newOwnerId: string;
};

type DeleteRequest = { email: string; confirmDisableOwned?: boolean };

let _functions: Functions | null = null;
let _precheck: HttpsCallable<PrecheckRequest, PrecheckResponse> | null = null;
let _transfer: HttpsCallable<TransferRequest, TransferResponse> | null = null;
let _delete: HttpsCallable<DeleteRequest, unknown> | null = null;

function functionsClient(): Functions {
  if (!_functions) _functions = getFunctions(undefined, "europe-west3");
  return _functions;
}
function precheckCallable() {
  if (!_precheck) {
    _precheck = httpsCallable<PrecheckRequest, PrecheckResponse>(
      functionsClient(),
      "precheckAccountDeletion",
    );
  }
  return _precheck;
}
function transferCallable() {
  if (!_transfer) {
    _transfer = httpsCallable<TransferRequest, TransferResponse>(
      functionsClient(),
      "transferOwnership",
    );
  }
  return _transfer;
}
function deleteCallable() {
  if (!_delete) {
    _delete = httpsCallable<DeleteRequest, unknown>(
      functionsClient(),
      "deleteUserAccount",
    );
  }
  return _delete;
}

// Firebase Functions errors expose a string `code` on the thrown object.
function isFailedPreconditionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  return code === "functions/failed-precondition" || code === "failed-precondition";
}

// ──────────────────────────────────────────────────────────────────────────────
// Deletion flow state machine
// ──────────────────────────────────────────────────────────────────────────────

type FlowState =
  | { kind: "idle" }
  | { kind: "precheck" }
  | { kind: "transfer"; entities: TransferEntity[]; serverMessage: string }
  | {
      kind: "transferConfirm";
      entity: TransferEntity;
      member: EntityMember;
    }
  | {
      kind: "transferring";
      entityId: string;
      entityType: "shop" | "restaurant";
      memberUid: string;
    }
  | {
      kind: "soloWarning";
      soloOwned: EntitySummary[];
      serverMessage: string;
    }
  | { kind: "emailConfirm"; confirmDisableOwned: boolean }
  | { kind: "deleting"; confirmDisableOwned: boolean };

interface UserSettings {
  twoFactorEnabled: boolean;
}

export default function AccountSettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [settings, setSettings] = useState<UserSettings>({
    twoFactorEnabled: false,
  });
  const [deleteEmail, setDeleteEmail] = useState("");
  const [flow, setFlow] = useState<FlowState>({ kind: "idle" });
  const [toast, setToast] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const { user, isLoading: authLoading } = useUser();
  const router = useRouter();
  const t = useTranslations("AccountSettings");
  const locale = useLocale();

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const check = () => {
      if (typeof document !== "undefined")
        setIsDarkMode(document.documentElement.classList.contains("dark"));
    };
    check();
    const obs = new MutationObserver(check);
    if (typeof document !== "undefined")
      obs.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (user) loadUserSettings();
  }, [user]);

  // Auto-dismiss success toast.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const loadUserSettings = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists())
        setSettings({
          twoFactorEnabled: userDoc.data().twoFactorEnabled ?? false,
        });
    } catch (error) {
      console.error("Error loading settings:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handle2FAToggle = async (value: boolean) => {
    router.push(
      value
        ? "/two-factor-verification?type=setup"
        : "/two-factor-verification?type=disable",
    );
  };

  // ── Pick the localized warning text from server messages, falling back
  //    to English when the user's locale isn't covered.
  const pickServerMessage = useCallback(
    (messages: PrecheckResponse["messages"]): string => {
      const key = locale as keyof typeof messages;
      return messages[key] || messages.en || "";
    },
    [locale],
  );

  // ── Run precheck and route into the next state. Used both as the entry
  //    point (after the initial Delete-account click) and recursively after
  //    a successful transfer or a server `failed-precondition`.
  const runPrecheckAndDecide = useCallback(async () => {
    setErrorBanner(null);
    setFlow({ kind: "precheck" });
    try {
      const res: HttpsCallableResult<PrecheckResponse> = await precheckCallable()({});
      if (!isMountedRef.current) return;
      const { status, soloOwned, transferRequired, messages } = res.data;
      const serverMessage = pickServerMessage(messages);

      if (status === "clear") {
        setFlow({ kind: "emailConfirm", confirmDisableOwned: false });
      } else if (status === "solo_owner_warning") {
        setFlow({ kind: "soloWarning", soloOwned, serverMessage });
      } else {
        setFlow({
          kind: "transfer",
          entities: transferRequired,
          serverMessage,
        });
      }
    } catch (err) {
      console.error("[precheckAccountDeletion]", err);
      if (!isMountedRef.current) return;
      setFlow({ kind: "idle" });
      setErrorBanner(t("precheckFailed"));
    }
  }, [pickServerMessage, t]);

  // ── Open the per-member confirmation dialog from the transfer modal.
  const askTransferConfirm = useCallback(
    (entity: TransferEntity, member: EntityMember) => {
      setFlow({ kind: "transferConfirm", entity, member });
    },
    [],
  );

  // ── User confirmed; call the cloud function and recurse on success.
  const performTransfer = useCallback(
    async (entity: TransferEntity, member: EntityMember) => {
      setFlow({
        kind: "transferring",
        entityId: entity.id,
        entityType: entity.type,
        memberUid: member.uid,
      });
      try {
        await transferCallable()({
          entityId: entity.id,
          entityType: entity.type,
          newOwnerId: member.uid,
        });
        if (!isMountedRef.current) return;
        setToast(
          t("ownershipTransferredSuccess", {
            entityName: entity.name || entity.id,
            memberName: member.displayName || t("unknownMember"),
          }),
        );
        await runPrecheckAndDecide();
      } catch (err) {
        console.error("[transferOwnership]", err);
        if (!isMountedRef.current) return;
        setErrorBanner(t("transferFailed"));
        // Fall back to the transfer list so the user can try again.
        await runPrecheckAndDecide();
      }
    },
    [runPrecheckAndDecide, t],
  );

  // ── Final step: hit deleteUserAccount, recurse on failed-precondition
  //    (state changed since the precheck — usually a co-owner just accepted),
  //    sign out + redirect on success.
  const performDelete = useCallback(
    async (email: string, confirmDisableOwned: boolean) => {
      setFlow({ kind: "deleting", confirmDisableOwned });
      try {
        await deleteCallable()({ email, confirmDisableOwned });
        try {
          await signOut(auth);
        } catch (signOutErr) {
          // Auth account is already gone server-side; the listener will
          // clear local state. Don't block the redirect on this.
          console.warn("[signOut after delete]", signOutErr);
        }
        router.push("/login");
      } catch (err) {
        console.error("[deleteUserAccount]", err);
        if (!isMountedRef.current) return;
        if (isFailedPreconditionError(err)) {
          // State drifted between precheck and delete — start over.
          await runPrecheckAndDecide();
          return;
        }
        setErrorBanner(
          err instanceof Error ? err.message : t("deleteAccountFailed"),
        );
        setFlow({ kind: "idle" });
      }
    },
    [router, runPrecheckAndDecide, t],
  );

  const handleDeleteClick = useCallback(() => {
    setDeleteEmail("");
    setErrorBanner(null);
    void runPrecheckAndDecide();
  }, [runPrecheckAndDecide]);

  const handleEmailConfirmSubmit = useCallback(() => {
    if (flow.kind !== "emailConfirm" || !user) return;
    if (deleteEmail.trim().toLowerCase() !== (user.email || "").toLowerCase()) {
      setErrorBanner(t("emailMismatch"));
      return;
    }
    setErrorBanner(null);
    void performDelete(deleteEmail.trim(), flow.confirmDisableOwned);
  }, [flow, user, deleteEmail, performDelete, t]);

  const closeFlow = useCallback(() => {
    setFlow({ kind: "idle" });
    setErrorBanner(null);
  }, []);

  // Toolbar shared across states
  const Toolbar = () => (
    <div
      className={`sticky top-14 z-30 border-b ${isDarkMode ? "bg-gray-900/80 backdrop-blur-xl border-gray-700/80" : "bg-white/80 backdrop-blur-xl border-gray-100/80"}`}
    >
      <div className="max-w-4xl mx-auto flex items-center gap-3 px-3 sm:px-6 py-3">
        <button
          onClick={() => router.back()}
          className={`w-9 h-9 flex items-center justify-center border rounded-xl transition-colors flex-shrink-0 ${
            isDarkMode
              ? "bg-gray-800 border-gray-700 hover:bg-gray-700"
              : "bg-gray-50 border-gray-200 hover:bg-gray-100"
          }`}
        >
          <ArrowLeft
            className={`w-4 h-4 ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
          />
        </button>
        <h1
          className={`text-lg font-bold truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
        >
          {t("accountSettings")}
        </h1>
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center pt-20 ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
      >
        <Toolbar />
        <div className="text-center py-16 px-3">
          <LogIn
            className={`w-12 h-12 mx-auto mb-3 ${isDarkMode ? "text-gray-600" : "text-gray-300"}`}
          />
          <h3
            className={`text-sm font-semibold mb-1 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("loginRequired")}
          </h3>
          <button
            onClick={() => router.push("/login")}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-xs font-medium"
          >
            {t("login")}
          </button>
        </div>
      </div>
    );
  }

  const roleLabel = (role: EntityMember["role"]) => {
    switch (role) {
      case "co-owner":
        return t("roleCoOwner");
      case "editor":
        return t("roleEditor");
      case "viewer":
        return t("roleViewer");
    }
  };

  const entityLabel = (type: "shop" | "restaurant") =>
    type === "shop" ? t("shopLabel") : t("restaurantLabel");

  return (
    <div
      className={`min-h-screen ${isDarkMode ? "bg-gray-900" : "bg-gray-50/50"}`}
    >
      <Toolbar />

      <div className="max-w-4xl mx-auto px-3 sm:px-6 py-4 space-y-3">
        {/* Header Banner */}
        <div
          className={`rounded-2xl p-4 text-center ${isDarkMode ? "bg-orange-900/10 border border-orange-700/30" : "bg-orange-50 border border-orange-100"}`}
        >
          <div
            className={`w-10 h-10 mx-auto mb-2 rounded-xl flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-100"}`}
          >
            <Shield className="w-5 h-5 text-orange-500" />
          </div>
          <h2
            className={`text-sm font-bold mb-0.5 ${isDarkMode ? "text-white" : "text-gray-900"}`}
          >
            {t("accountSettingsTitle")}
          </h2>
          <p
            className={`text-xs ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
          >
            {t("accountSettingsSubtitle")}
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-5 h-5 border-[3px] border-orange-200 border-t-orange-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Security Section */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
                >
                  <Shield className="w-3 h-3 text-orange-500" />
                </div>
                <span
                  className={`text-xs font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                >
                  {t("securitySettings")}
                </span>
              </div>

              <div
                className={`rounded-2xl border ${isDarkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}
              >
                <div className="px-4 py-3 flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                      settings.twoFactorEnabled
                        ? isDarkMode
                          ? "bg-green-900/30"
                          : "bg-green-50"
                        : isDarkMode
                          ? "bg-gray-700"
                          : "bg-gray-100"
                    }`}
                  >
                    <Key
                      className={`w-4 h-4 ${settings.twoFactorEnabled ? (isDarkMode ? "text-green-400" : "text-green-600") : "text-gray-400"}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                    >
                      {t("twoFactorAuth")}
                    </h4>
                    <p
                      className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                    >
                      {t("twoFactorAuthDesc")}
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.twoFactorEnabled}
                      onChange={(e) => handle2FAToggle(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div
                      className={`w-10 h-5 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-green-600 ${isDarkMode ? "bg-gray-600" : "bg-gray-200"}`}
                    />
                  </label>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <div
                  className={`w-6 h-6 rounded-lg flex items-center justify-center ${isDarkMode ? "bg-red-900/30" : "bg-red-50"}`}
                >
                  <AlertTriangle
                    className={`w-3 h-3 ${isDarkMode ? "text-red-400" : "text-red-500"}`}
                  />
                </div>
                <span
                  className={`text-xs font-semibold ${isDarkMode ? "text-red-400" : "text-red-600"}`}
                >
                  {t("dangerZone")}
                </span>
              </div>

              <div
                className={`rounded-2xl border-2 overflow-hidden ${isDarkMode ? "border-red-800/50 bg-gray-800" : "border-red-100 bg-white"}`}
              >
                <button
                  onClick={handleDeleteClick}
                  disabled={flow.kind !== "idle"}
                  className={`w-full px-4 py-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? "hover:bg-red-900/10" : "hover:bg-red-50/50"}`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-red-900/30" : "bg-red-50"}`}
                    >
                      <Trash2
                        className={`w-4 h-4 ${isDarkMode ? "text-red-400" : "text-red-500"}`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4
                        className={`text-sm font-semibold ${isDarkMode ? "text-red-400" : "text-red-600"}`}
                      >
                        {t("deleteAccount")}
                      </h4>
                      <p
                        className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                      >
                        {t("deleteAccountDesc")}
                      </p>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? "text-red-400/50" : "text-red-300"}`}
                    />
                  </div>
                </button>
              </div>
            </div>

            {errorBanner && (
              <div
                className={`rounded-xl border px-3 py-2 text-xs ${
                  isDarkMode
                    ? "bg-red-900/20 border-red-800/50 text-red-300"
                    : "bg-red-50 border-red-200 text-red-700"
                }`}
              >
                {errorBanner}
              </div>
            )}
          </>
        )}
      </div>

      {/* ─── Precheck loading overlay ─────────────────────────────────── */}
      {flow.kind === "precheck" && (
        <Modal isDarkMode={isDarkMode}>
          <div className="p-6 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
            <p
              className={`text-sm ${isDarkMode ? "text-gray-200" : "text-gray-700"}`}
            >
              {t("checkingYourAccount")}
            </p>
          </div>
        </Modal>
      )}

      {/* ─── Transfer-required modal (scrollable) ─────────────────────── */}
      {flow.kind === "transfer" && (
        <Modal isDarkMode={isDarkMode} onClose={closeFlow} wide>
          <div
            className={`flex items-center justify-between px-4 py-3 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <h3
              className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("transferOwnershipTitle")}
            </h3>
            <button
              onClick={closeFlow}
              className={`p-1 rounded-lg ${isDarkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"}`}
              aria-label={t("cancel")}
            >
              <X
                className={`w-4 h-4 ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
              />
            </button>
          </div>
          <div className="px-4 py-3 max-h-[70vh] overflow-y-auto space-y-4">
            {flow.serverMessage && (
              <p
                className={`text-xs whitespace-pre-line ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
              >
                {flow.serverMessage}
              </p>
            )}
            {flow.entities.map((entity) => (
              <div
                key={`${entity.type}:${entity.id}`}
                className={`rounded-xl border ${isDarkMode ? "border-gray-700 bg-gray-800/40" : "border-gray-200 bg-gray-50/40"}`}
              >
                <div
                  className={`px-3 py-2 border-b ${isDarkMode ? "border-gray-700" : "border-gray-200"}`}
                >
                  <div
                    className={`text-[10px] uppercase tracking-wide ${isDarkMode ? "text-gray-500" : "text-gray-400"}`}
                  >
                    {entityLabel(entity.type)}
                  </div>
                  <div
                    className={`text-sm font-semibold ${isDarkMode ? "text-white" : "text-gray-900"}`}
                  >
                    {entity.name || entity.id}
                  </div>
                </div>
                <div className="divide-y divide-transparent">
                  {entity.members.map((member) => (
                    <button
                      key={member.uid}
                      onClick={() => askTransferConfirm(entity, member)}
                      className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${isDarkMode ? "hover:bg-gray-700/40" : "hover:bg-white"}`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isDarkMode ? "bg-orange-900/30" : "bg-orange-50"}`}
                      >
                        <ArrowRightLeft className="w-4 h-4 text-orange-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div
                          className={`text-sm font-medium truncate ${isDarkMode ? "text-white" : "text-gray-900"}`}
                        >
                          {member.displayName || t("unknownMember")}
                        </div>
                        <div
                          className={`text-[11px] ${isDarkMode ? "text-gray-400" : "text-gray-500"}`}
                        >
                          {roleLabel(member.role)}
                        </div>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 flex-shrink-0 ${isDarkMode ? "text-gray-500" : "text-gray-300"}`}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* ─── Transfer-confirm dialog (per member) ─────────────────────── */}
      {flow.kind === "transferConfirm" && (
        <Modal isDarkMode={isDarkMode} onClose={closeFlow}>
          <div
            className={`p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <h3
              className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("transferOwnershipConfirmTitle")}
            </h3>
          </div>
          <div className="p-4">
            <p
              className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
            >
              {t("transferOwnershipConfirmMessage", {
                memberName:
                  flow.member.displayName || t("unknownMember"),
                entityName: flow.entity.name || flow.entity.id,
              })}
            </p>
          </div>
          <div
            className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <button
              onClick={() =>
                setFlow({
                  kind: "transfer",
                  // Re-render the picker by re-running precheck — keeps
                  // member list authoritative.
                  entities: [],
                  serverMessage: "",
                })
              }
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("cancel")}
            </button>
            <button
              onClick={() => {
                const e = flow.entity;
                const m = flow.member;
                void performTransfer(e, m);
              }}
              className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              {t("transferAction")}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Transferring spinner ─────────────────────────────────────── */}
      {flow.kind === "transferring" && (
        <Modal isDarkMode={isDarkMode}>
          <div className="p-6 flex flex-col items-center gap-3">
            <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
          </div>
        </Modal>
      )}

      {/* ─── Solo-owner warning ───────────────────────────────────────── */}
      {flow.kind === "soloWarning" && (
        <Modal isDarkMode={isDarkMode} onClose={closeFlow}>
          <div
            className={`p-4 border-b flex items-center gap-2 ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3
              className={`text-sm font-bold ${isDarkMode ? "text-white" : "text-gray-900"}`}
            >
              {t("deleteAccount")}
            </h3>
          </div>
          <div className="p-4">
            <p
              className={`text-xs whitespace-pre-line ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
            >
              {flow.serverMessage}
            </p>
          </div>
          <div
            className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <button
              onClick={closeFlow}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("cancel")}
            </button>
            <button
              onClick={() =>
                setFlow({ kind: "emailConfirm", confirmDisableOwned: true })
              }
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              {t("continueAction")}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Email confirm dialog (existing UX, both branches reuse) ──── */}
      {(flow.kind === "emailConfirm" || flow.kind === "deleting") && (
        <Modal
          isDarkMode={isDarkMode}
          onClose={flow.kind === "deleting" ? undefined : closeFlow}
        >
          <div
            className={`p-4 border-b ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <h3
              className={`text-sm font-bold ${isDarkMode ? "text-red-400" : "text-red-600"}`}
            >
              {t("deleteAccount")}
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <p
              className={`text-xs ${isDarkMode ? "text-gray-300" : "text-gray-600"}`}
            >
              {t("deleteAccountConfirmation")}
            </p>
            <input
              type="email"
              value={deleteEmail}
              disabled={flow.kind === "deleting"}
              onChange={(e) => setDeleteEmail(e.target.value)}
              placeholder={t("enterEmailToConfirm")}
              className={`w-full px-3 py-2 rounded-xl text-sm border transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 ${
                isDarkMode
                  ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500"
                  : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400"
              }`}
            />
            {errorBanner && (
              <p
                className={`text-xs ${isDarkMode ? "text-red-300" : "text-red-600"}`}
              >
                {errorBanner}
              </p>
            )}
          </div>
          <div
            className={`flex gap-2 p-4 border-t ${isDarkMode ? "border-gray-700" : "border-gray-100"}`}
          >
            <button
              onClick={closeFlow}
              disabled={flow.kind === "deleting"}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                isDarkMode
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t("cancel")}
            </button>
            <button
              onClick={handleEmailConfirmSubmit}
              disabled={
                flow.kind === "deleting" ||
                deleteEmail.trim().toLowerCase() !==
                  (user.email || "").toLowerCase()
              }
              className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {flow.kind === "deleting" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {t("deleting")}
                </>
              ) : (
                t("deleteAccount")
              )}
            </button>
          </div>
        </Modal>
      )}

      {/* ─── Success toast ────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-gray-900 text-white text-xs shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Modal — minimal centered overlay. `wide` widens the panel for the transfer
// list. `onClose` undefined ⇒ overlay is non-dismissable (used while a
// destructive call is in-flight).
// ──────────────────────────────────────────────────────────────────────────────

function Modal({
  children,
  isDarkMode,
  onClose,
  wide,
}: {
  children: React.ReactNode;
  isDarkMode: boolean;
  onClose?: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-md" : "max-w-sm"} rounded-2xl shadow-2xl ${isDarkMode ? "bg-gray-800" : "bg-white"}`}
      >
        {children}
      </div>
    </div>
  );
}
