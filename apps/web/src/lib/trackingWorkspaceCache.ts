type TrackingWorkspacePageSize = 20 | 50 | 100;

export type TrackingWorkspaceViewState<TStatus extends string = string> = {
  page: number;
  pageSize: TrackingWorkspacePageSize;
  statusFilter: TStatus;
  searchInput: string;
  searchTerm: string;
  scrollY: number;
  savedAt: number;
};

export type TrackingWorkspaceRenderCache<TShipment = unknown, TComplaint = unknown> = {
  shipments: TShipment[];
  total: number;
  complaintQueue: TComplaint[];
  fetchedAt: number;
  latestSyncAt: number;
};

export type TrackingWorkspaceSnapshot<TShipment = unknown, TComplaint = unknown> = {
  shipments: TShipment[];
  total: number;
  complaintQueue: TComplaint[];
  fetchedAt: number;
  latestSyncAt: number;
};

const TRACKING_WORKSPACE_DB_NAME = "tracking-workspace-cache";
const TRACKING_WORKSPACE_STORE_NAME = "snapshots";
const TRACKING_WORKSPACE_SNAPSHOT_KEY = "bulk-tracking-full-snapshot";
const TRACKING_WORKSPACE_RENDER_CACHE_KEY = "tracking.workspace.render.v3";
const TRACKING_WORKSPACE_VIEW_STATE_KEY = "tracking.workspace.view.v1";

function canUseBrowserStorage() {
  return typeof window !== "undefined";
}

function readFromLocalStorage<T>(key: string): T | null {
  if (!canUseBrowserStorage()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeToLocalStorage<T>(key: string, value: T) {
  if (!canUseBrowserStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Cache write failures should never break rendering.
  }
}

function openTrackingWorkspaceDb(): Promise<IDBDatabase | null> {
  if (!canUseBrowserStorage() || !("indexedDB" in window)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = window.indexedDB.open(TRACKING_WORKSPACE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TRACKING_WORKSPACE_STORE_NAME)) {
        db.createObjectStore(TRACKING_WORKSPACE_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export function readTrackingWorkspaceRenderCache<TShipment = unknown, TComplaint = unknown>() {
  return readFromLocalStorage<TrackingWorkspaceRenderCache<TShipment, TComplaint>>(TRACKING_WORKSPACE_RENDER_CACHE_KEY);
}

export function writeTrackingWorkspaceRenderCache<TShipment = unknown, TComplaint = unknown>(cache: TrackingWorkspaceRenderCache<TShipment, TComplaint>) {
  writeToLocalStorage(TRACKING_WORKSPACE_RENDER_CACHE_KEY, cache);
}

export function readTrackingWorkspaceViewState<TStatus extends string = string>() {
  return readFromLocalStorage<TrackingWorkspaceViewState<TStatus>>(TRACKING_WORKSPACE_VIEW_STATE_KEY);
}

export function writeTrackingWorkspaceViewState<TStatus extends string = string>(state: TrackingWorkspaceViewState<TStatus>) {
  writeToLocalStorage(TRACKING_WORKSPACE_VIEW_STATE_KEY, state);
}

export async function readTrackingWorkspaceSnapshot<TShipment = unknown, TComplaint = unknown>() {
  const db = await openTrackingWorkspaceDb();
  if (!db) return null;

  return new Promise<TrackingWorkspaceSnapshot<TShipment, TComplaint> | null>((resolve) => {
    const tx = db.transaction(TRACKING_WORKSPACE_STORE_NAME, "readonly");
    const store = tx.objectStore(TRACKING_WORKSPACE_STORE_NAME);
    const request = store.get(TRACKING_WORKSPACE_SNAPSHOT_KEY);
    request.onsuccess = () => resolve((request.result as TrackingWorkspaceSnapshot<TShipment, TComplaint> | undefined) ?? null);
    request.onerror = () => resolve(null);
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  });
}

export async function writeTrackingWorkspaceSnapshot<TShipment = unknown, TComplaint = unknown>(snapshot: TrackingWorkspaceSnapshot<TShipment, TComplaint>) {
  const db = await openTrackingWorkspaceDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(TRACKING_WORKSPACE_STORE_NAME, "readwrite");
    const store = tx.objectStore(TRACKING_WORKSPACE_STORE_NAME);
    store.put(snapshot, TRACKING_WORKSPACE_SNAPSHOT_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      resolve();
    };
    tx.onabort = () => {
      db.close();
      resolve();
    };
  });
}