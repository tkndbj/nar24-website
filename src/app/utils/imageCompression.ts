// utils/imageCompression.ts

export interface CompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number; // 0.1 to 1.0
    format?: 'image/jpeg' | 'image/webp' | 'image/png' | 'image/jpg' | 'image/png';
    maintainAspectRatio?: boolean;
  }
  
  export interface CompressionResult {
    compressedFile: File;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
  }
  
  /**
   * Compress an image file while maintaining quality
   * Uses canvas-based compression with smart defaults
   */
  export const compressImage = async (
    file: File,
    options: CompressionOptions = {}
  ): Promise<CompressionResult> => {
    const {
      maxWidth = 1920,
      maxHeight = 1920,
      quality = 0.85, // High quality by default
      format = 'image/jpeg',
      maintainAspectRatio = true,
    } = options;
  
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
  
      if (!ctx) {
        reject(new Error('Canvas context not available'));
        return;
      }
  
      img.onload = () => {
        try {
          // Calculate new dimensions
          let { width, height } = img;
          
          if (maintainAspectRatio) {
            // Calculate scaling factor to fit within max dimensions
            const scaleX = maxWidth / width;
            const scaleY = maxHeight / height;
            const scale = Math.min(scaleX, scaleY, 1); // Don't upscale
            
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          } else {
            width = Math.min(width, maxWidth);
            height = Math.min(height, maxHeight);
          }
  
          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;
  
          // Enable high-quality rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
  
          // Draw and compress
          ctx.drawImage(img, 0, 0, width, height);
  
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Compression failed'));
                return;
              }
  
              const compressedFile = new File([blob], file.name, {
                type: format,
                lastModified: Date.now(),
              });
  
              const originalSize = file.size;
              const compressedSize = compressedFile.size;
              const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;
  
              resolve({
                compressedFile,
                originalSize,
                compressedSize,
                compressionRatio,
              });
            },
            format,
            quality
          );
        } catch (error) {
          reject(error);
        }
      };
  
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  };
  
  /**
   * Compress multiple images in parallel
   */
  export const compressImages = async (
    files: File[],
    options: CompressionOptions = {}
  ): Promise<CompressionResult[]> => {
    const compressionPromises = files.map(file => compressImage(file, options));
    return Promise.all(compressionPromises);
  };
  
  /**
   * Smart compression based on image type and use case
   */
  export const smartCompress = async (
    file: File,
    useCase: 'gallery' | 'color' | 'thumbnail' = 'gallery'
  ): Promise<CompressionResult> => {
    const isTransparent = file.type === 'image/png';
    
    let options: CompressionOptions;
    
    switch (useCase) {
      case 'gallery':
        options = {
          maxWidth: 1920,
          maxHeight: 1920,
          quality: 0.85,
          format: isTransparent ? 'image/png' : 'image/jpeg',
        };
        break;
        
      case 'color':
        options = {
          maxWidth: 800,
          maxHeight: 800,
          quality: 0.80,
          format: isTransparent ? 'image/png' : 'image/jpeg',
        };
        break;
        
      case 'thumbnail':
        options = {
          maxWidth: 400,
          maxHeight: 400,
          quality: 0.75,
          format: 'image/jpeg',
        };
        break;
    }
    
    return compressImage(file, options);
  };
  
  /**
   * Check if file needs compression
   */
  export const shouldCompress = (file: File, maxSizeKB: number = 500): boolean => {
    const fileSizeKB = file.size / 1024;
    return fileSizeKB > maxSizeKB;
  };
  
  /**
   * Get human-readable file size
   */
  export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };