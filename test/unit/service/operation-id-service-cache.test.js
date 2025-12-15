import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import OperationIdService from '../../../src/service/operation-id-service.js';

describe('OperationIdService file cache cleanup', () => {
    let tmpDir;
    let service;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opid-cache-'));
        const now = Date.now();

        // Older than TTL (2 hours)
        const oldFile = path.join(tmpDir, 'old.json');
        await fs.writeFile(oldFile, '{}');
        await fs.utimes(
            oldFile,
            new Date(now - 2 * 60 * 60 * 1000),
            new Date(now - 2 * 60 * 60 * 1000),
        );

        // Newer than TTL (10 minutes)
        const newFile = path.join(tmpDir, 'new.json');
        await fs.writeFile(newFile, '{}');
        await fs.utimes(newFile, new Date(now - 10 * 60 * 1000), new Date(now - 10 * 60 * 1000));

        const fileService = {
            getOperationIdCachePath: () => tmpDir,
            async pathExists(p) {
                try {
                    await fs.stat(p);
                    return true;
                } catch {
                    return false;
                }
            },
            readDirectory: (p) => fs.readdir(p),
            stat: (p) => fs.stat(p),
            removeFile: (p) => fs.rm(p, { force: true }),
        };

        service = new OperationIdService({
            logger: { debug: () => {}, warn: () => {}, error: () => {} },
            fileService,
            repositoryModuleManager: {},
            eventEmitter: { emit: () => {} },
        });
    });

    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    it('removes only files older than TTL', async () => {
        const deleted = await service.removeExpiredOperationIdFileCache(60 * 60 * 1000, 10);
        const remainingFiles = await fs.readdir(tmpDir);

        expect(deleted).to.equal(1);
        expect(remainingFiles).to.deep.equal(['new.json']);
    });
});
