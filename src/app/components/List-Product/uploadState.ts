// Mirrors Flutter's upload_progress_state.dart exactly.
// Keep this file in sync with the Dart source.

export enum UploadPhase {
    uploading = "uploading",
    submitting = "submitting",
  }
  
  export interface UploadState {
    phase: UploadPhase;
    uploadedFiles: number;
    totalFiles: number;
    bytesTransferred: number;
    totalBytes: number;
  }
  
  // ── Pure helpers (no React) ──────────────────────────────────────────────────
  
  /** Returns a 0–1 fraction used by the progress bar (same logic as Dart). */
  export function getFraction(state: UploadState): number {
    if (state.phase === UploadPhase.submitting) return 1.0;
    if (state.totalBytes === 0) return 0.0;
    return Math.min(state.bytesTransferred / state.totalBytes, 0.95);
  }
  
  /** Returns a human-readable byte string, e.g. "1.4 MB". */
  export function formatBytes(bytes: number): string {
    if (bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  
  export function makeUploadState(
    partial: Partial<UploadState> & { phase: UploadPhase }
  ): UploadState {
    return {
      uploadedFiles: 0,
      totalFiles: 0,
      bytesTransferred: 0,
      totalBytes: 0,
      ...partial,
    };
  }