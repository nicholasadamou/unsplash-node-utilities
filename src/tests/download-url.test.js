#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const { 
  extractPhotoId, 
  generateDownloadUrl,
  getUnwatermarkedDownloadUrl,
  logSuccess,
  logError,
  logInfo
} = require('../lib/index.js');

async function testDownloadUrl(photoUrl) {
  const photoId = extractPhotoId(photoUrl);
  
  if (!photoId) {
    logError('Could not extract photo ID');
    return;
  }
  
  logSuccess(`Photo ID: ${photoId}`);
  
  // Test 1: Basic download URL
  const basicDownloadUrl = generateDownloadUrl(photoId);
  logInfo(`Basic download URL: ${basicDownloadUrl}`);
  
  // Test 2: Try to get unwatermarked URL from API
  try {
    const result = await getUnwatermarkedDownloadUrl(photoId);
    if (result.success) {
      logSuccess(`API download URL: ${result.downloadUrl}`);
      logSuccess(`IXID: ${result.ixid}`);
    } else {
      logError(`API download failed: ${result.error}`);
    }
  } catch (error) {
    logError(`API error: ${error.message}`);
  }
  
  // Test 3: Try accessing the basic download URL directly
  logInfo('\\nTesting basic download URL...');
  try {
    const response = await fetch(basicDownloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Unsplash-Test/1.0)',
      },
      redirect: 'follow'
    });
    
    logInfo(`Response status: ${response.status}`);
    logInfo(`Final URL: ${response.url}`);
    
    if (response.ok) {
      const url = new URL(response.url);
      const ixid = url.searchParams.get('ixid');
      if (ixid) {
        logSuccess(`Found ixid in final URL: ${ixid}`);
        const properDownloadUrl = generateDownloadUrl(photoId, ixid);
        logSuccess(`Proper download URL: ${properDownloadUrl}`);
      }
    }
  } catch (error) {
    logError(`Fetch error: ${error.message}`);
  }
}

// Test with the photo URL
const photoUrl = "https://unsplash.com/photos/a-very-large-cluster-of-stars-in-the-sky-4BEVxOv8pkk";
testDownloadUrl(photoUrl);
