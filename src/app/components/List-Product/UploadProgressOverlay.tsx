"use client";

// Mirrors Flutter's upload_progress_overlay.dart exactly.
// Covers the entire screen and absorbs all pointer events while uploading.

import React, { useEffect, useRef, useState } from "react";
import { UploadPhase, UploadState, getFraction, formatBytes } from "./uploadState";

interface Props {
  state: UploadState;
}

/**
 * Full-screen, non-dismissible overlay shown during file upload + submission.
 *
 * The progress bar animates smoothly between values using a CSS transition,
 * matching the AnimationController behaviour in Flutter.
 */
export default function UploadProgressOverlay({ state }: Props) {
  // Animated bar value — we only move it forward, never jump.
  const [displayFraction, setDisplayFraction] = useState(getFraction(state));
  const targetFraction = getFraction(state);

  useEffect(() => {
    setDisplayFraction(targetFraction);
  }, [targetFraction]);

  const pct = Math.round(displayFraction * 100);
  const isUploading = state.phase === UploadPhase.uploading;

  // Prevent any background interaction (mirrors Flutter's AbsorbPointer)
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", pointerEvents: "all" }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="mx-8 w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: "var(--overlay-bg, #fff)" }}
      >
        {/* Phase icon */}
        <div className="flex justify-center mb-5">
          <div
            className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
              isUploading ? "animate-spin" : ""
            }`}
            style={{
              background: "linear-gradient(135deg, #00A86B 0%, #00C574 100%)",
              animationDuration: "2s",
            }}
          >
            {isUploading ? (
              // Cloud upload icon
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            ) : (
              // Checkmark icon
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Title */}
        <p className="text-center text-lg font-bold text-gray-900 dark:text-white mb-1">
          {isUploading ? "Uploading…" : "Finalizing your listing"}
        </p>

        {/* Subtitle */}
        <p className="text-center text-sm text-gray-500 dark:text-gray-400 mb-6">
          {isUploading
            ? state.totalFiles === 0
              ? "Sending files…"
              : `${state.uploadedFiles} of ${state.totalFiles} files uploaded`
            : "Almost done!"}
        </p>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="flex justify-end mb-1">
            <span
              className="text-sm font-bold"
              style={{ color: "#00A86B" }}
            >
              {pct}%
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${pct}%`,
                background:
                  "linear-gradient(90deg, #00A86B 0%, #00C574 100%)",
              }}
            />
          </div>
        </div>

        {/* Byte / file details (uploading phase only) */}
        <div className="h-5 flex items-center justify-between mb-5">
          {isUploading && state.totalBytes > 0 ? (
            <>
              <span className="text-xs text-gray-400">
                {state.uploadedFiles} / {state.totalFiles} files
              </span>
              <span className="text-xs text-gray-400">
                {formatBytes(state.bytesTransferred)} /{" "}
                {formatBytes(state.totalBytes)}
              </span>
            </>
          ) : state.phase === UploadPhase.submitting ? (
            <span className="text-xs text-gray-400 mx-auto">
              Saving to database…
            </span>
          ) : null}
        </div>

        {/* "Don't close" warning */}
        <div className="flex items-center justify-center gap-1.5">
          <svg
            className="w-3.5 h-3.5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01M12 3a9 9 0 100 18A9 9 0 0012 3z"
            />
          </svg>
          <span className="text-xs text-gray-400">
            Please don&apos;t close the app
          </span>
        </div>
      </div>

      {/* Dark-mode CSS variable injection */}
      <style jsx>{`
        @media (prefers-color-scheme: dark) {
          div[style*="overlay-bg"] {
            --overlay-bg: #211f31;
          }
        }
      `}</style>
    </div>
  );
}