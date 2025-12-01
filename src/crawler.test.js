const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("crawler", function () {
  describe("extractXmlSitemapUrls", function () {
    let extractXmlSitemapUrls;

    beforeEach(function () {
      const crawler = require("./crawler");
      extractXmlSitemapUrls = crawler.extractXmlSitemapUrls;
    });

    it("should extract single URL from XML sitemap", function () {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page1</loc>
          </url>
        </urlset>`;
      const urls = extractXmlSitemapUrls(xml);
      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should extract multiple URLs from XML sitemap", function () {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url>
            <loc>https://example.com/page1</loc>
          </url>
          <url>
            <loc>https://example.com/page2</loc>
          </url>
          <url>
            <loc>https://example.com/page3</loc>
          </url>
        </urlset>`;
      const urls = extractXmlSitemapUrls(xml);
      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
        "https://example.com/page3",
      ]);
    });

    it("should handle empty string", function () {
      const urls = extractXmlSitemapUrls("");
      expect(urls).to.deep.equal([]);
    });

    it("should handle non-string input", function () {
      const urls = extractXmlSitemapUrls(null);
      expect(urls).to.deep.equal([]);
    });

    it("should handle XML without loc tags", function () {
      const xml = "<?xml version=\"1.0\"?><root><item>test</item></root>";
      const urls = extractXmlSitemapUrls(xml);
      expect(urls).to.deep.equal([]);
    });
  });

  describe("isSameOrigin", function () {
    let isSameOrigin;

    beforeEach(function () {
      const crawler = require("./crawler");
      isSameOrigin = crawler.isSameOrigin;
    });

    it("should return true for same protocol, domain, and port", function () {
      const result = isSameOrigin(
        "https://example.com:443/page1",
        "https://example.com:443/page2"
      );
      expect(result).to.be.true;
    });

    it("should return true for same origin with default ports", function () {
      const result = isSameOrigin(
        "https://example.com/page1",
        "https://example.com/page2"
      );
      expect(result).to.be.true;
    });

    it("should return false for different protocol", function () {
      const result = isSameOrigin(
        "http://example.com/page1",
        "https://example.com/page2"
      );
      expect(result).to.be.false;
    });

    it("should return false for different domain", function () {
      const result = isSameOrigin(
        "https://example.com/page1",
        "https://other.com/page2"
      );
      expect(result).to.be.false;
    });

    it("should return false for different port", function () {
      const result = isSameOrigin(
        "https://example.com:443/page1",
        "https://example.com:8080/page2"
      );
      expect(result).to.be.false;
    });

    it("should return false for subdomain differences", function () {
      const result = isSameOrigin(
        "https://example.com/page1",
        "https://subdomain.example.com/page2"
      );
      expect(result).to.be.false;
    });

    it("should return false for malformed URLs", function () {
      const result = isSameOrigin("not a url", "https://example.com");
      expect(result).to.be.false;
    });

    it("should handle query parameters", function () {
      const result = isSameOrigin(
        "https://example.com/page?foo=bar",
        "https://example.com/page?baz=qux"
      );
      expect(result).to.be.true;
    });

    it("should handle fragments", function () {
      const result = isSameOrigin(
        "https://example.com/page#section1",
        "https://example.com/page#section2"
      );
      expect(result).to.be.true;
    });
  });

  describe("crawlSitemap", function () {
    let crawlSitemap, axiosStub, logStub;

    beforeEach(function () {
      axiosStub = {
        get: sinon.stub(),
      };
      logStub = sinon.stub();

      const crawlerModule = proxyquire("./crawler", {
        axios: axiosStub,
      });
      crawlSitemap = crawlerModule.crawlSitemap;
    });

    afterEach(function () {
      sinon.restore();
    });

    it("should process sitemap and extract same-origin URLs", async function () {
      const config = { logLevel: "info" };
      const sitemapUrl = "https://example.com/sitemap.xml";
      const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://example.com/page2</loc></url>
        </urlset>`;
      
      axiosStub.get.resolves({ data: sitemapContent });

      const urls = await crawlSitemap({
        config,
        sitemapUrl,
        log: logStub,
      });

      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
      expect(axiosStub.get.calledOnce).to.be.true;
    });

    it("should filter out cross-origin URLs", async function () {
      const config = { logLevel: "info" };
      const sitemapUrl = "https://example.com/sitemap.xml";
      const sitemapContent = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <url><loc>https://example.com/page1</loc></url>
          <url><loc>https://other.com/page2</loc></url>
        </urlset>`;
      
      axiosStub.get.resolves({ data: sitemapContent });

      const urls = await crawlSitemap({
        config,
        sitemapUrl,
        log: logStub,
      });

      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should handle fetch errors gracefully", async function () {
      const config = { logLevel: "info" };
      const sitemapUrl = "https://example.com/sitemap.xml";
      
      axiosStub.get.rejects(new Error("404 Not Found"));

      const urls = await crawlSitemap({
        config,
        sitemapUrl,
        log: logStub,
      });

      expect(urls).to.deep.equal([]);
      expect(logStub.calledWith(config, "warn")).to.be.true;
    });

    it("should handle non-string content", async function () {
      const config = { logLevel: "info" };
      const sitemapUrl = "https://example.com/sitemap.xml";
      
      axiosStub.get.resolves({ data: { json: "object" } });

      const urls = await crawlSitemap({
        config,
        sitemapUrl,
        log: logStub,
      });

      expect(urls).to.deep.equal([]);
    });
  });
});
