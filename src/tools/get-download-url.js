#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const { 
  extractPhotoId, 
  generateDownloadUrl,
  extractIxidFromUrl,
  fetchImageData,
  logSuccess,
  logError,
  logInfo
} = require('../lib/index.js');

async function getProperDownloadUrl(photoUrl) {
  const photoId = extractPhotoId(photoUrl);
  
  if (!photoId) {
    logError('Could not extract photo ID');
    return null;
  }
  
  logSuccess(`Photo ID: ${photoId}`);
  
  try {
    // Get image data which includes URLs with ixid
    const imageData = await fetchImageData(photoId);
    
    if (!imageData || !imageData.urls) {
      logError('Could not fetch image data');
      return null;
    }
    
    // Check if any of the URLs contain ixid
    const urlsToCheck = [
      imageData.urls.raw,
      imageData.urls.full,
      imageData.urls.regular,
      imageData.optimized_url
    ];
    
    for (const url of urlsToCheck) {
      if (!url) continue;
      
      const ixid = extractIxidFromUrl(url);
      if (ixid) {
        const downloadUrl = generateDownloadUrl(photoId, ixid);
        logSuccess(`Found ixid: ${ixid}`);
        logSuccess(`Unwatermarked download URL: ${downloadUrl}`);
        return downloadUrl;
      }
    }
    
    logInfo('No ixid found in any URL - using basic download URL');
    const basicUrl = generateDownloadUrl(photoId);
    logInfo(`Basic download URL: ${basicUrl}`);
    return basicUrl;
    
  } catch (error) {
    logError(`Error: ${error.message}`);
    return null;
  }
}

// Test with the photo URL
const photoUrl = process.argv[2] || "https://unsplash.com/photos/a-very-large-cluster-of-stars-in-the-sky-4BEVxOv8pkk";

console.log('🔍 Getting proper download URL...\n');

getProperDownloadUrl(photoUrl).then(url => {
  if (url) {
    console.log(`\n✨ Use this URL for unwatermarked download:\n${url}`);
  }
});
