import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlusIcon, SparklesIcon, RocketLaunchIcon } from "@heroicons/react/24/outline";

export default function CreateShopButton() {
  const [isHovered, setIsHovered] = useState(false);
  const t = useTranslations("shops");

  return (
    <div className="relative group">
      <Link href="/createshop">
        <div
          className="relative overflow-hidden"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {/* Glow Effect */}
          <div className="absolute -inset-1 bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 rounded-2xl blur opacity-25 group-hover:opacity-75 transition duration-500" />
          
          {/* Main Button */}
          <button className="relative w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 hover:from-green-500 hover:via-emerald-500 hover:to-teal-500 text-white font-bold rounded-2xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-xl hover:shadow-2xl group/btn overflow-hidden">
            
            {/* Background Animation */}
            <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-400 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-300" />
            
            {/* Shimmer Effect */}
            <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            
            {/* Content */}
            <div className="relative flex items-center justify-center gap-3">
              {/* Icon Container */}
              <div className="relative">
                <div className={`transition-all duration-300 ${
                  isHovered ? "rotate-180 scale-110" : "rotate-0 scale-100"
                }`}>
                  <PlusIcon className="w-6 h-6" />
                </div>
                
                {/* Floating Sparkles */}
                <SparklesIcon 
                  className={`absolute -top-1 -right-1 w-3 h-3 transition-all duration-500 ${
                    isHovered ? "opacity-100 scale-100 rotate-12" : "opacity-0 scale-0 rotate-0"
                  }`} 
                />
                <SparklesIcon 
                  className={`absolute -bottom-1 -left-1 w-2 h-2 transition-all duration-700 ${
                    isHovered ? "opacity-100 scale-100 rotate-45" : "opacity-0 scale-0 rotate-0"
                  }`} 
                />
              </div>
              
              {/* Text */}
              <span className="text-lg font-semibold tracking-wide">
                {t("createYourShop")}
              </span>
              
              {/* Rocket Icon */}
              <div className={`transition-all duration-500 ${
                isHovered ? "translate-x-1 -translate-y-1 rotate-12" : "translate-x-0 translate-y-0 rotate-0"
              }`}>
                <RocketLaunchIcon className="w-5 h-5" />
              </div>
            </div>
            
            {/* Floating Particles */}
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`absolute w-1 h-1 bg-white rounded-full transition-all duration-1000 ${
                  isHovered ? "opacity-100" : "opacity-0"
                }`}
                style={{
                  left: `${20 + i * 12}%`,
                  top: `${30 + (i % 2) * 40}%`,
                  transform: isHovered 
                    ? `translateY(-${10 + i * 5}px) scale(1)` 
                    : "translateY(0px) scale(0)",
                  transitionDelay: `${i * 100}ms`,
                }}
              />
            ))}
          </button>
        </div>
      </Link>      
      
    </div>
  );
}