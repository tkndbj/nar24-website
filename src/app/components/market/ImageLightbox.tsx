// components/market/ImageLightbox.tsx
//
// Full-screen image viewer with pinch-zoom (mobile) and wheel-zoom + drag-pan
// (desktop). Closes on Escape, click-outside, or tap on the X button.
//
// Implementation notes:
//   • Mobile pinch uses Pointer Events with two-finger distance tracking.
//     We bypass `touch-action: pinch-zoom` because it zooms the *page*,
//     not the image — we want element-scoped zoom.
//   • Desktop uses wheel (ctrl+wheel or plain wheel) and click-drag to pan.
//   • Zoom is clamped to [1, 6]. Below 1 would let you pan an image smaller
//     than the viewport, which is jarring.
//   • Double-tap / double-click toggles between 1× and 2.5×.
//
// No external libraries — transforms are pure CSS `translate + scale`.

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { X } from "lucide-react";
import CloudinaryImage from "../../components/CloudinaryImage";

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_WHEEL_STEP = 0.25;
const DOUBLE_TAP_ZOOM = 2.5;
const DOUBLE_TAP_MS = 300;

interface ImageLightboxProps {
  open: boolean;
  imageUrl: string;
  alt?: string;
  onClose: () => void;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

export default function ImageLightbox({
  open,
  imageUrl,
  alt = "",
  onClose,
}: ImageLightboxProps) {
  const [transform, setTransform] = useState<Transform>(IDENTITY);
  const stageRef = useRef<HTMLDivElement>(null);

  // Pointer tracking — handles both touch (pinch) and mouse (drag)
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{
    distance: number;
    scale: number;
  } | null>(null);
  const panStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTx: number;
    startTy: number;
  } | null>(null);
  const lastTapRef = useRef<number>(0);

  // ── Reset transform whenever a new image is shown ─────────────────────────
  useEffect(() => {
    if (open) setTransform(IDENTITY);
  }, [open, imageUrl]);

  // ── Body scroll lock + Escape ─────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const clampScale = (s: number) => Math.min(Math.max(s, ZOOM_MIN), ZOOM_MAX);

  const toggleZoom = useCallback(() => {
    setTransform((prev) =>
      prev.scale > 1.1 ? IDENTITY : { scale: DOUBLE_TAP_ZOOM, x: 0, y: 0 },
    );
  }, []);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      // Double-tap / double-click
      const now = Date.now();
      if (now - lastTapRef.current < DOUBLE_TAP_MS) {
        toggleZoom();
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      stageRef.current?.setPointerCapture(e.pointerId);

      if (pointersRef.current.size === 2) {
        // Two pointers → start pinch. Record starting distance & scale.
        const [a, b] = Array.from(pointersRef.current.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        pinchStartRef.current = { distance, scale: transform.scale };
        panStartRef.current = null;
      } else if (pointersRef.current.size === 1 && transform.scale > 1) {
        // Single pointer while zoomed → start pan.
        panStartRef.current = {
          pointerId: e.pointerId,
          startX: e.clientX,
          startY: e.clientY,
          startTx: transform.x,
          startTy: transform.y,
        };
      }
    },
    [transform, toggleZoom],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      // Pinch
      if (pointersRef.current.size >= 2 && pinchStartRef.current) {
        const [a, b] = Array.from(pointersRef.current.values());
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = distance / pinchStartRef.current.distance;
        setTransform((prev) => ({
          ...prev,
          scale: clampScale(pinchStartRef.current!.scale * ratio),
        }));
        return;
      }

      // Pan
      if (panStartRef.current && panStartRef.current.pointerId === e.pointerId) {
        const ps = panStartRef.current;
        setTransform((prev) => ({
          ...prev,
          x: ps.startTx + (e.clientX - ps.startX),
          y: ps.startTy + (e.clientY - ps.startY),
        }));
      }
    },
    [],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      pointersRef.current.delete(e.pointerId);
      try {
        stageRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        // Capture may already be released — not a problem.
      }
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
      if (pointersRef.current.size === 0) {
        panStartRef.current = null;
        // If the user pinched below ~1.05× we snap back to exact 1× and
        // recenter — prevents sub-pixel drift.
        setTransform((prev) =>
          prev.scale < 1.05 ? IDENTITY : prev,
        );
      }
    },
    [],
  );

  const onWheel = useCallback(
    (e: ReactWheelEvent<HTMLDivElement>) => {
      if (!stageRef.current) return;
      // Zoom toward cursor position.
      const rect = stageRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      const delta = e.deltaY < 0 ? ZOOM_WHEEL_STEP : -ZOOM_WHEEL_STEP;

      setTransform((prev) => {
        const nextScale = clampScale(prev.scale + delta);
        if (nextScale === prev.scale) return prev;
        // Keep the point under the cursor stationary:
        // translate by the cursor-to-center vector weighted by scale delta.
        const ratio = nextScale / prev.scale;
        return {
          scale: nextScale,
          x: cx - (cx - prev.x) * ratio,
          y: cy - (cy - prev.y) * ratio,
        };
      });
    },
    [],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  const transformStyle = useMemo(
    () => ({
      transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
      transition: pointersRef.current.size === 0 ? "transform 120ms ease" : "none",
    }),
    [transform],
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center select-none"
    >
      {/* Stage — captures pointer + wheel */}
      <div
        ref={stageRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        className="absolute inset-0 flex items-center justify-center overflow-hidden touch-none cursor-grab active:cursor-grabbing"
      >
        <div
          style={transformStyle}
          className="will-change-transform pointer-events-none"
        >
          {/* CloudinaryImage.Banner already handles Firebase fallback;
              zoom width is plenty for full-screen display. */}
          <CloudinaryImage.Banner
            source={imageUrl}
            cdnWidth={1600}
            fit="contain"
            alt={alt}
            priority
            /* Constrain to viewport size; the transform scales this up */
            width={undefined}
            height={undefined}
            className="max-w-[95vw] max-h-[95vh]"
          />
        </div>
      </div>

      {/* Close button — sits above the stage */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 backdrop-blur-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );
}