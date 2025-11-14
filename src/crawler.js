const axios = require("axios");

exports.extractXmlSitemapUrls = extractXmlSitemapUrls;
exports.isSameOrigin = isSameOrigin;
exports.crawlSitemap = crawlSitemap;

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
 * Processes an XML sitemap and extracts all URLs.
 * 
 * @param {Object} options - Crawling options
 * @param {Object} options.config - Configuration object
 * @param {string} options.sitemapUrl - URL of the sitemap to process
 * @param {Function} options.log - Logging function (optional)
 * @returns {Promise<string[]>} - Promise resolving to array of all discovered URLs
 */
async function crawlSitemap({ config, sitemapUrl, log }) {
  // Default no-op logger if not provided
  const logger = log || (() => {});
  
  const discoveredUrls = [];
  
  logger(config, "debug", `Processing sitemap: ${sitemapUrl}`);
  
  // Fetch the sitemap content
  let content;
  let finalUrl = sitemapUrl;
  try {
    const response = await axios.get(sitemapUrl, {
      timeout: 30000,
      maxRedirects: 5,
    });
    content = response.data;
    
    // Use the final URL after redirects for origin comparison
    if (response.request && response.request.res && response.request.res.responseUrl) {
      finalUrl = response.request.res.responseUrl;
      logger(config, "debug", `Sitemap redirected to: ${finalUrl}`);
    }
  } catch (error) {
    logger(config, "warn", `Failed to fetch sitemap ${sitemapUrl}: ${error.message}`);
    return discoveredUrls;
  }
  
  // Extract URLs from sitemap
  if (typeof content === "string") {
    const extractedUrls = extractXmlSitemapUrls(content);
    
    // Filter URLs to only include same-origin URLs (using final URL after redirects)
    for (const url of extractedUrls) {
      if (isSameOrigin(url, finalUrl)) {
        discoveredUrls.push(url);
      } else {
        logger(config, "debug", `Skipping cross-origin URL: ${url}`);
      }
    }
  }
  
  logger(config, "info", `Discovered ${discoveredUrls.length} URL(s) from sitemap`);
  
  return discoveredUrls;
}
