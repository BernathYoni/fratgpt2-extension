import imageCompression from 'browser-image-compression';

interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  quality?: number;
  skipIfSmall?: boolean;
}

interface CompressionResult {
  compressed: string;
  originalSize: number;
  compressedSize: number;
  reductionPercent: number;
}

/**
 * Compress base64 image with expert-level settings
 * Optimized for homework screenshots with text/equations
 */
export async function compressBase64Image(
  base64Image: string,
  options: CompressionOptions = {}
): Promise<CompressionResult> {
  const startTime = Date.now();

  // Default settings optimized for homework screenshots
  const settings = {
    maxSizeMB: options.maxSizeMB ?? 0.5,           // 500KB max
    maxWidthOrHeight: options.maxWidthOrHeight ?? 1200,  // 1200px max dimension
    quality: options.quality ?? 0.85,              // 85% quality (optimal for text)
    skipIfSmall: options.skipIfSmall ?? true,
  };

  // Calculate original size (base64 is ~33% larger than actual bytes)
  const originalSize = Math.round((base64Image.length * 0.75) / 1024); // KB
  console.log('[IMAGE_COMPRESSION] 🔍 Original size:', originalSize, 'KB');

  // Skip compression for small images (<500KB)
  if (settings.skipIfSmall && originalSize < 500) {
    console.log('[IMAGE_COMPRESSION] ⚡ Image is small (<500KB), skipping compression');
    return {
      compressed: base64Image,
      originalSize,
      compressedSize: originalSize,
      reductionPercent: 0,
    };
  }

  try {
    console.log('[IMAGE_COMPRESSION] 🗜️  Starting compression...');
    console.log('[IMAGE_COMPRESSION] ⚙️  Settings:', settings);

    // Convert base64 to File (browser-image-compression expects File, not Blob)
    const file = await base64ToFile(base64Image);
    console.log('[IMAGE_COMPRESSION] 📦 File created, size:', Math.round(file.size / 1024), 'KB');

    // Compress using browser-image-compression
    const compressedBlob = await imageCompression(file, {
      maxSizeMB: settings.maxSizeMB,
      maxWidthOrHeight: settings.maxWidthOrHeight,
      useWebWorker: true,              // Don't block UI thread
      fileType: 'image/jpeg',          // JPEG for better compression
      initialQuality: settings.quality,
    });

    console.log('[IMAGE_COMPRESSION] 📦 Compressed blob created, size:', Math.round(compressedBlob.size / 1024), 'KB');

    // Convert back to base64
    const compressedBase64 = await blobToBase64(compressedBlob);
    const compressedSize = Math.round((compressedBase64.length * 0.75) / 1024);
    const reductionPercent = Math.round(((originalSize - compressedSize) / originalSize) * 100);
    const duration = Date.now() - startTime;

    console.log('[IMAGE_COMPRESSION] ✅ Compression complete!');
    console.log('[IMAGE_COMPRESSION] 📊 Results:');
    console.log('[IMAGE_COMPRESSION]    Original:', originalSize, 'KB');
    console.log('[IMAGE_COMPRESSION]    Compressed:', compressedSize, 'KB');
    console.log('[IMAGE_COMPRESSION]    Reduction:', reductionPercent, '%');
    console.log('[IMAGE_COMPRESSION]    Duration:', duration, 'ms');

    return {
      compressed: compressedBase64,
      originalSize,
      compressedSize,
      reductionPercent,
    };
  } catch (error: any) {
    console.error('[IMAGE_COMPRESSION] ❌ Compression failed:', error.message);
    console.error('[IMAGE_COMPRESSION] 🔄 Falling back to original image');

    // Fallback: return original if compression fails
    return {
      compressed: base64Image,
      originalSize,
      compressedSize: originalSize,
      reductionPercent: 0,
    };
  }
}

/**
 * Convert base64 string to File (browser-image-compression expects File, not Blob)
 */
async function base64ToFile(base64: string): Promise<File> {
  // Remove data:image prefix if present
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;

  // Convert base64 to binary string
  const byteString = atob(base64Data);

  // Create array buffer
  const arrayBuffer = new ArrayBuffer(byteString.length);
  const uint8Array = new Uint8Array(arrayBuffer);

  for (let i = 0; i < byteString.length; i++) {
    uint8Array[i] = byteString.charCodeAt(i);
  }

  // Create File from Blob (File extends Blob with name and lastModified)
  return new File([arrayBuffer], 'image.png', { type: 'image/png' });
}

/**
 * Convert Blob to base64 string
 */
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Get image dimensions from base64
 */
export async function getImageDimensions(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = base64;
  });
}
