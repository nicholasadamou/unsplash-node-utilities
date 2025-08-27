#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const https = require('https');
const { URL } = require('url');
const { 
  extractPhotoId, 
  generateDownloadUrl,
  logSuccess,
  logError,
  logInfo
} = require('../lib/index.js');

/**
 * Follow redirects manually to mimic browser behavior
 */
async function followRedirects(url, maxRedirects = 5) {
  let currentUrl = url;
  let redirectCount = 0;
  
  while (redirectCount < maxRedirects) {
    logInfo(`Following URL: ${currentUrl}`);
    
    try {
      const response = await fetch(currentUrl, {
        method: 'HEAD', // Just get headers first
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0'
        },
        redirect: 'manual' // Don't auto-follow redirects
      });
      
      logInfo(`Response status: ${response.status}`);
      
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          logSuccess(`Redirect to: ${location}`);
          currentUrl = location;
          redirectCount++;
          continue;
        }
      }
      
      if (response.status === 200) {
        logSuccess(`Final URL found: ${currentUrl}`);
        return currentUrl;
      }
      
      logError(`Unexpected status: ${response.status}`);
      return null;
      
    } catch (error) {
      logError(`Error following redirect: ${error.message}`);
      return null;
    }
  }
  
  logError(`Too many redirects (${maxRedirects})`);
  return null;
}

/**
 * Try different approaches to get unwatermarked download URL
 */
async function getBrowserDownloadUrl(photoId) {
  const approaches = [
    // Approach 1: Basic download URL (what browser would hit first)
    {
      name: "Basic download URL",
      url: `https://unsplash.com/photos/${photoId}/download?force=true`
    },
    // Approach 2: Download URL with client_id
    {
      name: "Download URL with client_id",
      url: `https://unsplash.com/photos/${photoId}/download?client_id=${process.env.UNSPLASH_ACCESS_KEY}&force=true`
    },
    // Approach 3: Try the download trigger endpoint
    {
      name: "Download trigger endpoint",
      url: `https://api.unsplash.com/photos/${photoId}/download`,
      headers: {
        'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        'Accept': 'application/json'
      }
    }
  ];
  
  for (const approach of approaches) {
    logInfo(`\\nTrying: ${approach.name}`);
    
    try {
      if (approach.name === "Download trigger endpoint") {
        // For API endpoint, get the JSON response first
        const response = await fetch(approach.url, {
          headers: {
            'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.url) {
            logSuccess(`API returned download URL: ${data.url}`);
            return data.url;
          }
        } else {
          logError(`API response: ${response.status} ${response.statusText}`);
        }
      } else {
        // For web endpoints, follow redirects
        const finalUrl = await followRedirects(approach.url);
        if (finalUrl && finalUrl !== approach.url) {
          return finalUrl;
        }
      }
    } catch (error) {
      logError(`${approach.name} failed: ${error.message}`);
    }
  }
  
  return null;
}

/**
 * Download with full browser simulation
 */
async function downloadLikeBrowser(url, outputPath) {
  try {
    logInfo(`\\nDownloading like browser from: ${url}`);
    
    const response = await fetch(url, {
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
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Referer': 'https://unsplash.com/',
      },
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    logSuccess(`Download successful! Final URL: ${response.url}`);
    logInfo(`Content-Type: ${response.headers.get('content-type')}`);
    logInfo(`Content-Length: ${response.headers.get('content-length')}`);
    
    return {
      success: true,
      response: response,
      finalUrl: response.url
    };
    
  } catch (error) {
    logError(`Browser download failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// Main function
async function main() {
  const photoUrl = process.argv[2] || "https://unsplash.com/photos/a-very-large-cluster-of-stars-in-the-sky-4BEVxOv8pkk";
  const photoId = extractPhotoId(photoUrl);
  
  if (!photoId) {
    logError('Could not extract photo ID from URL');
    process.exit(1);
  }
  
  logSuccess(`Photo ID: ${photoId}`);
  
  // Try to get the proper download URL using browser-like behavior
  const downloadUrl = await getBrowserDownloadUrl(photoId);
  
  if (downloadUrl) {
    logSuccess(`\\nFound download URL: ${downloadUrl}`);
    
    // Test the download
    const result = await downloadLikeBrowser(downloadUrl);
    
    if (result.success) {
      console.log(`\\n✨ Success! Use this URL for unwatermarked download:`);
      console.log(result.finalUrl);
    }
  } else {
    logError('Could not find working download URL');
  }
}

main();
