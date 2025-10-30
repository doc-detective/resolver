const axios = require("axios");

exports.extractHtmlUrls = extractHtmlUrls;
exports.extractMarkdownUrls = extractMarkdownUrls;
exports.extractXmlSitemapUrls = extractXmlSitemapUrls;
exports.isSameOrigin = isSameOrigin;
exports.resolveRelativeUrl = resolveRelativeUrl;
exports.crawlUrls = crawlUrls;

/**
 * Extracts URLs from HTML <a> tags with href attributes.
 * 
 * @param {string} html - The HTML content to parse
 * @returns {string[]} - Array of extracted URLs
 */
function extractHtmlUrls(html) {
  if (typeof html !== "string") {
    return [];
  }
  
  const urls = [];
  // Match <a> tags with href attributes
  // This regex handles various formats: href="url", href='url', href=url
  const anchorRegex = /<a\s+(?:[^>]*?\s+)?href=["']?([^"'\s>]+)["']?[^>]*>/gi;
  let match;
  
  while ((match = anchorRegex.exec(html)) !== null) {
    const url = match[1];
    if (url && url !== "#" && !url.startsWith("javascript:")) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Extracts URLs from Markdown [text](url) syntax.
 * 
 * @param {string} markdown - The Markdown content to parse
 * @returns {string[]} - Array of extracted URLs
 */
function extractMarkdownUrls(markdown) {
  if (typeof markdown !== "string") {
    return [];
  }
  
  const urls = [];
  // Match [text](url) syntax, handling escaped brackets
  // This regex avoids matching image syntax ![text](url)
  const linkRegex = /(?<!!)\[(?:[^\]\\]|\\.)*\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(markdown)) !== null) {
    const url = match[1].trim();
    // Extract just the URL part, ignoring title text after space
    const urlPart = url.split(/\s+/)[0];
    if (urlPart) {
      urls.push(urlPart);
    }
  }
  
  return urls;
}

/**
 * Extracts URLs from XML sitemap.
 * 
 * @param {string} xml - The XML sitemap content to parse
 * @returns {string[]} - Array of extracted URLs
 */
function extractXmlSitemapUrls(xml) {
  if (typeof xml !== "string") {
    return [];
  }
  
  const urls = [];
  // Match <loc> tags in XML sitemaps
  const locRegex = /<loc>([^<]+)<\/loc>/gi;
  let match;
  
  while ((match = locRegex.exec(xml)) !== null) {
    const url = match[1].trim();
    if (url) {
      urls.push(url);
    }
  }
  
  return urls;
}

/**
 * Compares two URLs for strict origin matching.
 * 
 * @param {string} url1 - First URL to compare
 * @param {string} url2 - Second URL to compare
 * @returns {boolean} - True if origins match strictly (protocol, hostname, and port)
 */
function isSameOrigin(url1, url2) {
  try {
    const parsed1 = new URL(url1);
    const parsed2 = new URL(url2);
    
    // Compare protocol, hostname, and port
    return (
      parsed1.protocol === parsed2.protocol &&
      parsed1.hostname === parsed2.hostname &&
      parsed1.port === parsed2.port
    );
  } catch (error) {
    // If URL parsing fails, they can't be same origin
    return false;
  }
}

/**
 * Resolves a relative URL against a base origin.
 * 
 * @param {string} relativeUrl - The relative URL to resolve
 * @param {string} baseOrigin - The origin to resolve against
 * @returns {string|null} - Resolved absolute URL or null if resolution fails
 */
function resolveRelativeUrl(relativeUrl, baseOrigin) {
  try {
    // Check if it's already absolute
    new URL(relativeUrl);
    return relativeUrl;
  } catch {
    // It's relative, try to resolve
    try {
      const resolved = new URL(relativeUrl, baseOrigin);
      return resolved.href;
    } catch (error) {
      return null;
    }
  }
}

/**
 * Crawls URLs starting from initial inputs, discovering additional URLs by following links.
 * 
 * @param {Object} options - Crawling options
 * @param {Object} options.config - Configuration object
 * @param {string[]} options.initialUrls - Array of initial URLs to crawl
 * @param {Function} options.log - Logging function (optional)
 * @returns {Promise<string[]>} - Promise resolving to array of all discovered URLs
 */
async function crawlUrls({ config, initialUrls, log }) {
  // Default no-op logger if not provided
  const logger = log || (() => {});
  
  const visitedUrls = new Set();
  const discoveredUrls = [];
  const MAX_URLS = 10000;
  let urlQueue = [...initialUrls];
  
  // Process each URL in the queue
  while (urlQueue.length > 0 && discoveredUrls.length < MAX_URLS) {
    const currentUrl = urlQueue.shift();
    
    // Skip if already visited
    if (visitedUrls.has(currentUrl)) {
      continue;
    }
    
    visitedUrls.add(currentUrl);
    discoveredUrls.push(currentUrl);
    
    logger(config, "debug", `Crawling: ${currentUrl}`);
    
    // Fetch the URL content
    let content;
    try {
      const response = await axios.get(currentUrl, {
        timeout: 30000,
        maxRedirects: 5,
      });
      content = response.data;
    } catch (error) {
      logger(config, "warn", `Failed to fetch ${currentUrl}: ${error.message}`);
      continue;
    }
    
    // Extract URLs based on content type
    let extractedUrls = [];
    if (typeof content === "string") {
      // Try HTML, Markdown, and XML sitemap extraction
      extractedUrls = [
        ...extractHtmlUrls(content),
        ...extractMarkdownUrls(content),
        ...extractXmlSitemapUrls(content),
      ];
    }
    
    // Process extracted URLs
    for (const url of extractedUrls) {
      let absoluteUrl;
      
      // Check if URL is relative
      try {
        new URL(url);
        absoluteUrl = url;
      } catch {
        // It's relative
        if (config.origin) {
          absoluteUrl = resolveRelativeUrl(url, config.origin);
          if (!absoluteUrl) {
            continue; // Skip malformed URLs
          }
        } else {
          // No origin configured, skip relative URLs
          logger(
            config,
            "debug",
            `Skipping relative URL (no origin configured): ${url}`
          );
          continue;
        }
      }
      
      // Check if same origin as current URL
      if (isSameOrigin(absoluteUrl, currentUrl)) {
        if (!visitedUrls.has(absoluteUrl)) {
          urlQueue.push(absoluteUrl);
        }
      }
    }
  }
  
  // Log warning if limit reached
  if (discoveredUrls.length >= MAX_URLS) {
    logger(
      config,
      "warn",
      `Crawling stopped: reached maximum limit of ${MAX_URLS} URLs`
    );
  }
  
  return discoveredUrls;
}
