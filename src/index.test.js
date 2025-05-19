const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

describe('detectTests', function () {
    let setConfigStub, qualifyFilesStub, parseTestsStub, logStub;
    let detectTests;
    let configInput, configResolved, files, specs;

    beforeEach(function () {
        configInput = { foo: 'bar' };
        configResolved = { ...configInput, environment: 'test' };
        files = ['file1.js', 'file2.js'];
        specs = [{ name: 'spec1' }, { name: 'spec2' }];

        setConfigStub = sinon.stub().resolves(configResolved);
        qualifyFilesStub = sinon.stub().resolves(files);
        parseTestsStub = sinon.stub().resolves(specs);
        logStub = sinon.stub();

        detectTests = proxyquire('./index', {
            './config': { setConfig: setConfigStub },
            './utils': {
                qualifyFiles: qualifyFilesStub,
                parseTests: parseTestsStub,
                log: logStub
            }
        }).detectTests;
    });

    afterEach(function () {
        sinon.restore();
    });

    it('should resolve config if environment is not set', async function () {
        await detectTests({ config: configInput });
        assert(setConfigStub.calledOnceWith({ config: configInput }));
        assert(qualifyFilesStub.calledOnceWith({ config: configResolved }));
        assert(parseTestsStub.calledOnceWith({ config: configResolved, files }));
        assert(logStub.calledWith(configResolved, 'debug', 'CONFIG:'));
        assert(logStub.calledWith(configResolved, 'debug', configResolved));
    });

    it('should not resolve config if environment is set', async function () {
        const configWithEnv = { ...configInput, environment: 'already' };
        await detectTests({ config: configWithEnv });
        assert(setConfigStub.notCalled);
        assert(qualifyFilesStub.calledOnceWith({ config: configWithEnv }));
        assert(parseTestsStub.calledOnceWith({ config: configWithEnv, files }));
    });

    it('should log files and specs', async function () {
        await detectTests({ config: configInput });
        assert(logStub.calledWith(configResolved, 'debug', 'FILES:'));
        assert(logStub.calledWith(configResolved, 'debug', files));
        assert(logStub.calledWith(configResolved, 'debug', 'SPECS:'));
        assert(logStub.calledWith(configResolved, 'info', specs));
    });

    it('should return the parsed specs', async function () {
        const result = await detectTests({ config: configInput });
        assert.strictEqual(result, specs);
    });


    it('should correctly parse a complicated input', async function () {
        // Simulate a config with complex structure and multiple files/specs
        const complicatedConfig = {
            foo: 'bar',
            nested: { a: 1, b: [2, 3] },
            environment: undefined
        };
        const complicatedResolved = {
            ...complicatedConfig,
            environment: 'complicated'
        };
        const complicatedFiles = [
            'src/feature/alpha.js',
            'src/feature/beta.js',
            'src/feature/gamma.js'
        ];
        const complicatedSpecs = [
            { name: 'alpha', steps: [1, 2, 3], meta: { tags: ['a', 'b'] } },
            { name: 'beta', steps: [4, 5], meta: { tags: ['b'] } },
            { name: 'gamma', steps: [], meta: { tags: [] } }
        ];

        setConfigStub.resolves(complicatedResolved);
        qualifyFilesStub.resolves(complicatedFiles);
        parseTestsStub.resolves(complicatedSpecs);

        const result = await detectTests({ config: complicatedConfig });

        assert(setConfigStub.calledOnceWith({ config: complicatedConfig }));
        assert(qualifyFilesStub.calledOnceWith({ config: complicatedResolved }));
        assert(parseTestsStub.calledOnceWith({ config: complicatedResolved, files: complicatedFiles }));
        assert(logStub.calledWith(complicatedResolved, 'debug', 'FILES:'));
        assert(logStub.calledWith(complicatedResolved, 'debug', complicatedFiles));
        assert(logStub.calledWith(complicatedResolved, 'debug', 'SPECS:'));
        assert(logStub.calledWith(complicatedResolved, 'info', complicatedSpecs));
        assert.strictEqual(result, complicatedSpecs);
    });
});