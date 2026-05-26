import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

process.env.ENABLE_R2_UPLOADS = "true";

type TestCase = {
  name: string;
  run: () => Promise<void>;
};

const { jobsRouter } = await import("./jobs.js");
const { prisma } = await import("../lib/prisma.js");
const { ensureStorageDirs, outputsDir, toStoredPath } = await import("../storage/paths.js");
const { getDualProviders } = await import("../storage/provider.js");

const trackingMasterRouteLayer = (jobsRouter as any).stack.find(
  (layer: any) => layer?.route?.path === "/:jobId/download/tracking-master" && layer?.route?.methods?.get,
);

if (!trackingMasterRouteLayer) {
  throw new Error("tracking-master route not found");
}

const trackingMasterAuthMiddleware = trackingMasterRouteLayer.route.stack[0].handle as (req: any, res: any, next: () => void) => unknown;
const trackingMasterHandler = trackingMasterRouteLayer.route.stack[1].handle as (req: any, res: any) => Promise<unknown>;

type DownloadMockState = {
  findFirstImpl: (args: any) => Promise<any>;
  labelJobUpdates: any[];
  r2ArtifactExists: (type: string, key: string, options?: unknown) => Promise<boolean>;
  r2ReadArtifact: (type: string, key: string, options?: unknown) => Promise<Buffer>;
};

function makeDownloadState(overrides?: Partial<DownloadMockState>): DownloadMockState {
  return {
    findFirstImpl: async () => null,
    labelJobUpdates: [],
    r2ArtifactExists: async () => false,
    r2ReadArtifact: async () => Buffer.from(""),
    ...(overrides ?? {}),
  };
}

async function withDownloadMocks(state: DownloadMockState, run: () => Promise<void>) {
  const p = prisma as any;
  const dualProviders = getDualProviders() as any;
  const r2 = dualProviders.r2;

  const originalPrisma = {
    labelJob: p.labelJob,
  };

  const originalR2 = {
    artifactExists: r2.artifactExists,
    readArtifact: r2.readArtifact,
  };

  p.labelJob = {
    findFirst: async (args: any) => state.findFirstImpl(args),
    update: async ({ where, data }: any) => {
      state.labelJobUpdates.push({ where, data });
      return { id: where.id, ...data };
    },
  };

  r2.artifactExists = async (type: string, key: string, options?: unknown) => state.r2ArtifactExists(type, key, options);
  r2.readArtifact = async (type: string, key: string, options?: unknown) => state.r2ReadArtifact(type, key, options);

  try {
    await run();
  } finally {
    p.labelJob = originalPrisma.labelJob;
    r2.artifactExists = originalR2.artifactExists;
    r2.readArtifact = originalR2.readArtifact;
  }
}

function makeRes() {
  const state: {
    statusCode: number;
    body: any;
    headers: Record<string, string>;
    downloadedPath: string | null;
    downloadedName: string | null;
  } = {
    statusCode: 200,
    body: null,
    headers: {},
    downloadedPath: null,
    downloadedName: null,
  };

  const res: any = {
    headersSent: false,
    setHeader(name: string, value: string) {
      state.headers[String(name).toLowerCase()] = String(value);
      return res;
    },
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: any) {
      state.body = payload;
      res.headersSent = true;
      return res;
    },
    send(payload: any) {
      state.body = payload;
      res.headersSent = true;
      return res;
    },
    download(filePath: string, fileName?: string) {
      state.downloadedPath = filePath;
      state.downloadedName = fileName ?? null;
      res.headersSent = true;
      return res;
    },
  };

  return { res, state };
}

function makeAuthedReq(jobId: string) {
  return {
    params: { jobId },
    user: { id: "user-1", role: "USER" },
  } as any;
}

const tests: TestCase[] = [
  {
    name: "returns 401 for unauthenticated tracking-master route middleware",
    async run() {
      const { res, state } = makeRes();
      let nextCalled = false;

      const req: any = {
        header: () => null,
        query: {},
      };

      trackingMasterAuthMiddleware(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(state.statusCode, 401);
      assert.equal(state.body?.error, "Unauthorized");
    },
  },
  {
    name: "returns 200 with XLSX headers when local tracking-master file exists",
    async run() {
      await ensureStorageDirs();
      const jobId = "job-local-200";
      const localPath = path.join(outputsDir(), `${jobId}-tracking-master.xlsx`);
      await fs.writeFile(localPath, Buffer.from("local-xlsx-bytes"));
      const storedPath = toStoredPath(localPath);

      const state = makeDownloadState({
        findFirstImpl: async () => ({
          id: jobId,
          userId: "user-1",
          status: "COMPLETED",
          trackingMasterPath: storedPath,
        }),
      });

      const { res, state: response } = makeRes();

      try {
        await withDownloadMocks(state, async () => {
          await trackingMasterHandler(makeAuthedReq(jobId), res);
        });

        assert.equal(response.statusCode, 200);
        assert.equal(response.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        assert.ok(String(response.headers["content-disposition"] ?? "").includes("Tracking Master"));
        assert.equal(response.downloadedPath, path.resolve(localPath));
        assert.ok(String(response.downloadedName ?? "").endsWith(".xlsx"));
      } finally {
        await fs.rm(localPath, { force: true });
      }
    },
  },
  {
    name: "returns 200 from R2 fallback when local file is missing and R2 object exists",
    async run() {
      const jobId = "job-r2-200";
      const state = makeDownloadState({
        findFirstImpl: async () => ({
          id: jobId,
          userId: "user-1",
          status: "COMPLETED",
          trackingMasterPath: "generated/non-existent-tracking-master.xlsx",
        }),
        r2ArtifactExists: async () => true,
        r2ReadArtifact: async (type: string) => {
          assert.equal(type, "xlsx");
          return Buffer.from("r2-xlsx-bytes");
        },
      });

      const { res, state: response } = makeRes();

      await withDownloadMocks(state, async () => {
        await trackingMasterHandler(makeAuthedReq(jobId), res);
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.headers["content-type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      assert.ok(Buffer.isBuffer(response.body));
      assert.equal(response.body.toString("utf8"), "r2-xlsx-bytes");
    },
  },
  {
    name: "returns 404 when authenticated but tracking-master artifact is missing locally and in R2",
    async run() {
      const jobId = "job-missing-404";
      const state = makeDownloadState({
        findFirstImpl: async () => ({
          id: jobId,
          userId: "user-1",
          status: "COMPLETED",
          trackingMasterPath: "generated/does-not-exist.xlsx",
        }),
        r2ArtifactExists: async () => false,
      });

      const { res, state: response } = makeRes();

      await withDownloadMocks(state, async () => {
        await trackingMasterHandler(makeAuthedReq(jobId), res);
      });

      assert.equal(response.statusCode, 404);
      assert.equal(response.body?.success, false);
      assert.match(String(response.body?.message ?? ""), /tracking master file/i);
    },
  },
];

let failed = false;
for (const test of tests) {
  try {
    await test.run();
    console.log(`PASS jobs tracking-master: ${test.name}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL jobs tracking-master: ${test.name}`);
    console.error(error);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`jobs tracking-master tests passed: ${tests.length}`);
}
