const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("crawler integration", function () {
  let qualifyFiles, axiosStub, fsStub, crawlSitemapStub, readFileStub;

  beforeEach(function () {
    axiosStub = {
      get: sinon.stub(),
    };
    
    fsStub = {
      statSync: sinon.stub(),
      readdirSync: sinon.stub(),
      existsSync: sinon.stub(),
      mkdirSync: sinon.stub(),
      writeFileSync: sinon.stub(),
    };
    
    crawlSitemapStub = sinon.stub();
    readFileStub = sinon.stub().resolves({});
    
    // Mock fetchFile behavior
    axiosStub.get.callsFake(async (url) => {
      if (url.endsWith("sitemap.xml")) {
        return {
          data: `<?xml version="1.0" encoding="UTF-8"?>
            <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
              <url><loc>https://example.com/page1</loc></url>
              <url><loc>https://example.com/page2</loc></url>
            </urlset>`,
        };
      }
      return { data: "" };
    });
    
    const utilsModule = proxyquire("./utils", {
      axios: axiosStub,
      fs: fsStub,
      "./crawler": { crawlSitemap: crawlSitemapStub },
      "doc-detective-common": {
        validate: () => ({ valid: true }),
        resolvePaths: (x) => x,
        transformToSchemaKey: (x) => x,
        readFile: readFileStub,
      },
    });
    
    qualifyFiles = utilsModule.qualifyFiles;
  });

  afterEach(function () {
    sinon.restore();
  });

  it("should process sitemap.xml URLs by default", async function () {
    const config = {
      input: ["https://example.com/sitemap.xml"],
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlSitemapStub.resolves([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlSitemapStub.calledOnce).to.be.true;
    expect(crawlSitemapStub.firstCall.args[0].sitemapUrl).to.equal("https://example.com/sitemap.xml");
  });

  it("should not process non-sitemap URLs", async function () {
    const config = {
      input: ["https://example.com/page.html"],
      logLevel: "info",
      fileTypes: [],
    };
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlSitemapStub.called).to.be.false;
  });

  it("should disable processing when crawl is false", async function () {
    const config = {
      input: ["https://example.com/sitemap.xml"],
      crawl: false,
      logLevel: "info",
      fileTypes: [],
    };
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlSitemapStub.called).to.be.false;
  });

  it("should enable processing when crawl is true", async function () {
    const config = {
      input: ["https://example.com/sitemap.xml"],
      crawl: true,
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlSitemapStub.resolves([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlSitemapStub.calledOnce).to.be.true;
  });

  it("should not process file:// URLs", async function () {
    const config = {
      input: [],
      logLevel: "info",
      fileTypes: [],
    };
    
    await qualifyFiles({ config });
    
    expect(crawlSitemapStub.called).to.be.false;
  });

  it("should log sitemap processing activity", async function () {
    const config = {
      input: ["https://example.com/sitemap.xml"],
      crawl: true,
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlSitemapStub.resolves([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    // Capture console output
    const originalConsoleLog = console.log;
    const logOutput = [];
    console.log = (...args) => {
      logOutput.push(args.join(" "));
      originalConsoleLog(...args);
    };
    
    try {
      await qualifyFiles({ config });
      
      // Check that processing info was logged
      const hasProcessingLog = logOutput.some((msg) => msg.includes("Processing") && msg.includes("sitemap"));
      const hasDiscoveredLog = logOutput.some((msg) => msg.includes("Discovered"));
      
      expect(hasProcessingLog).to.be.true;
      expect(hasDiscoveredLog).to.be.true;
    } finally {
      console.log = originalConsoleLog;
    }
  });
});
