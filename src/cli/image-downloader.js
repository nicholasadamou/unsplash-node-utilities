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

const {
  extractPhotoId,
  extractIxidFromUrl,
  downloadUnsplashImage,
  checkFetchAvailable,
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

    // Display download info
    logInfo(`Size: ${options.size}${options.size === 'custom' ? ` (${options.width}x${options.height})` : ''}`);
    logInfo(`Format: ${options.format.toUpperCase()}`);
    logInfo(`Output directory: ${options.output}`);
    if (options.quality !== 80) {
      logInfo(`Quality: ${options.quality}%`);
    }
    if (options.filename) {
      logInfo(`Custom filename: ${options.filename}`);
    }
    console.log('');

    // Prepare download options for the library function
    const downloadOptions = {
      outputDir: options.output,
      filename: options.filename,
      size: options.size,
      format: options.format,
      quality: options.quality,
      width: options.width,
      height: options.height,
      timeout: CONFIG.timeout,
      retries: CONFIG.retries
    };

    // Download the image using the library function
    logInfo('Starting download...');
    const result = await downloadUnsplashImage(photoId, ixid, downloadOptions);

    if (result.success) {
      logSuccess(`Download complete!`);
      logSuccess(`File: ${result.filepath}`);
      logSuccess(`Size: ${result.sizeFormatted}`);

      if (result.hasIxid) {
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
  main
};
