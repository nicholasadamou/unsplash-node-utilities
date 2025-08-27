# Unsplash Node.js Utilities

A comprehensive collection of Node.js utilities for Unsplash image management, including batch downloading, caching, and API integration with support for premium Unsplash+ content.

## Features

- 🖼️ **Batch Image Downloading** - Download multiple images from Unsplash with concurrent processing
- 🎯 **Smart Caching System** - Build-time and runtime caching with Redis support
- 🔐 **Premium Unsplash+ Support** - Watermark-free image access for subscribers
- 📋 **Manifest Generation** - Create static manifests for build-time optimization
- 🧹 **Cleanup Tools** - Remove unused cached images and clean storage
- ✅ **API Compliance** - Automatic download tracking and attribution handling
- 🔍 **URL Utilities** - Convert Unsplash page URLs to direct download links
- 📊 **Progress Tracking** - Real-time progress bars and detailed logging

## Installation

```bash
# Install as a dependency
npm install @nicholasadamou/unsplash-node-utilities

# Or install globally for CLI usage
npm install -g @nicholasadamou/unsplash-node-utilities
```

## Quick Start

### 1. Environment Setup

Create a `.env` file with your Unsplash API credentials:

```bash
UNSPLASH_ACCESS_KEY=your-access-key-here
UNSPLASH_SECRET_KEY=your-secret-key-here  # Required for Unsplash+ premium access

# Optional: Redis Cache Configuration
REDIS_URL=your-redis-url
# OR
UPSTASH_REDIS_REST_URL=your-upstash-url
```

### 2. Build Image Cache Manifest

```bash
# Scan content directory and build manifest
npm run cache:build

# Or use CLI
unsplash-build-cache
```

### 3. Download Images

```bash
# Download all images from manifest
npm run download

# Or use CLI
unsplash-download
```

## CLI Tools

The package provides several CLI utilities:

### Cache Management

```bash
# Build cache manifest from content files
unsplash-build-cache

# Runtime image caching
unsplash-cache
```

### Image Downloads

```bash
# Download images from manifest
unsplash-download

# Clean unused images
unsplash-clean
```

### Single Image Downloads

```bash
# Download individual images with size options
unsplash-image-downloader "https://unsplash.com/photos/example-abc123"

# Download specific size to custom directory
unsplash-image-downloader "https://unsplash.com/photos/example-abc123" --size=full --output=./images

# Download with custom dimensions and format
unsplash-image-downloader "https://unsplash.com/photos/example-abc123" --size=custom --width=1920 --height=1080 --format=webp --quality=90

# Download unwatermarked Unsplash+ image (with ixid)
unsplash-image-downloader "https://unsplash.com/photos/example-abc123/download?ixid=M3wxMjA3fDB8MXxhbGx8fHx8fHx8fHwxNzU2MjU5NjgzfA&force=true"
```

### Utilities

```bash
# Verify Unsplash account and API access
unsplash-verify

# Convert Unsplash page URLs to download URLs
unsplash-url-to-download "https://unsplash.com/photos/example-abc123"
```

## API Usage

### Core Library

```javascript
const {
  extractPhotoId,
  fetchImageData,
  createPremiumUnsplashUrl,
  scanMdxFiles
} = require('@nicholasadamou/unsplash-node-utilities');
// Or directly from the library:
// const { ... } = require('@nicholasadamou/unsplash-node-utilities/src/lib');

// Extract photo ID from various URL formats
const photoId = extractPhotoId('https://unsplash.com/photos/beautiful-sunset-abc123');

// Fetch image data with automatic premium optimization
const imageData = await fetchImageData(photoId);

// Scan content files for Unsplash URLs
const urls = await scanMdxFiles('./content');
```

### URL Utilities

```javascript
const {
  generateDownloadUrl,
  convertToDownloadUrl,
  createPremiumUnsplashUrl
} = require('@nicholasadamou/unsplash-node-utilities');

// Generate direct download URL
const downloadUrl = generateDownloadUrl('abc123', 'optional-ixid');

// Convert page URL to download URL with ixid fetching
const result = await convertToDownloadUrl(
  'https://unsplash.com/photos/beautiful-sunset-abc123',
  true // fetch ixid for better tracking
);

// Create premium watermark-free URL
const premiumUrl = createPremiumUnsplashUrl(
  'https://plus.unsplash.com/premium-photo-123',
  'abc123',
  1200, // width
  80    // quality
);
```

### File System Utilities

```javascript
const {
  scanMdxFiles,
  sanitizeFilename,
  getImageExtension
} = require('@nicholasadamou/unsplash-node-utilities');

// Scan MDX files for Unsplash URLs
const urls = await scanMdxFiles('./content');

// Sanitize filenames for safe storage
const safeFilename = sanitizeFilename('Photo by John Doe!.jpg');

// Get image extension from URL
const extension = getImageExtension('https://images.unsplash.com/photo-123?fm=webp');
```

## Configuration

The library includes configurable settings:

```javascript
const { CONFIG } = require('@nicholasadamou/unsplash-node-utilities');

// Available configurations:
// {
//   timeout: 10000,  // 10 seconds timeout for HTTP requests
//   userAgent: 'Mozilla/5.0 (compatible; Unsplash-Script-Library/1.0)',
//   retries: 2,      // Number of retry attempts
//   rateLimitDelay: 100  // Milliseconds between API calls
// }
```

## Premium Unsplash+ Features

### Watermark Removal

The utilities automatically handle premium content when:

1. You have an Unsplash+ subscription
2. Your API application is linked to your subscription
3. The `UNSPLASH_SECRET_KEY` is configured
4. The image URL is from `plus.unsplash.com`

### Premium URL Optimization

```javascript
const premiumUrl = createPremiumUnsplashUrl(
  'https://plus.unsplash.com/premium-photo-123',
  'abc123',
  1200, // width
  80    // quality
);
```

## Error Handling

The library implements comprehensive error handling:

- **Graceful Degradation** - Functions return null or default values instead of throwing
- **Timeout Protection** - HTTP requests include configurable timeouts  
- **Rate Limit Awareness** - Detects and handles API rate limit responses
- **Retry Logic** - Built-in retry mechanisms for failed operations

## API Compliance

The utilities ensure automatic compliance with Unsplash API requirements:

- ✅ **Download Tracking** - Automatically triggers download endpoints
- ✅ **Attribution Handling** - Preserves photographer attribution data
- ✅ **Rate Limit Respect** - Implements delays and retry logic
- ✅ **Terms Compliance** - Follows Unsplash API terms of service

## Integration Examples

### Next.js Project

```bash
# Install in your Next.js project
npm install @nicholasadamou/unsplash-node-utilities

# Add to package.json scripts
{
  "scripts": {
    "prebuild": "npm-run-all unsplash:cache unsplash:download",
    "unsplash:cache": "unsplash-build-cache",
    "unsplash:download": "unsplash-download"
  }
}
```

### Build Integration

```javascript
// scripts/build-images.js
const { scanMdxFiles, fetchImageData } = require('@nicholasadamou/unsplash-node-utilities');

async function buildImageCache() {
  const urls = await scanMdxFiles('./content');
  const manifest = {};
  
  for (const url of urls) {
    const photoId = extractPhotoId(url);
    if (photoId) {
      const data = await fetchImageData(photoId);
      if (data) manifest[photoId] = data;
    }
  }
  
  // Save manifest...
}
```

## Project Structure

The project is organized as follows:

```
unsplash-node-utilities/
├── src/
│   ├── lib/           # Core library functionality
│   │   └── index.js   # Main library exports
│   ├── cli/           # Command-line interface tools
│   │   ├── build-cache.js
│   │   ├── cache.js
│   │   ├── clean.js
│   │   ├── download.js
│   │   ├── image-downloader.js
│   │   ├── url-to-download.js
│   │   └── verify.js
│   ├── tools/         # Development and debugging tools
│   │   ├── browser-download.js
│   │   ├── get-download-url.js
│   │   ├── manual-download.js
│   │   └── simulate-browser.js
│   └── tests/         # Test files
│       ├── download-url.test.js
│       ├── fallback.test.js
│       └── integration.test.js
├── package.json
├── README.md
└── LICENSE
```

### Directory Purpose

- **`src/lib/`** - Core library functionality exported as the main module
- **`src/cli/`** - Executable scripts available as npm bin commands
- **`src/tools/`** - Development tools for debugging and testing
- **`src/tests/`** - Test suites for validating functionality

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- 📖 [Documentation](https://github.com/nicholasadamou/unsplash-node-utilities)
- 🐛 [Issue Tracker](https://github.com/nicholasadamou/unsplash-node-utilities/issues)
- 💬 [Discussions](https://github.com/nicholasadamou/unsplash-node-utilities/discussions)

---

Made with ❤️ for the developer community
