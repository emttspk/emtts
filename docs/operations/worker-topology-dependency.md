# Worker Topology Dependency Report

## Executive Summary
This document outlines the dependencies of the job-processing topology in the `ePost.pk` application.

## 1. Why START_WORKER_IN_API=true exists
The `START_WORKER_IN_API=true` configuration allows the `api` service to embed the BullMQ worker directly within its process. This simplifies deployment in resource-constrained environments by eliminating the need for a separate worker container, ensuring the API and worker have shared access to the same local filesystem (used for file uploads and PDF generation).

## 2. Consequences of disabling (START_WORKER_IN_API=false)
When set to `false`, the API no longer runs the worker. A separate worker container MUST be deployed.
- **Dependency Requirement:** Both the `api` service and the dedicated `worker` container must have access to the same shared persistent volume (where `uploadsDir` and `outputsDir` are located) OR be fully migrated to R2 storage for all artifacts.
- **Operational Risk:** If shared storage is misconfigured or inaccessible, the worker will be unable to process label/tracking jobs, leading to queuing up and failures.

## 3. Future Migration Path
The goal is to move entirely to R2-based storage for all job artifacts to remove dependency on shared local filesystems between API and Worker containers.
- **Immediate Goal:** Ensure all new jobs use the dual-read/dual-write R2 mechanism.
- **Long-term:** Deprecate local storage paths entirely and migrate remaining historical files to R2.

## 4. Scaling Recommendations
- **Decoupling:** Always prefer `START_WORKER_IN_API=false` in production. This allows independent scaling of API (request handling) and Worker (CPU-intensive PDF generation/tracking tasks).
- **Resource Allocation:** Worker containers should be allocated higher CPU/Memory to handle Puppeteer/PDF rendering tasks.

## 5. Job Topology Dependency Matrix

| Job Type | Local FS Access | API Visibility | R2 Used | Temp File Dep |
| :--- | :---: | :---: | :---: | :---: |
| Label Generation | Yes | Yes | Yes (Dual) | Yes |
| Label Printing | Yes | Yes | Yes (Dual) | Yes |
| Bulk Tracking | No | Yes | Yes (Dual) | No |
| Complaints | No | Yes | Yes (Dual) | No |

*Note: "Yes (Dual)" indicates that R2 is used, but the system may fall back to or rely on local storage paths during the transition period.*
