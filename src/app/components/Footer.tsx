"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Mail, Phone, MapPin } from "lucide-react";
import Image from "next/image";
import { useTheme } from "@/hooks/useTheme";

export default function Footer() {
  const isDarkMode = useTheme();
  const t = useTranslations("footer");

  const handleLinkClick = (
    e: React.MouseEvent,
    link: { href?: string; action?: string }
  ) => {
    if (link.action === "openCookieSettings") {
      e.preventDefault(); // ← This prevents navigation
      window.dispatchEvent(new CustomEvent("openCookieSettings"));
    }
  };

  const quickLinks = [
    { label: t("shops"), href: "/shops" },
    { label: "Vitrin", href: "/dynamicteras" },
    { label: t("becomeASeller"), href: "/createshop" },
    { label: t("profile"), href: "/profile" },
    { label: t("orders"), href: "/orders" },
    { label: t("sellOnVitrin"), href: "/listproduct" },
    { label: t("accountSettings"), href: "/account-settings" },
  ];

  const supportLinks = [
    { label: t("helpCenter"), href: "/support-and-faq" },
    { label: t("shipping"), href: "/shippinginfo" },
    { label: t("returns"), href: "/refundform" },
  ];

  const legalLinks = [
    { label: t("termsOfService"), href: "/agreements/terms" },
    { label: t("membershipAgreement"), href: "/agreements/membership" },
    { label: t("personalData"), href: "/agreements/personal-data" },
    { label: t("cancelAndReturnPolicy"), href: "/agreements/refund" },
    { label: t("sellerAgreement"), href: "/agreements/seller" },
    { label: t("distanceSelling"), href: "/agreements/distance-selling" },
    {
      label: t("cookiePolicy"),
      href: "/cookies",
      action: "openCookieSettings",
    },
  ];

  return (
    <footer
      className={`relative mt-auto ${
        isDarkMode
          ? "bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900"
          : "bg-gradient-to-br from-gray-50 via-white to-gray-100"
      }`}
    >
      {/* Decorative top border */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 via-pink-500 to-purple-500"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12 mb-12">
          {/* Brand Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Image
                src={isDarkMode ? "/images/beyazlogo.png" : "/images/siyahlogo.png"}
                alt="Nar24"
                width={40}
                height={40}
                className="w-10 h-10 object-contain"
              />
              <span
                className={`text-2xl font-bold bg-gradient-to-r ${
                  isDarkMode
                    ? "from-white to-gray-300"
                    : "from-gray-900 to-gray-600"
                } bg-clip-text text-transparent`}
              >
                Nar24
              </span>
            </div>
            <p
              className={`text-sm ${
                isDarkMode ? "text-gray-400" : "text-gray-600"
              }`}
            >
              {t("tagline")}
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail
                  className={`w-4 h-4 ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                />
                <a
                  href="mailto:info@nar24.com"
                  className={`text-sm hover:text-orange-500 transition-colors ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  info@nar24.com
                </a>
              </div>
              <div className="flex items-center gap-2">
                <Phone
                  className={`w-4 h-4 ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                />
                <a
                  href="tel:+1234567890"
                  className={`text-sm hover:text-orange-500 transition-colors ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  +90 539 110 2424
                </a>
              </div>
              <div className="flex items-start gap-2">
                <MapPin
                  className={`w-4 h-4 mt-1 flex-shrink-0 ${
                    isDarkMode ? "text-gray-500" : "text-gray-400"
                  }`}
                />
                <span
                  className={`text-sm ${
                    isDarkMode ? "text-gray-400" : "text-gray-600"
                  }`}
                >
                  İskele, Kalecik, Kıbrıs
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-gray-300" : "text-gray-900"
              }`}
            >
              {t("quickLinks")}
            </h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    onClick={(e) => handleLinkClick(e, link)}
                    href={link.href}
                    className={`text-sm hover:text-orange-500 transition-colors ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-gray-300" : "text-gray-900"
              }`}
            >
              {t("support")}
            </h3>
            <ul className="space-y-3">
              {supportLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    onClick={(e) => handleLinkClick(e, link)}
                    href={link.href}
                    className={`text-sm hover:text-orange-500 transition-colors ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3
              className={`text-sm font-semibold uppercase tracking-wider mb-4 ${
                isDarkMode ? "text-gray-300" : "text-gray-900"
              }`}
            >
              {t("legal")}
            </h3>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    onClick={(e) => handleLinkClick(e, link)}
                    href={link.href}
                    className={`text-sm hover:text-orange-500 transition-colors ${
                      isDarkMode ? "text-gray-400" : "text-gray-600"
                    }`}
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Social Links */}
        <div
          className={`border-t pt-8 ${
            isDarkMode ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm ${
                  isDarkMode ? "text-gray-400" : "text-gray-600"
                }`}
              >
                © {new Date().getFullYear()} E.C.T.S TRADING LTD{" "}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Bar */}
        <div
          className={`mt-8 pt-6 border-t text-center ${
            isDarkMode ? "border-gray-800" : "border-gray-200"
          }`}
        >
          <p
            className={`text-xs ${
              isDarkMode ? "text-gray-500" : "text-gray-500"
            }`}
          >
            {t("allRightsReserved")}
          </p>
        </div>
      </div>
    </footer>
  );
}
