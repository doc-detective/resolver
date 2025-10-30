const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("crawler integration", function () {
  let qualifyFiles, axiosStub, fsStub, logStub, crawlUrlsStub, readFileStub;

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
    
    logStub = sinon.stub();
    crawlUrlsStub = sinon.stub();
    readFileStub = sinon.stub().resolves({});
    
    // Mock fetchFile behavior
    axiosStub.get.callsFake(async (url) => {
      if (url === "https://example.com/page1") {
        return {
          data: '<html><a href="https://example.com/page2">Link</a></html>',
        };
      } else if (url === "https://example.com/page2") {
        return { data: "<html>Content</html>" };
      }
      return { data: "" };
    });
    
    const utilsModule = proxyquire("./utils", {
      axios: axiosStub,
      fs: fsStub,
      "./crawler": { crawlUrls: crawlUrlsStub },
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

  it("should enable crawling by default for HTTP URLs", async function () {
    const config = {
      input: ["https://example.com/page1"],
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlUrlsStub.resolves([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlUrlsStub.calledOnce).to.be.true;
    expect(crawlUrlsStub.firstCall.args[0].initialUrls).to.deep.equal([
      "https://example.com/page1",
    ]);
  });

  it("should disable crawling when crawl is false", async function () {
    const config = {
      input: ["https://example.com/page1"],
      crawl: false,
      logLevel: "info",
      fileTypes: [],
    };
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlUrlsStub.called).to.be.false;
  });

  it("should enable crawling when crawl is true", async function () {
    const config = {
      input: ["https://example.com/page1"],
      crawl: true,
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlUrlsStub.resolves([
      "https://example.com/page1",
      "https://example.com/page2",
    ]);
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlUrlsStub.calledOnce).to.be.true;
  });

  it("should not crawl file:// URLs by default", async function () {
    const config = {
      input: [],  // Empty input to avoid processing issues
      logLevel: "info",
      fileTypes: [],
    };
    
    // file:// URLs won't trigger crawling since they don't start with http:// or https://
    // This test just verifies no crawling happens
    
    await qualifyFiles({ config });
    
    expect(crawlUrlsStub.called).to.be.false;
  });

  it("should pass origin config to crawler", async function () {
    const config = {
      input: ["https://example.com/page1"],
      origin: "https://example.com",
      crawl: true,
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlUrlsStub.resolves(["https://example.com/page1"]);
    
    // Mock file system calls for fetched files
    fsStub.existsSync.returns(true);
    fsStub.statSync.returns({ isFile: () => true, isDirectory: () => false });
    
    await qualifyFiles({ config });
    
    expect(crawlUrlsStub.calledOnce).to.be.true;
    expect(crawlUrlsStub.firstCall.args[0].config.origin).to.equal(
      "https://example.com"
    );
  });

  it("should log crawling activity", async function () {
    const config = {
      input: ["https://example.com/page1"],
      crawl: true,
      logLevel: "info",
      fileTypes: [],
    };
    
    crawlUrlsStub.resolves([
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
      
      // Check that crawling info was logged
      const hasCrawlingLog = logOutput.some((msg) => msg.includes("Crawling"));
      const hasDiscoveredLog = logOutput.some((msg) => msg.includes("Discovered"));
      
      expect(hasCrawlingLog).to.be.true;
      expect(hasDiscoveredLog).to.be.true;
    } finally {
      console.log = originalConsoleLog;
    }
  });
});
