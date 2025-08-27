#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { 
  extractPhotoId, 
  sanitizeFilename,
  logSuccess,
  logError,
  logInfo
} = require('../lib/index.js');

/**
 * Download from manually copied browser URL
 */
async function downloadFromManualUrl() {
  const manualUrl = process.argv[2];
  
  if (!manualUrl) {
    console.log(`
🎯 Manual Download Script

Usage: node manual-download.js "<download-url-from-browser>"

Steps:
1. Go to: https://unsplash.com/photos/a-very-large-cluster-of-stars-in-the-sky-4BEVxOv8pkk
2. Right-click the "Download" button
3. Select "Copy Link Address" (Chrome) or "Copy Link" (Safari)
4. Run: node manual-download.js "paste-the-url-here"

Example:
node manual-download.js "https://unsplash.com/photos/4BEVxOv8pkk/download?ixid=..."
`);
    return;
  }
  
  const photoId = extractPhotoId(manualUrl);
  if (!photoId) {
    logError('Could not extract photo ID from URL');
    return;
  }
  
  logSuccess(`Photo ID: ${photoId}`);
  logInfo(`Manual URL: ${manualUrl}`);
  
  try {
    // Try to download using the manual URL
    logInfo('🔄 Starting download with browser-copied URL...');
    
    const response = await fetch(manualUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Sec-Fetch-Dest': 'image',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site',
        'Referer': 'https://unsplash.com/',
      },
      redirect: 'follow'
    });
    
    logInfo(`Response status: ${response.status}`);
    logInfo(`Final URL: ${response.url}`);
    logInfo(`Content-Type: ${response.headers.get('content-type')}`);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    // Generate filename
    const filename = `${sanitizeFilename(photoId)}_manual_download.jpg`;
    const filepath = path.resolve('./downloads', filename);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    
    // Stream download to file
    const fileStream = createWriteStream(filepath);
    await pipeline(response.body, fileStream);
    
    // Get file size
    const stats = await fs.stat(filepath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    logSuccess(`Download complete!`);
    logSuccess(`File: ${filepath}`);
    logSuccess(`Size: ${sizeInMB} MB`);
    logInfo(`Final download URL: ${response.url}`);
    
    // Check if it looks unwatermarked by URL patterns
    const isLikelyUnwatermarked = response.url.includes('ixid=') || 
                                 response.url.includes('plus.unsplash.com') ||
                                 manualUrl.includes('ixid=');
    
    if (isLikelyUnwatermarked) {
      logSuccess('✨ Image appears to be unwatermarked based on URL patterns');
    } else {
      logInfo('⚠️  Cannot determine if image is unwatermarked from URL alone');
    }
    
  } catch (error) {
    logError(`Download failed: ${error.message}`);
  }
}

downloadFromManualUrl();
