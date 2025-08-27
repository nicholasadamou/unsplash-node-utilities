#!/usr/bin/env node

/**
 * Unsplash Image Downloader
 * 
 * A standalone script to download individual Unsplash images with support for:
 * - Unwatermarked Unsplash+ images using proper ixid parameters
 * - Multiple size options (raw, full, regular, small, thumb, custom)
 * - Premium watermark-free downloads for subscribers
 * - Proper filename handling and directory creation
 * 
 * Usage:
 *   node unsplash-image-downloader.js <url> [options]
 * 
 * Examples:
 *   node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk"
 *   node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk" --size=full --output=./downloads
 *   node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU2MjU5NjgzfA&force=true"
 */

// Load environment variables
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { 
  extractPhotoId, 
  generateDownloadUrl, 
  extractIxidFromUrl,
  fetchImageData,
  sanitizeFilename,
  getImageExtension,
  checkFetchAvailable,
  getUnwatermarkedDownloadUrl,
  logSuccess,
  logError,
  logWarning,
  logInfo
} = require('../lib/index.js');

// Configuration
const CONFIG = {
  defaultOutputDir: './downloads',
  timeout: 30000, // 30 seconds
  retries: 3,
  sizes: {
    raw: 'raw',        // Original full resolution
    full: 'full',      // 2048px on longest edge
    regular: 'regular', // 1080px on longest edge
    small: 'small',    // 400px on longest edge  
    thumb: 'thumb',    // 200px on longest edge
    custom: 'custom'   // Custom size (requires width/height params)
  },
  defaultSize: 'regular'
};

/**
 * Parse command line arguments
 */
function parseArguments() {
  const args = process.argv.slice(2);
  
  // Check for help first
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
🖼️  Unsplash Image Downloader

Usage: node unsplash-image-downloader.js <url> [options]

Arguments:
  url                 Unsplash photo URL or download URL

Options:
  --size=<size>       Image size: raw, full, regular, small, thumb, custom
                      Default: ${CONFIG.defaultSize}
  --width=<width>     Custom width (only with --size=custom)
  --height=<height>   Custom height (only with --size=custom)
  --output=<dir>      Output directory (default: ${CONFIG.defaultOutputDir})
  --filename=<name>   Custom filename (without extension)
  --format=<format>   Image format: jpg, png, webp (default: jpg)
  --quality=<quality> Image quality 1-100 (default: 80)
  --help, -h          Show this help message

Examples:
  # Download regular size image
  node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk"
  
  # Download full size image to specific directory
  node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk" --size=full --output=./images
  
  # Download with custom size and format
  node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk" --size=custom --width=1920 --height=1080 --format=webp
  
  # Download unwatermarked Unsplash+ image (with ixid)
  node unsplash-image-downloader.js "https://unsplash.com/photos/4BEVxOv8pkk/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU2MjU5NjgzfA&force=true"
`);
    process.exit(0);
  }

  const url = args[0];
  const options = {
    size: CONFIG.defaultSize,
    output: CONFIG.defaultOutputDir,
    filename: null,
    width: null,
    height: null,
    format: 'jpg',
    quality: 80
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      
      switch (key) {
        case 'size':
          if (Object.keys(CONFIG.sizes).includes(value)) {
            options.size = value;
          } else {
            logError(`Invalid size: ${value}. Valid sizes: ${Object.keys(CONFIG.sizes).join(', ')}`);
            process.exit(1);
          }
          break;
        case 'width':
          options.width = parseInt(value);
          if (isNaN(options.width) || options.width <= 0) {
            logError('Width must be a positive number');
            process.exit(1);
          }
          break;
        case 'height':
          options.height = parseInt(value);
          if (isNaN(options.height) || options.height <= 0) {
            logError('Height must be a positive number');
            process.exit(1);
          }
          break;
        case 'output':
          options.output = value;
          break;
        case 'filename':
          options.filename = value;
          break;
        case 'format':
          if (['jpg', 'jpeg', 'png', 'webp'].includes(value.toLowerCase())) {
            options.format = value.toLowerCase();
          } else {
            logError('Invalid format. Supported: jpg, png, webp');
            process.exit(1);
          }
          break;
        case 'quality':
          options.quality = parseInt(value);
          if (isNaN(options.quality) || options.quality < 1 || options.quality > 100) {
            logError('Quality must be between 1 and 100');
            process.exit(1);
          }
          break;
        default:
          logWarning(`Unknown option: --${key}`);
          break;
      }
    }
  }

  // Validate custom size options
  if (options.size === 'custom' && (!options.width || !options.height)) {
    logError('Custom size requires both --width and --height parameters');
    process.exit(1);
  }

  return { url, options };
}

/**
 * Build the appropriate download URL based on size and options
 */
async function buildDownloadUrl(photoId, ixid, size, options) {
  // If we have ixid from URL, we can use the unwatermarked download URL
  if (ixid) {
    logInfo(`Found ixid parameter - using unwatermarked Unsplash+ download`);
    return generateDownloadUrl(photoId, ixid);
  }

  // Fetch image data from API to get URLs with ixid
  logInfo(`Fetching image data to extract ixid for unwatermarked download...`);
  
  try {
    const imageData = await fetchImageData(photoId);
    if (!imageData || !imageData.urls) {
      throw new Error('Unable to fetch image data from API');
    }

    // Check if any of the URLs contain ixid for unwatermarked download
    const urlsToCheck = [
      imageData.urls.raw,
      imageData.urls.full,
      imageData.urls.regular,
      imageData.optimized_url
    ];
    
    let extractedIxid = null;
    for (const url of urlsToCheck) {
      if (!url) continue;
      const foundIxid = extractIxidFromUrl(url);
      if (foundIxid) {
        extractedIxid = foundIxid;
        break;
      }
    }
    
    if (extractedIxid) {
      logSuccess(`Found ixid in API response: ${extractedIxid}`);
      logSuccess(`Using direct image URL with ixid (unwatermarked)`);
      // Use the direct image URL that already has ixid instead of download endpoint
      let sizeUrl;
      switch (size) {
        case 'raw':
          sizeUrl = imageData.urls.raw;
          break;
        case 'full':
          sizeUrl = imageData.urls.full;
          break;
        case 'regular':
          sizeUrl = imageData.urls.regular;
          break;
        case 'small':
          sizeUrl = imageData.urls.small;
          break;
        case 'thumb':
          sizeUrl = imageData.urls.thumb;
          break;
        case 'custom':
          sizeUrl = imageData.urls.raw; // Start with raw and add parameters
          break;
        default:
          sizeUrl = imageData.urls.regular;
      }
      
      // If the selected size URL also has ixid, use it directly
      if (sizeUrl && extractIxidFromUrl(sizeUrl)) {
        return sizeUrl;
      }
      
      // Otherwise, use the first URL that had ixid
      for (const url of urlsToCheck) {
        if (url && extractIxidFromUrl(url)) {
          return url;
        }
      }
    }

    // If no ixid found, use size-specific URLs with modifications
    let baseUrl;
    switch (size) {
      case 'raw':
        baseUrl = imageData.urls.raw;
        break;
      case 'full':
        baseUrl = imageData.urls.full;
        break;
      case 'regular':
        baseUrl = imageData.urls.regular;
        break;
      case 'small':
        baseUrl = imageData.urls.small;
        break;
      case 'thumb':
        baseUrl = imageData.urls.thumb;
        break;
      case 'custom':
        baseUrl = imageData.urls.raw; // Start with raw and add parameters
        break;
      default:
        baseUrl = imageData.urls.regular;
    }

    // Add custom parameters if needed
    if (size === 'custom' || options.format !== 'jpg' || options.quality !== 80) {
      const url = new URL(baseUrl);
      
      if (size === 'custom') {
        url.searchParams.set('w', options.width.toString());
        url.searchParams.set('h', options.height.toString());
        url.searchParams.set('fit', 'crop');
        url.searchParams.set('crop', 'entropy');
      }
      
      if (options.format !== 'jpg') {
        url.searchParams.set('fm', options.format);
      }
      
      if (options.quality !== 80) {
        url.searchParams.set('q', options.quality.toString());
      }
      
      baseUrl = url.toString();
    }

    logWarning('No ixid found - image may be watermarked');
    return baseUrl;
  } catch (error) {
    logError(`Failed to fetch image data: ${error.message}`);
    // Final fallback to basic download URL
    return generateDownloadUrl(photoId, null);
  }
}

/**
 * Download image with retry logic and timeout
 */
async function downloadImage(url, filepath, retries = CONFIG.retries) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      logInfo(`Downloading from: ${url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Unsplash-Image-Downloader/1.0)',
          'Accept': 'image/*,*/*;q=0.8',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Get content type for file extension if not specified
      const contentType = response.headers.get('content-type');
      let detectedExtension = 'jpg'; // default
      if (contentType) {
        if (contentType.includes('png')) detectedExtension = 'png';
        else if (contentType.includes('webp')) detectedExtension = 'webp';
        else if (contentType.includes('jpeg') || contentType.includes('jpg')) detectedExtension = 'jpg';
      }

      // Update filepath with correct extension if needed
      const currentExt = path.extname(filepath).slice(1);
      if (currentExt !== detectedExtension) {
        filepath = filepath.replace(path.extname(filepath), `.${detectedExtension}`);
      }

      // Ensure directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true });

      // Stream download to file
      const fileStream = createWriteStream(filepath);
      await pipeline(response.body, fileStream);

      // Get file size
      const stats = await fs.stat(filepath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

      return { 
        success: true, 
        filepath,
        size: stats.size,
        sizeFormatted: `${sizeInMB} MB`
      };
    } catch (error) {
      logWarning(`Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt === retries) {
        return {
          success: false,
          error: error.message,
          filepath
        };
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

/**
 * Generate filename based on photo ID and options
 */
function generateFilename(photoId, options, imageData = null) {
  if (options.filename) {
    return `${sanitizeFilename(options.filename)}.${options.format}`;
  }

  // Create descriptive filename
  let filename = sanitizeFilename(photoId);
  
  // Add size info
  if (options.size === 'custom') {
    filename += `_${options.width}x${options.height}`;
  } else {
    filename += `_${options.size}`;
  }

  // Add author name if available
  if (imageData && imageData.image_author) {
    const authorName = sanitizeFilename(imageData.image_author.replace(/\s+/g, '-'));
    filename += `_by_${authorName}`;
  }

  return `${filename}.${options.format}`;
}

/**
 * Main function
 */
async function main() {
  // Check Node.js version and fetch availability
  if (!checkFetchAvailable()) {
    process.exit(1);
  }

  // Parse command line arguments
  const { url, options } = parseArguments();
  
  console.log('🖼️  Unsplash Image Downloader\n');

  try {
    // Extract photo ID from URL
    const photoId = extractPhotoId(url);
    if (!photoId) {
      logError('Could not extract photo ID from URL');
      logInfo('Please provide a valid Unsplash photo URL');
      logInfo('Example: https://unsplash.com/photos/4BEVxOv8pkk');
      process.exit(1);
    }

    logSuccess(`Extracted photo ID: ${photoId}`);

    // Extract ixid from URL if present (for Unsplash+ unwatermarked downloads)
    const ixid = extractIxidFromUrl(url);
    if (ixid) {
      logSuccess(`Found ixid: ${ixid} (Unsplash+ premium download)`);
    }

    // Build download URL
    logInfo(`Building ${options.size} size download URL...`);
    const downloadUrl = await buildDownloadUrl(photoId, ixid, options.size, options);

    // Fetch image metadata for better filename
    let imageData = null;
    try {
      imageData = await fetchImageData(photoId);
      if (imageData) {
        logSuccess(`Image by: ${imageData.image_author}`);
        if (imageData.description) {
          logInfo(`Description: ${imageData.description.slice(0, 100)}${imageData.description.length > 100 ? '...' : ''}`);
        }
      }
    } catch (error) {
      logWarning('Could not fetch image metadata, using basic filename');
    }

    // Generate filename and full path
    const filename = generateFilename(photoId, options, imageData);
    const filepath = path.resolve(options.output, filename);

    logInfo(`Output: ${filepath}`);
    logInfo(`Size: ${options.size}${options.size === 'custom' ? ` (${options.width}x${options.height})` : ''}`);
    logInfo(`Format: ${options.format.toUpperCase()}`);
    if (options.quality !== 80) {
      logInfo(`Quality: ${options.quality}%`);
    }
    console.log('');

    // Check if file already exists
    try {
      await fs.access(filepath);
      logWarning(`File already exists: ${filepath}`);
      logInfo('Delete the existing file or use --filename option to specify a different name');
      process.exit(1);
    } catch {
      // File doesn't exist, proceed with download
    }

    // Download the image
    logInfo('Starting download...');
    const result = await downloadImage(downloadUrl, filepath);

    if (result.success) {
      logSuccess(`Download complete!`);
      logSuccess(`File: ${result.filepath}`);
      logSuccess(`Size: ${result.sizeFormatted}`);
      
      if (ixid) {
        logSuccess('✨ Downloaded unwatermarked Unsplash+ version');
      }
    } else {
      logError(`Download failed: ${result.error}`);
      process.exit(1);
    }

  } catch (error) {
    logError(`Script failed: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = {
  parseArguments,
  buildDownloadUrl,
  downloadImage,
  generateFilename,
  main
};
