#!/usr/bin/env node

// Load environment variables
require('dotenv').config();

const { 
  extractPhotoId, 
  logSuccess,
  logError,
  logInfo
} = require('../lib/index.js');

/**
 * First, let's visit the photo page to establish a session like a real browser would
 */
async function establishBrowserSession(photoUrl) {
  try {
    logInfo('🌐 Visiting photo page to establish browser session...');
    
    const response = await fetch(photoUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
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
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load photo page: ${response.status}`);
    }
    
    // Extract cookies
    const cookies = [];
    for (const [name, value] of response.headers.entries()) {
      if (name.toLowerCase() === 'set-cookie') {
        cookies.push(value.split(';')[0]); // Get just the name=value part
      }
    }
    
    // Get the page content to look for any session tokens or CSRFs
    const html = await response.text();
    
    logSuccess(`✅ Session established. Cookies: ${cookies.length}`);
    
    // Look for any CSRF tokens or session info in the HTML
    const csrfMatch = html.match(/csrf[_-]?token["']?\\s*[:=]\\s*["']([^"']+)["']/i);
    const sessionMatch = html.match(/session[_-]?token["']?\\s*[:=]\\s*["']([^"']+)["']/i);
    
    return {
      cookies: cookies.join('; '),
      csrfToken: csrfMatch ? csrfMatch[1] : null,
      sessionToken: sessionMatch ? sessionMatch[1] : null,
      html: html
    };
    
  } catch (error) {
    logError(`Session establishment failed: ${error.message}`);
    return null;
  }
}

/**
 * Try to extract the actual download URL from the page HTML
 */
function extractDownloadUrlFromHtml(html, photoId) {
  // Look for download URLs in the HTML
  const downloadPatterns = [
    new RegExp(`https://[^"'\\s]+/photos/${photoId}/download[^"'\\s]*`, 'gi'),
    new RegExp(`href=["']([^"']*download[^"']*)["']`, 'gi'),
    new RegExp(`data-download[^=]*=["']([^"']*)["']`, 'gi'),
    new RegExp(`download[_-]?url["']?\\s*[:=]\\s*["']([^"']+)["']`, 'gi')
  ];
  
  const foundUrls = [];
  
  for (const pattern of downloadPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1] || match[0];
      if (url && url.includes('download')) {
        foundUrls.push(url);
      }
    }
  }
  
  return [...new Set(foundUrls)]; // Remove duplicates
}

/**
 * Try downloading with established session
 */
async function downloadWithSession(downloadUrl, sessionData) {
  try {
    logInfo(`🔄 Attempting download with session: ${downloadUrl}`);
    
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      'Referer': 'https://unsplash.com/',
      'Cache-Control': 'max-age=0'
    };
    
    // Add cookies if we have them
    if (sessionData && sessionData.cookies) {
      headers['Cookie'] = sessionData.cookies;
    }
    
    // Add CSRF token if we found one
    if (sessionData && sessionData.csrfToken) {
      headers['X-CSRF-Token'] = sessionData.csrfToken;
    }
    
    const response = await fetch(downloadUrl, {
      method: 'GET',
      headers: headers,
      redirect: 'follow'
    });
    
    logInfo(`Response status: ${response.status}`);
    logInfo(`Final URL: ${response.url}`);
    
    if (response.ok) {
      logSuccess(`✅ Download URL found: ${response.url}`);
      return response.url;
    } else {
      logError(`❌ Download failed: ${response.status} ${response.statusText}`);
      
      // Try to get more info from the response
      const text = await response.text().catch(() => 'Could not read response');
      logInfo(`Response body preview: ${text.slice(0, 200)}`);
    }
    
  } catch (error) {
    logError(`Download attempt failed: ${error.message}`);
  }
  
  return null;
}

/**
 * Alternative: try to find image URLs directly from the page source
 */
function extractImageUrlsFromHtml(html, photoId) {
  // Look for high-res image URLs in the page
  const imagePatterns = [
    // Unsplash CDN URLs
    /https:\/\/images\.unsplash\.com\/[^"'\\s]+/gi,
    /https:\/\/plus\.unsplash\.com\/[^"'\\s]+/gi,
    // Photo-specific patterns
    new RegExp(`https://[^"'\\s]*${photoId}[^"'\\s]*\\.(jpg|jpeg|png|webp)`, 'gi'),
    // Look for URLs in data attributes
    /data-[^=]*src[^=]*=["']([^"']*(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    // Look for URLs in JSON data
    /"(?:raw|full|regular)"\\s*:\\s*"([^"]+)"/gi
  ];
  
  const foundUrls = [];
  
  for (const pattern of imagePatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const url = match[1] || match[0];
      if (url && (url.includes('.jpg') || url.includes('.jpeg') || url.includes('.png') || url.includes('.webp'))) {
        foundUrls.push(url);
      }
    }
  }
  
  // Filter and sort by likely quality
  return [...new Set(foundUrls)]
    .filter(url => url.startsWith('http'))
    .sort((a, b) => {
      // Prefer URLs with higher resolution indicators
      const aScore = (a.includes('raw') ? 3 : 0) + (a.includes('full') ? 2 : 0) + (a.includes('w=') ? 1 : 0);
      const bScore = (b.includes('raw') ? 3 : 0) + (b.includes('full') ? 2 : 0) + (b.includes('w=') ? 1 : 0);
      return bScore - aScore;
    });
}

/**
 * Main function
 */
async function main() {
  const photoUrl = process.argv[2] || "https://unsplash.com/photos/a-very-large-cluster-of-stars-in-the-sky-4BEVxOv8pkk";
  const photoId = extractPhotoId(photoUrl);
  
  if (!photoId) {
    logError('Could not extract photo ID from URL');
    process.exit(1);
  }
  
  logSuccess(`📷 Photo ID: ${photoId}`);
  logInfo(`📄 Photo URL: ${photoUrl}`);
  
  // Step 1: Establish browser session
  const sessionData = await establishBrowserSession(photoUrl);
  
  if (!sessionData) {
    logError('Failed to establish browser session');
    process.exit(1);
  }
  
  // Step 2: Look for download URLs in the page
  const downloadUrls = extractDownloadUrlFromHtml(sessionData.html, photoId);
  logInfo(`🔍 Found ${downloadUrls.length} potential download URLs in page`);
  
  for (const url of downloadUrls) {
    logInfo(`   • ${url}`);
  }
  
  // Step 3: Try downloading with each URL
  let finalUrl = null;
  for (const downloadUrl of downloadUrls) {
    finalUrl = await downloadWithSession(downloadUrl, sessionData);
    if (finalUrl) break;
  }
  
  // Step 4: If download URLs failed, try direct image URLs
  if (!finalUrl) {
    logInfo('\\n🖼️  Download URLs failed, trying direct image URLs...');
    const imageUrls = extractImageUrlsFromHtml(sessionData.html, photoId);
    logInfo(`Found ${imageUrls.length} potential image URLs`);
    
    for (let i = 0; i < Math.min(3, imageUrls.length); i++) {
      const url = imageUrls[i];
      logInfo(`   ${i + 1}. ${url}`);
      
      // Test if this URL is accessible
      try {
        const response = await fetch(url, { method: 'HEAD' });
        if (response.ok) {
          logSuccess(`✅ Accessible image URL: ${url}`);
          finalUrl = url;
          break;
        }
      } catch (error) {
        logError(`   Failed: ${error.message}`);
      }
    }
  }
  
  if (finalUrl) {
    console.log(`\\n🎉 SUCCESS! Use this URL:`);
    console.log(finalUrl);
  } else {
    logError('\\n❌ Could not find a working download URL');
  }
}

main();
