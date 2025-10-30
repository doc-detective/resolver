const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("crawler", function () {
  describe("extractHtmlUrls", function () {
    let extractHtmlUrls;

    beforeEach(function () {
      const crawler = require("./crawler");
      extractHtmlUrls = crawler.extractHtmlUrls;
    });

    it("should extract single URL from HTML", function () {
      const html = '<a href="https://example.com/page1">Link</a>';
      const urls = extractHtmlUrls(html);
      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should extract multiple URLs from HTML", function () {
      const html = `
        <a href="https://example.com/page1">Link 1</a>
        <a href="https://example.com/page2">Link 2</a>
        <a href="https://example.com/page3">Link 3</a>
      `;
      const urls = extractHtmlUrls(html);
      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
        "https://example.com/page3",
      ]);
    });

    it("should handle single and double quotes", function () {
      const html = `
        <a href="https://example.com/page1">Link 1</a>
        <a href='https://example.com/page2'>Link 2</a>
      `;
      const urls = extractHtmlUrls(html);
      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
    });

    it("should ignore anchor links", function () {
      const html = '<a href="#">Anchor</a><a href="https://example.com">Link</a>';
      const urls = extractHtmlUrls(html);
      expect(urls).to.deep.equal(["https://example.com"]);
    });

    it("should ignore javascript: links", function () {
      const html = '<a href="javascript:void(0)">JS Link</a><a href="https://example.com">Link</a>';
      const urls = extractHtmlUrls(html);
      expect(urls).to.deep.equal(["https://example.com"]);
    });

    it("should handle empty string", function () {
      const urls = extractHtmlUrls("");
      expect(urls).to.deep.equal([]);
    });

    it("should handle non-string input", function () {
      const urls = extractHtmlUrls(null);
      expect(urls).to.deep.equal([]);
    });

    it("should extract relative URLs", function () {
      const html = '<a href="/page1">Relative</a><a href="https://example.com">Absolute</a>';
      const urls = extractHtmlUrls(html);
      expect(urls).to.deep.equal(["/page1", "https://example.com"]);
    });
  });

  describe("extractMarkdownUrls", function () {
    let extractMarkdownUrls;

    beforeEach(function () {
      const crawler = require("./crawler");
      extractMarkdownUrls = crawler.extractMarkdownUrls;
    });

    it("should extract single URL from Markdown", function () {
      const markdown = "[Link](https://example.com/page1)";
      const urls = extractMarkdownUrls(markdown);
      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should extract multiple URLs from Markdown", function () {
      const markdown = `
        [Link 1](https://example.com/page1)
        [Link 2](https://example.com/page2)
        [Link 3](https://example.com/page3)
      `;
      const urls = extractMarkdownUrls(markdown);
      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
        "https://example.com/page3",
      ]);
    });

    it("should ignore image syntax", function () {
      const markdown = "![Image](https://example.com/image.png) [Link](https://example.com/page1)";
      const urls = extractMarkdownUrls(markdown);
      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should handle URLs with title text", function () {
      const markdown = '[Link](https://example.com/page1 "Title text")';
      const urls = extractMarkdownUrls(markdown);
      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should handle empty string", function () {
      const urls = extractMarkdownUrls("");
      expect(urls).to.deep.equal([]);
    });

    it("should handle non-string input", function () {
      const urls = extractMarkdownUrls(null);
      expect(urls).to.deep.equal([]);
    });

    it("should extract relative URLs", function () {
      const markdown = "[Relative](/page1) [Absolute](https://example.com)";
      const urls = extractMarkdownUrls(markdown);
      expect(urls).to.deep.equal(["/page1", "https://example.com"]);
    });
  });

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

  describe("resolveRelativeUrl", function () {
    let resolveRelativeUrl;

    beforeEach(function () {
      const crawler = require("./crawler");
      resolveRelativeUrl = crawler.resolveRelativeUrl;
    });

    it("should resolve relative path against origin", function () {
      const result = resolveRelativeUrl(
        "/page1",
        "https://example.com"
      );
      expect(result).to.equal("https://example.com/page1");
    });

    it("should resolve relative path with ../ navigation", function () {
      const result = resolveRelativeUrl(
        "../page1",
        "https://example.com/dir/subdir/"
      );
      expect(result).to.equal("https://example.com/dir/page1");
    });

    it("should resolve absolute path starting with /", function () {
      const result = resolveRelativeUrl(
        "/absolute/path",
        "https://example.com/some/dir"
      );
      expect(result).to.equal("https://example.com/absolute/path");
    });

    it("should return null for malformed relative URLs", function () {
      // Note: URL constructor is quite forgiving, so we need a truly malformed URL
      // In practice, most strings can be parsed as relative URLs
      const result = resolveRelativeUrl(
        "",
        "not a valid base"
      );
      expect(result).to.be.null;
    });

    it("should return absolute URL unchanged", function () {
      const result = resolveRelativeUrl(
        "https://other.com/page",
        "https://example.com"
      );
      expect(result).to.equal("https://other.com/page");
    });

    it("should handle query parameters in relative URLs", function () {
      const result = resolveRelativeUrl(
        "/page?foo=bar",
        "https://example.com"
      );
      expect(result).to.equal("https://example.com/page?foo=bar");
    });

    it("should handle fragments in relative URLs", function () {
      const result = resolveRelativeUrl(
        "/page#section",
        "https://example.com"
      );
      expect(result).to.equal("https://example.com/page#section");
    });
  });

  describe("crawlUrls", function () {
    let crawlUrls, axiosStub, logStub;

    beforeEach(function () {
      axiosStub = {
        get: sinon.stub(),
      };
      logStub = sinon.stub();

      const crawlerModule = proxyquire("./crawler", {
        axios: axiosStub,
      });
      crawlUrls = crawlerModule.crawlUrls;
    });

    afterEach(function () {
      sinon.restore();
    });

    it("should crawl single URL with no links", async function () {
      const config = { logLevel: "info" };
      axiosStub.get.resolves({ data: "<html><body>No links</body></html>" });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal(["https://example.com/page1"]);
      expect(axiosStub.get.calledOnce).to.be.true;
    });

    it("should crawl same-origin links", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get
        .withArgs("https://example.com/page1")
        .resolves({
          data: '<html><a href="https://example.com/page2">Link</a></html>',
        });
      
      axiosStub.get
        .withArgs("https://example.com/page2")
        .resolves({
          data: "<html>No more links</html>",
        });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
      expect(axiosStub.get.calledTwice).to.be.true;
    });

    it("should not crawl cross-origin links", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get.resolves({
        data: '<html><a href="https://other.com/page">External</a></html>',
      });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal(["https://example.com/page1"]);
      expect(axiosStub.get.calledOnce).to.be.true;
    });

    it("should deduplicate URLs", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get
        .withArgs("https://example.com/page1")
        .resolves({
          data: '<html><a href="https://example.com/page2">Link</a></html>',
        });
      
      axiosStub.get
        .withArgs("https://example.com/page2")
        .resolves({
          data: '<html><a href="https://example.com/page1">Back</a></html>',
        });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
      expect(axiosStub.get.calledTwice).to.be.true;
    });

    it("should handle fetch errors gracefully", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get
        .withArgs("https://example.com/page1")
        .resolves({
          data: '<html><a href="https://example.com/page2">Link</a></html>',
        });
      
      axiosStub.get
        .withArgs("https://example.com/page2")
        .rejects(new Error("404 Not Found"));

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
      expect(logStub.calledWith(config, "warn")).to.be.true;
    });

    it("should resolve relative URLs with origin config", async function () {
      const config = { logLevel: "info", origin: "https://example.com" };
      
      axiosStub.get
        .withArgs("https://example.com/page1")
        .resolves({
          data: '<html><a href="/page2">Relative Link</a></html>',
        });
      
      axiosStub.get
        .withArgs("https://example.com/page2")
        .resolves({
          data: "<html>No more links</html>",
        });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
    });

    it("should skip relative URLs without origin config", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get.resolves({
        data: '<html><a href="/page2">Relative Link</a></html>',
      });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal(["https://example.com/page1"]);
      expect(logStub.calledWith(config, "debug", sinon.match(/Skipping relative URL/))).to.be.true;
    });

    it("should extract URLs from Markdown content", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get
        .withArgs("https://example.com/page1")
        .resolves({
          data: "[Link](https://example.com/page2)",
        });
      
      axiosStub.get
        .withArgs("https://example.com/page2")
        .resolves({
          data: "No more links",
        });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal([
        "https://example.com/page1",
        "https://example.com/page2",
      ]);
    });

    it("should handle non-string content", async function () {
      const config = { logLevel: "info" };
      
      axiosStub.get.resolves({ data: { json: "object" } });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page1"],
        log: logStub,
      });

      expect(urls).to.deep.equal(["https://example.com/page1"]);
    });

    it("should enforce 10,000 URL limit", async function () {
      const config = { logLevel: "info" };
      
      // Create a mock that generates many URLs
      let callCount = 0;
      axiosStub.get.callsFake(async (url) => {
        callCount++;
        if (callCount <= 10001) {
          // Generate unique URLs
          return {
            data: `<html><a href="https://example.com/page${callCount}">Link</a></html>`,
          };
        }
        return { data: "<html>No more links</html>" };
      });

      const urls = await crawlUrls({
        config,
        initialUrls: ["https://example.com/page0"],
        log: logStub,
      });

      // Should stop at 10,000 URLs
      expect(urls.length).to.equal(10000);
      expect(logStub.calledWith(config, "warn", sinon.match(/maximum limit/))).to.be.true;
    });
  });
});
