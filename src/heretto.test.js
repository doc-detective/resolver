const sinon = require("sinon");
const proxyquire = require("proxyquire");
const path = require("path");
const os = require("os");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Heretto Integration", function () {
  let heretto;
  let axiosCreateStub;
  let mockClient;

  beforeEach(function () {
    // Create mock axios client
    mockClient = {
      get: sinon.stub(),
      post: sinon.stub(),
    };

    // Stub axios.create to return our mock client
    axiosCreateStub = sinon.stub().returns(mockClient);

    // Use proxyquire to inject stubbed axios
    heretto = proxyquire("../src/heretto", {
      axios: {
        create: axiosCreateStub,
      },
    });
  });

  afterEach(function () {
    sinon.restore();
  });

  describe("createAuthHeader", function () {
    it("should create a Base64-encoded auth header", function () {
      const authHeader = heretto.createAuthHeader("user@example.com", "token123");
      
      // Base64 of "user@example.com:token123"
      const expected = Buffer.from("user@example.com:token123").toString("base64");
      expect(authHeader).to.equal(expected);
    });

    it("should handle special characters in credentials", function () {
      const authHeader = heretto.createAuthHeader("user@example.com", "p@ss:w0rd!");
      
      const expected = Buffer.from("user@example.com:p@ss:w0rd!").toString("base64");
      expect(authHeader).to.equal(expected);
    });
  });

  describe("createApiClient", function () {
    it("should create an axios client with correct config", function () {
      const herettoConfig = {
        organizationId: "thunderbird",
        username: "user@example.com",
        apiToken: "token123",
      };

      heretto.createApiClient(herettoConfig);

      expect(axiosCreateStub.calledOnce).to.be.true;
      const createConfig = axiosCreateStub.firstCall.args[0];
      expect(createConfig.baseURL).to.equal("https://thunderbird.heretto.com/ezdnxtgen/api/v2");
      expect(createConfig.headers.Authorization).to.include("Basic ");
      expect(createConfig.headers["Content-Type"]).to.equal("application/json");
    });
  });

  describe("findScenario", function () {
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should return scenarioId and fileId when valid scenario is found", async function () {
      const existingScenario = {
        id: "scenario-123",
        name: "Doc Detective",
      };

      const scenarioParameters = {
        content: [
          { name: "transtype", value: "dita" },
          { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
          { type: "file_uuid_picker", value: "file-uuid-456" },
        ],
      };

      mockClient.get
        .onFirstCall().resolves({
          data: { content: [existingScenario, { id: "other", name: "Other" }] },
        })
        .onSecondCall().resolves({ data: scenarioParameters });

      const result = await heretto.findScenario(mockClient, mockLog, mockConfig, "Doc Detective");

      expect(result).to.deep.equal({
        scenarioId: "scenario-123",
        fileId: "file-uuid-456",
      });
      expect(mockClient.get.calledTwice).to.be.true;
    });

    it("should return null if scenario is not found", async function () {
      mockClient.get.resolves({
        data: { content: [{ id: "other", name: "Other Scenario" }] },
      });

      const result = await heretto.findScenario(mockClient, mockLog, mockConfig, "Doc Detective");

      expect(result).to.be.null;
      expect(mockClient.get.calledOnce).to.be.true;
    });

    it("should return null if scenario fetch fails", async function () {
      mockClient.get.rejects(new Error("Network error"));

      const result = await heretto.findScenario(mockClient, mockLog, mockConfig, "Doc Detective");

      expect(result).to.be.null;
    });

    it("should return null if transtype parameter is incorrect", async function () {
      const existingScenario = {
        id: "scenario-123",
        name: "Doc Detective",
      };

      const scenarioParameters = {
        content: [
          { name: "transtype", value: "html5" },
          { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
          { type: "file_uuid_picker", value: "file-uuid-456" },
        ],
      };

      mockClient.get
        .onFirstCall().resolves({
          data: { content: [existingScenario] },
        })
        .onSecondCall().resolves({ data: scenarioParameters });

      const result = await heretto.findScenario(mockClient, mockLog, mockConfig, "Doc Detective");

      expect(result).to.be.null;
    });

    it("should return null if tool-kit-name parameter is missing", async function () {
      const existingScenario = {
        id: "scenario-123",
        name: "Doc Detective",
      };

      const scenarioParameters = {
        content: [
          { name: "transtype", value: "dita" },
          { type: "file_uuid_picker", value: "file-uuid-456" },
        ],
      };

      mockClient.get
        .onFirstCall().resolves({
          data: { content: [existingScenario] },
        })
        .onSecondCall().resolves({ data: scenarioParameters });

      const result = await heretto.findScenario(mockClient, mockLog, mockConfig, "Doc Detective");

      expect(result).to.be.null;
    });

    it("should return null if file_uuid_picker parameter is missing", async function () {
      const existingScenario = {
        id: "scenario-123",
        name: "Doc Detective",
      };

      const scenarioParameters = {
        content: [
          { name: "transtype", value: "dita" },
          { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
        ],
      };

      mockClient.get
        .onFirstCall().resolves({
          data: { content: [existingScenario] },
        })
        .onSecondCall().resolves({ data: scenarioParameters });

      const result = await heretto.findScenario(mockClient, mockLog, mockConfig, "Doc Detective");

      expect(result).to.be.null;
    });
  });

  describe("triggerPublishingJob", function () {
    it("should trigger a publishing job", async function () {
      const expectedJob = {
        jobId: "job-123",
        status: "PENDING",
      };

      mockClient.post.resolves({ data: expectedJob });

      const result = await heretto.triggerPublishingJob(mockClient, "file-uuid", "scenario-id");

      expect(result).to.deep.equal(expectedJob);
      expect(mockClient.post.calledOnce).to.be.true;
      expect(mockClient.post.firstCall.args[0]).to.equal("/files/file-uuid/publishes");
      expect(mockClient.post.firstCall.args[1]).to.deep.equal({ scenario: "scenario-id", parameters: [] });
    });

    it("should throw error when job creation fails", async function () {
      mockClient.post.rejects(new Error("API error"));

      try {
        await heretto.triggerPublishingJob(mockClient, "file-uuid", "scenario-id");
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect(error.message).to.equal("API error");
      }
    });
  });

  describe("getJobAssetDetails", function () {
    it("should return all asset file paths from single page", async function () {
      const assetsResponse = {
        content: [
          { filePath: "ot-output/dita/my-guide.ditamap" },
          { filePath: "ot-output/dita/topic1.dita" },
          { filePath: "ot-output/dita/topic2.dita" },
        ],
        totalPages: 1,
        number: 0,
        size: 100,
      };

      mockClient.get.resolves({ data: assetsResponse });

      const result = await heretto.getJobAssetDetails(mockClient, "file-uuid", "job-123");

      expect(result).to.deep.equal([
        "ot-output/dita/my-guide.ditamap",
        "ot-output/dita/topic1.dita",
        "ot-output/dita/topic2.dita",
      ]);
      expect(mockClient.get.calledOnce).to.be.true;
      expect(mockClient.get.firstCall.args[0]).to.equal("/files/file-uuid/publishes/job-123/assets");
    });

    it("should handle pagination and aggregate all assets", async function () {
      const page1Response = {
        content: [
          { filePath: "ot-output/dita/topic1.dita" },
          { filePath: "ot-output/dita/topic2.dita" },
        ],
        totalPages: 2,
        number: 0,
        size: 100,
      };

      const page2Response = {
        content: [
          { filePath: "ot-output/dita/topic3.dita" },
          { filePath: "ot-output/dita/my-guide.ditamap" },
        ],
        totalPages: 2,
        number: 1,
        size: 100,
      };

      mockClient.get
        .onFirstCall().resolves({ data: page1Response })
        .onSecondCall().resolves({ data: page2Response });

      const result = await heretto.getJobAssetDetails(mockClient, "file-uuid", "job-123");

      expect(result).to.deep.equal([
        "ot-output/dita/topic1.dita",
        "ot-output/dita/topic2.dita",
        "ot-output/dita/topic3.dita",
        "ot-output/dita/my-guide.ditamap",
      ]);
      expect(mockClient.get.calledTwice).to.be.true;
    });

    it("should return empty array when no assets", async function () {
      const assetsResponse = {
        content: [],
        totalPages: 1,
        number: 0,
        size: 100,
      };

      mockClient.get.resolves({ data: assetsResponse });

      const result = await heretto.getJobAssetDetails(mockClient, "file-uuid", "job-123");

      expect(result).to.deep.equal([]);
    });

    it("should skip assets without filePath", async function () {
      const assetsResponse = {
        content: [
          { filePath: "ot-output/dita/topic1.dita" },
          { otherField: "no-path" },
          { filePath: "ot-output/dita/topic2.dita" },
        ],
        totalPages: 1,
      };

      mockClient.get.resolves({ data: assetsResponse });

      const result = await heretto.getJobAssetDetails(mockClient, "file-uuid", "job-123");

      expect(result).to.deep.equal([
        "ot-output/dita/topic1.dita",
        "ot-output/dita/topic2.dita",
      ]);
    });
  });

  describe("validateDitamapInAssets", function () {
    it("should return true when ditamap is in ot-output/dita/", function () {
      const assets = [
        "ot-output/dita/topic1.dita",
        "ot-output/dita/my-guide.ditamap",
        "ot-output/dita/topic2.dita",
      ];

      const result = heretto.validateDitamapInAssets(assets);

      expect(result).to.be.true;
    });

    it("should return false when no ditamap is present", function () {
      const assets = [
        "ot-output/dita/topic1.dita",
        "ot-output/dita/topic2.dita",
      ];

      const result = heretto.validateDitamapInAssets(assets);

      expect(result).to.be.false;
    });

    it("should return false when ditamap is in wrong directory", function () {
      const assets = [
        "ot-output/other/my-guide.ditamap",
        "ot-output/dita/topic1.dita",
      ];

      const result = heretto.validateDitamapInAssets(assets);

      expect(result).to.be.false;
    });

    it("should return true when any ditamap is in correct directory", function () {
      const assets = [
        "ot-output/dita/different-guide.ditamap",
        "ot-output/dita/topic1.dita",
      ];

      const result = heretto.validateDitamapInAssets(assets);

      expect(result).to.be.true;
    });

    it("should return false when assets array is empty", function () {
      const result = heretto.validateDitamapInAssets([]);

      expect(result).to.be.false;
    });
  });

  describe("pollJobStatus", function () {
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should return completed job when status.result is SUCCESS and ditamap is present", async function () {
      const completedJob = {
        id: "job-123",
        status: { status: "COMPLETED", result: "SUCCESS" },
      };

      const assetsResponse = {
        content: [
          { filePath: "ot-output/dita/my-guide.ditamap" },
          { filePath: "ot-output/dita/topic1.dita" },
        ],
        totalPages: 1,
      };

      mockClient.get
        .onFirstCall().resolves({ data: completedJob })
        .onSecondCall().resolves({ data: assetsResponse });

      const result = await heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      expect(result).to.deep.equal(completedJob);
    });

    it("should return completed job when status.result is FAIL but ditamap is present", async function () {
      const failedJob = {
        id: "job-123",
        status: { status: "FAILED", result: "FAIL" },
      };

      const assetsResponse = {
        content: [
          { filePath: "ot-output/dita/my-guide.ditamap" },
          { filePath: "ot-output/dita/topic1.dita" },
        ],
        totalPages: 1,
      };

      mockClient.get
        .onFirstCall().resolves({ data: failedJob })
        .onSecondCall().resolves({ data: assetsResponse });

      const result = await heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      expect(result).to.deep.equal(failedJob);
    });

    it("should return null when job completes but ditamap is missing", async function () {
      const completedJob = {
        id: "job-123",
        status: { status: "COMPLETED", result: "SUCCESS" },
      };

      const assetsResponse = {
        content: [
          { filePath: "ot-output/dita/topic1.dita" },
          { filePath: "ot-output/dita/topic2.dita" },
        ],
        totalPages: 1,
      };

      mockClient.get
        .onFirstCall().resolves({ data: completedJob })
        .onSecondCall().resolves({ data: assetsResponse });

      const result = await heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      expect(result).to.be.null;
    });

    it("should poll until completion then validate assets", async function () {
      // Use fake timers to avoid waiting for real POLLING_INTERVAL_MS delays
      const clock = sinon.useFakeTimers();

      const assetsResponse = {
        content: [
          { filePath: "ot-output/dita/my-guide.ditamap" },
        ],
        totalPages: 1,
      };

      mockClient.get
        .onCall(0).resolves({ data: { id: "job-123", status: { status: "PENDING", result: null } } })
        .onCall(1).resolves({ data: { id: "job-123", status: { status: "PROCESSING", result: null } } })
        .onCall(2).resolves({ data: { id: "job-123", status: { status: "COMPLETED", result: "SUCCESS" } } })
        .onCall(3).resolves({ data: assetsResponse });

      const pollPromise = heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      // Advance time past the polling intervals
      await clock.tickAsync(heretto.POLLING_INTERVAL_MS);
      await clock.tickAsync(heretto.POLLING_INTERVAL_MS);
      await clock.tickAsync(heretto.POLLING_INTERVAL_MS);

      const result = await pollPromise;

      expect(result.status.result).to.equal("SUCCESS");
      expect(mockClient.get.callCount).to.equal(4); // 3 status polls + 1 assets call

      clock.restore();
    });

    it("should return null on timeout", async function () {
      // Use fake timers to avoid waiting for real timeout
      const clock = sinon.useFakeTimers();

      // Always return PENDING status (never completes)
      mockClient.get.resolves({ 
        data: { id: "job-123", status: { status: "PENDING", result: null } } 
      });

      const pollPromise = heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      // Advance past the timeout
      await clock.tickAsync(heretto.POLLING_TIMEOUT_MS + heretto.POLLING_INTERVAL_MS);

      const result = await pollPromise;
      expect(result).to.be.null;

      clock.restore();
    });

    it("should return null when polling error occurs", async function () {
      mockClient.get.rejects(new Error("Network error"));

      const result = await heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      expect(result).to.be.null;
    });

    it("should return null when asset validation fails", async function () {
      const completedJob = {
        id: "job-123",
        status: { status: "COMPLETED", result: "SUCCESS" },
      };

      mockClient.get
        .onFirstCall().resolves({ data: completedJob })
        .onSecondCall().rejects(new Error("Failed to fetch assets"));

      const result = await heretto.pollJobStatus(mockClient, "file-uuid", "job-123", mockLog, mockConfig);

      expect(result).to.be.null;
    });
  });

  describe("loadHerettoContent", function () {
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should return null if scenario lookup fails", async function () {
      const herettoConfig = {
        name: "test-heretto",
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
        scenarioName: "Doc Detective",
      };

      // Scenario fetch fails
      mockClient.get.rejects(new Error("Network error"));

      const result = await heretto.loadHerettoContent(herettoConfig, mockLog, mockConfig);

      expect(result).to.be.null;
    });

    it("should return null if publishing job creation fails", async function () {
      const herettoConfig = {
        name: "test-heretto",
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
        scenarioName: "Doc Detective",
      };

      const scenarioParameters = {
        content: [
          { name: "transtype", value: "dita" },
          { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
          { type: "file_uuid_picker", value: "file-uuid-456" },
        ],
      };

      // Scenario exists with valid parameters
      mockClient.get
        .onFirstCall().resolves({
          data: { content: [{ id: "scenario-123", name: "Doc Detective" }] },
        })
        .onSecondCall().resolves({ data: scenarioParameters });

      // Job creation fails
      mockClient.post.rejects(new Error("Job creation failed"));

      const result = await heretto.loadHerettoContent(herettoConfig, mockLog, mockConfig);

      expect(result).to.be.null;
    });
  });

  describe("downloadAndExtractOutput", function () {
    let herettoWithMocks;
    let fsMock;
    let admZipMock;
    let mockEntries;
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
      
      // Mock ZIP entries
      mockEntries = [
        { entryName: "file1.dita", isDirectory: false, getData: () => Buffer.from("content1") },
        { entryName: "subdir/", isDirectory: true, getData: () => Buffer.from("") },
        { entryName: "subdir/file2.dita", isDirectory: false, getData: () => Buffer.from("content2") },
      ];
      
      // Mock AdmZip
      admZipMock = sinon.stub().returns({
        getEntries: () => mockEntries,
        extractAllTo: sinon.stub(),
      });
      
      // Mock fs
      fsMock = {
        mkdirSync: sinon.stub(),
        writeFileSync: sinon.stub(),
        unlinkSync: sinon.stub(),
      };
      
      // Create heretto with mocked dependencies
      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: axiosCreateStub },
        fs: fsMock,
        "adm-zip": admZipMock,
      });
    });

    it("should download and extract ZIP file successfully", async function () {
      const zipContent = Buffer.from("mock zip content");
      mockClient.get.resolves({ data: zipContent });

      const result = await herettoWithMocks.downloadAndExtractOutput(
        mockClient,
        "file-uuid",
        "job-123",
        "test-heretto",
        mockLog,
        mockConfig
      );

      expect(result).to.not.be.null;
      expect(result).to.include("heretto_");
      expect(fsMock.mkdirSync.called).to.be.true;
      expect(fsMock.writeFileSync.called).to.be.true;
      expect(fsMock.unlinkSync.called).to.be.true;
    });

    it("should return null when download fails", async function () {
      mockClient.get.rejects(new Error("Download failed"));

      const result = await herettoWithMocks.downloadAndExtractOutput(
        mockClient,
        "file-uuid",
        "job-123",
        "test-heretto",
        mockLog,
        mockConfig
      );

      expect(result).to.be.null;
    });

    it("should skip malicious ZIP entries with path traversal", async function () {
      // Add malicious entry
      mockEntries.push({ 
        entryName: "../../../etc/passwd", 
        isDirectory: false, 
        getData: () => Buffer.from("malicious") 
      });
      
      const zipContent = Buffer.from("mock zip content");
      mockClient.get.resolves({ data: zipContent });

      const result = await herettoWithMocks.downloadAndExtractOutput(
        mockClient,
        "file-uuid",
        "job-123",
        "test-heretto",
        mockLog,
        mockConfig
      );

      expect(result).to.not.be.null;
      // The warning log should be called for the malicious entry
      expect(mockLog.called).to.be.true;
    });
  });

  describe("Constants", function () {
    it("should export expected constants", function () {
      expect(heretto.POLLING_INTERVAL_MS).to.equal(5000);
      expect(heretto.POLLING_TIMEOUT_MS).to.equal(300000);
      expect(heretto.DEFAULT_SCENARIO_NAME).to.equal("Doc Detective");
    });
  });

  describe("createRestApiClient", function () {
    it("should create an axios client with REST API config", function () {
      const herettoConfig = {
        organizationId: "thunderbird",
        username: "user@example.com",
        apiToken: "token123",
      };

      heretto.createRestApiClient(herettoConfig);

      expect(axiosCreateStub.called).to.be.true;
      const createConfig = axiosCreateStub.lastCall.args[0];
      expect(createConfig.baseURL).to.equal("https://thunderbird.heretto.com");
      expect(createConfig.headers.Authorization).to.include("Basic ");
      expect(createConfig.headers.Accept).to.equal("application/xml, text/xml, */*");
    });
  });

  describe("getJobStatus", function () {
    it("should return job status data", async function () {
      const expectedStatus = {
        id: "job-123",
        status: { status: "COMPLETED", result: "SUCCESS" },
      };

      mockClient.get.resolves({ data: expectedStatus });

      const result = await heretto.getJobStatus(mockClient, "file-uuid", "job-123");

      expect(result).to.deep.equal(expectedStatus);
      expect(mockClient.get.calledOnce).to.be.true;
      expect(mockClient.get.firstCall.args[0]).to.equal("/files/file-uuid/publishes/job-123");
    });

    it("should propagate errors from API", async function () {
      mockClient.get.rejects(new Error("API error"));

      try {
        await heretto.getJobStatus(mockClient, "file-uuid", "job-123");
        expect.fail("Expected error to be thrown");
      } catch (error) {
        expect(error.message).to.equal("API error");
      }
    });
  });

  describe("buildFileMapping", function () {
    let herettoWithMocks;
    let fsMock;
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should build file mapping from DITA files with image references", async function () {
      const ditaContent = `<?xml version="1.0" encoding="UTF-8"?>
        <topic>
          <body>
            <image href="images/screenshot.png"/>
            <image href="../common/logo.png"/>
          </body>
        </topic>`;

      fsMock = {
        readdirSync: sinon.stub().callsFake((dir) => {
          if (dir.includes("output")) return ["topic.dita"];
          return [];
        }),
        statSync: sinon.stub().returns({ isDirectory: () => false }),
        readFileSync: sinon.stub().returns(ditaContent),
      };

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: axiosCreateStub },
        fs: fsMock,
      });

      const result = await herettoWithMocks.buildFileMapping(
        "/tmp/output",
        { name: "test-heretto" },
        mockLog,
        mockConfig
      );

      expect(result).to.be.an("object");
    });

    it("should handle empty directory", async function () {
      fsMock = {
        readdirSync: sinon.stub().returns([]),
        statSync: sinon.stub(),
        readFileSync: sinon.stub(),
      };

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: axiosCreateStub },
        fs: fsMock,
      });

      const result = await herettoWithMocks.buildFileMapping(
        "/tmp/output",
        { name: "test-heretto" },
        mockLog,
        mockConfig
      );

      expect(result).to.deep.equal({});
    });

    it("should handle parsing errors gracefully", async function () {
      fsMock = {
        readdirSync: sinon.stub().returns(["bad.dita"]),
        statSync: sinon.stub().returns({ isDirectory: () => false }),
        readFileSync: sinon.stub().throws(new Error("Read error")),
      };

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: axiosCreateStub },
        fs: fsMock,
      });

      const result = await herettoWithMocks.buildFileMapping(
        "/tmp/output",
        { name: "test-heretto" },
        mockLog,
        mockConfig
      );

      expect(result).to.deep.equal({});
    });

    it("should recursively search subdirectories", async function () {
      const ditaContent = `<?xml version="1.0" encoding="UTF-8"?>
        <topic><body><image href="img.png"/></body></topic>`;

      fsMock = {
        readdirSync: sinon.stub().callsFake((dir) => {
          if (dir === "/tmp/output") return ["subdir", "topic.dita"];
          if (dir === "/tmp/output/subdir") return ["nested.dita"];
          return [];
        }),
        statSync: sinon.stub().callsFake((fullPath) => ({
          isDirectory: () => fullPath.includes("subdir") && !fullPath.includes(".dita"),
        })),
        readFileSync: sinon.stub().returns(ditaContent),
      };

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: axiosCreateStub },
        fs: fsMock,
      });

      const result = await herettoWithMocks.buildFileMapping(
        "/tmp/output",
        { name: "test-heretto" },
        mockLog,
        mockConfig
      );

      expect(result).to.be.an("object");
    });

    it("should handle file system errors during directory read", async function () {
      fsMock = {
        readdirSync: sinon.stub().throws(new Error("Permission denied")),
        statSync: sinon.stub(),
        readFileSync: sinon.stub(),
      };

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: axiosCreateStub },
        fs: fsMock,
      });

      const result = await herettoWithMocks.buildFileMapping(
        "/tmp/output",
        { name: "test-heretto" },
        mockLog,
        mockConfig
      );

      expect(result).to.deep.equal({});
    });
  });

  describe("searchFileByName", function () {
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should return file info when exact match is found", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.resolves({
        data: {
          hits: [
            {
              fileEntity: {
                ID: "file-123",
                URI: "/db/organizations/test-org/images/logo.png",
                name: "logo.png",
              },
            },
          ],
        },
      });

      const result = await heretto.searchFileByName(
        herettoConfig,
        "logo.png",
        null,
        mockLog,
        mockConfig
      );

      expect(result).to.deep.equal({
        fileId: "file-123",
        filePath: "/db/organizations/test-org/images/logo.png",
        name: "logo.png",
      });
    });

    it("should return null when no exact match is found", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.resolves({
        data: {
          hits: [
            {
              fileEntity: {
                ID: "file-123",
                URI: "/images/different.png",
                name: "different.png",
              },
            },
          ],
        },
      });

      const result = await heretto.searchFileByName(
        herettoConfig,
        "logo.png",
        null,
        mockLog,
        mockConfig
      );

      expect(result).to.be.null;
    });

    it("should return null when no hits returned", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.resolves({
        data: { hits: [] },
      });

      const result = await heretto.searchFileByName(
        herettoConfig,
        "logo.png",
        null,
        mockLog,
        mockConfig
      );

      expect(result).to.be.null;
    });

    it("should return null on API error", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.rejects(new Error("Network error"));

      const result = await heretto.searchFileByName(
        herettoConfig,
        "logo.png",
        null,
        mockLog,
        mockConfig
      );

      expect(result).to.be.null;
    });

    it("should search within specific folder when provided", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.resolves({
        data: {
          hits: [
            {
              fileEntity: {
                ID: "file-456",
                URI: "/specific/folder/image.png",
                name: "image.png",
              },
            },
          ],
        },
      });

      const result = await heretto.searchFileByName(
        herettoConfig,
        "image.png",
        "/specific/folder",
        mockLog,
        mockConfig
      );

      expect(result).to.deep.equal({
        fileId: "file-456",
        filePath: "/specific/folder/image.png",
        name: "image.png",
      });

      // Verify folder was included in search body
      const searchBody = mockClient.post.firstCall.args[1];
      expect(searchBody.foldersToSearch["/specific/folder"]).to.be.true;
    });
  });

  describe("uploadFile", function () {
    let herettoWithMocks;
    let fsMock;
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should upload file successfully", async function () {
      const fileBuffer = Buffer.from("image data");
      
      fsMock = {
        existsSync: sinon.stub().returns(true),
        readFileSync: sinon.stub().returns(fileBuffer),
      };

      // Need to track put calls
      mockClient.put = sinon.stub().resolves({ status: 200 });

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: sinon.stub().returns(mockClient) },
        fs: fsMock,
      });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      const result = await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.png",
        mockLog,
        mockConfig
      );

      expect(result.status).to.equal("PASS");
      expect(result.description).to.include("uploaded successfully");
    });

    it("should return FAIL when local file does not exist", async function () {
      fsMock = {
        existsSync: sinon.stub().returns(false),
        readFileSync: sinon.stub(),
      };

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: sinon.stub().returns(mockClient) },
        fs: fsMock,
      });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      const result = await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/missing.png",
        mockLog,
        mockConfig
      );

      expect(result.status).to.equal("FAIL");
      expect(result.description).to.include("Local file not found");
    });

    it("should return FAIL on API error", async function () {
      const fileBuffer = Buffer.from("image data");
      
      fsMock = {
        existsSync: sinon.stub().returns(true),
        readFileSync: sinon.stub().returns(fileBuffer),
      };

      mockClient.put = sinon.stub().rejects(new Error("Upload failed"));

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: sinon.stub().returns(mockClient) },
        fs: fsMock,
      });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      const result = await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.png",
        mockLog,
        mockConfig
      );

      expect(result.status).to.equal("FAIL");
      expect(result.description).to.include("Failed to upload");
    });

    it("should detect correct content type for different image formats", async function () {
      const fileBuffer = Buffer.from("image data");
      
      fsMock = {
        existsSync: sinon.stub().returns(true),
        readFileSync: sinon.stub().returns(fileBuffer),
      };

      mockClient.put = sinon.stub().resolves({ status: 200 });

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: sinon.stub().returns(mockClient) },
        fs: fsMock,
      });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      // Test PNG
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.png",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("image/png");

      // Test JPG
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.jpg",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("image/jpeg");

      // Test JPEG
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.jpeg",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("image/jpeg");

      // Test GIF
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.gif",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("image/gif");

      // Test SVG
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.svg",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("image/svg+xml");

      // Test WEBP
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.webp",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("image/webp");

      // Test unknown extension
      await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/file.unknown",
        mockLog,
        mockConfig
      );
      expect(mockClient.put.lastCall.args[2].headers["Content-Type"]).to.equal("application/octet-stream");
    });

    it("should return FAIL on unexpected status code", async function () {
      const fileBuffer = Buffer.from("image data");
      
      fsMock = {
        existsSync: sinon.stub().returns(true),
        readFileSync: sinon.stub().returns(fileBuffer),
      };

      mockClient.put = sinon.stub().resolves({ status: 500 });

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: sinon.stub().returns(mockClient) },
        fs: fsMock,
      });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      const result = await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.png",
        mockLog,
        mockConfig
      );

      expect(result.status).to.equal("FAIL");
      expect(result.description).to.include("Unexpected response status");
    });

    it("should handle 201 status as success", async function () {
      const fileBuffer = Buffer.from("image data");
      
      fsMock = {
        existsSync: sinon.stub().returns(true),
        readFileSync: sinon.stub().returns(fileBuffer),
      };

      mockClient.put = sinon.stub().resolves({ status: 201 });

      herettoWithMocks = proxyquire("../src/heretto", {
        axios: { create: sinon.stub().returns(mockClient) },
        fs: fsMock,
      });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      const result = await herettoWithMocks.uploadFile(
        herettoConfig,
        "file-123",
        "/tmp/image.png",
        mockLog,
        mockConfig
      );

      expect(result.status).to.equal("PASS");
    });
  });

  describe("resolveFileId", function () {
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should return fileId from sourceIntegration if available", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      const sourceIntegration = { fileId: "existing-file-123" };

      const result = await heretto.resolveFileId(
        herettoConfig,
        "/tmp/image.png",
        sourceIntegration,
        mockLog,
        mockConfig
      );

      expect(result).to.equal("existing-file-123");
    });

    it("should return fileId from fileMapping if available", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
        fileMapping: {
          "/tmp/image.png": { fileId: "mapped-file-456" },
        },
      };

      const result = await heretto.resolveFileId(
        herettoConfig,
        "/tmp/image.png",
        {},
        mockLog,
        mockConfig
      );

      expect(result).to.equal("mapped-file-456");
    });

    it("should search by filename when not in mapping", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.resolves({
        data: {
          hits: [
            {
              fileEntity: {
                ID: "searched-file-789",
                URI: "/images/image.png",
                name: "image.png",
              },
            },
          ],
        },
      });

      const result = await heretto.resolveFileId(
        herettoConfig,
        "/tmp/image.png",
        {},
        mockLog,
        mockConfig
      );

      expect(result).to.equal("searched-file-789");
      // Should cache the result
      expect(herettoConfig.fileMapping["/tmp/image.png"].fileId).to.equal("searched-file-789");
    });

    it("should return null when file cannot be found", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      mockClient.post.resolves({
        data: { hits: [] },
      });

      const result = await heretto.resolveFileId(
        herettoConfig,
        "/tmp/notfound.png",
        {},
        mockLog,
        mockConfig
      );

      expect(result).to.be.null;
    });

    it("should handle fileMapping without fileId", async function () {
      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
        fileMapping: {
          "/tmp/image.png": { filePath: "/images/image.png" }, // No fileId
        },
      };

      mockClient.post.resolves({
        data: {
          hits: [
            {
              fileEntity: {
                ID: "found-file-123",
                URI: "/images/image.png",
                name: "image.png",
              },
            },
          ],
        },
      });

      const result = await heretto.resolveFileId(
        herettoConfig,
        "/tmp/image.png",
        {},
        mockLog,
        mockConfig
      );

      expect(result).to.equal("found-file-123");
    });
  });

  describe("getResourceDependencies", function () {
    const mockLog = sinon.stub();
    const mockConfig = { logLevel: "info" };

    beforeEach(function () {
      mockLog.reset();
    });

    it("should return mapping with ditamap info", async function () {
      const ditamapInfo = `<?xml version="1.0"?>
        <resource>
          <xmldb-uri>/db/organizations/test-org/content/guide.ditamap</xmldb-uri>
          <name>guide.ditamap</name>
          <folder-uuid>folder-123</folder-uuid>
        </resource>`;

      mockClient.get.resolves({ data: ditamapInfo });

      const herettoConfig = {
        organizationId: "test-org",
        username: "user@example.com",
        apiToken: "token123",
      };

      // Need a fresh mock for REST API client
      const restClient = { get: sinon.stub() };
      restClient.get.onFirstCall().resolves({ data: ditamapInfo });
      restClient.get.onSecondCall().rejects({ response: { status: 404 } });

      const result = await heretto.getResourceDependencies(
        restClient,
        "ditamap-uuid",
        mockLog,
        mockConfig
      );

      expect(result).to.be.an("object");
      expect(result._ditamapId).to.equal("ditamap-uuid");
    });

    it("should handle dependencies endpoint response", async function () {
      const ditamapInfo = `<?xml version="1.0"?>
        <resource>
          <xmldb-uri>/db/organizations/test-org/content/guide.ditamap</xmldb-uri>
          <name>guide.ditamap</name>
          <folder-uuid>folder-123</folder-uuid>
        </resource>`;

      const dependenciesResponse = `<?xml version="1.0"?>
        <dependencies>
          <dependency id="dep-1" uri="/db/organizations/test-org/content/topic1.dita" name="topic1.dita"/>
          <dependency id="dep-2" uri="/db/organizations/test-org/content/topic2.dita" name="topic2.dita"/>
        </dependencies>`;

      const restClient = { get: sinon.stub() };
      restClient.get.onFirstCall().resolves({ data: ditamapInfo });
      restClient.get.onSecondCall().resolves({ data: dependenciesResponse });

      const result = await heretto.getResourceDependencies(
        restClient,
        "ditamap-uuid",
        mockLog,
        mockConfig
      );

      expect(result).to.be.an("object");
      expect(result["content/topic1.dita"]).to.exist;
      expect(result["content/topic1.dita"].uuid).to.equal("dep-1");
    });

    it("should handle ditamap fetch failure gracefully", async function () {
      const restClient = { get: sinon.stub() };
      restClient.get.onFirstCall().rejects(new Error("Network error"));
      restClient.get.onSecondCall().rejects({ response: { status: 404 } });

      const result = await heretto.getResourceDependencies(
        restClient,
        "ditamap-uuid",
        mockLog,
        mockConfig
      );

      expect(result).to.deep.equal({});
    });

    it("should handle alternative XML attribute formats", async function () {
      const ditamapInfo = `<?xml version="1.0"?>
        <resource uri="/db/organizations/test-org/content/guide.ditamap" 
                  name="guide.ditamap" 
                  folder-uuid="folder-123"/>`;

      const restClient = { get: sinon.stub() };
      restClient.get.onFirstCall().resolves({ data: ditamapInfo });
      restClient.get.onSecondCall().rejects({ response: { status: 404 } });

      const result = await heretto.getResourceDependencies(
        restClient,
        "ditamap-uuid",
        mockLog,
        mockConfig
      );

      expect(result).to.be.an("object");
    });

    it("should handle nested dependencies", async function () {
      const ditamapInfo = `<?xml version="1.0"?>
        <resource>
          <xmldb-uri>/db/organizations/test-org/content/guide.ditamap</xmldb-uri>
          <name>guide.ditamap</name>
          <folder-uuid>folder-123</folder-uuid>
        </resource>`;

      const dependenciesResponse = `<?xml version="1.0"?>
        <dependencies>
          <dependency id="dep-1" uri="/db/organizations/test-org/content/topic1.dita" name="topic1.dita">
            <dependencies>
              <dependency id="dep-3" uri="/db/organizations/test-org/images/img.png" name="img.png"/>
            </dependencies>
          </dependency>
        </dependencies>`;

      const restClient = { get: sinon.stub() };
      restClient.get.onFirstCall().resolves({ data: ditamapInfo });
      restClient.get.onSecondCall().resolves({ data: dependenciesResponse });

      const result = await heretto.getResourceDependencies(
        restClient,
        "ditamap-uuid",
        mockLog,
        mockConfig
      );

      expect(result["content/topic1.dita"]).to.exist;
      expect(result["images/img.png"]).to.exist;
    });
  });
});
