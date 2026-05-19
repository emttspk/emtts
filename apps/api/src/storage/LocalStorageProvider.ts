import fs from "node:fs/promises";
import path from "node:path";
import { StorageProvider } from "./StorageProvider.js";

export class LocalStorageProvider implements StorageProvider {
  async writeArtifact(type: string, key: string, data: Buffer | string): Promise<string> {
    const filePath = path.resolve(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
    return filePath;
  }

  async readArtifact(type: string, key: string): Promise<Buffer> {
    const filePath = path.resolve(key);
    return fs.readFile(filePath);
  }

  async deleteArtifact(type: string, key: string): Promise<void> {
    const filePath = path.resolve(key);
    await fs.unlink(filePath);
  }

  async artifactExists(type: string, key: string): Promise<boolean> {
    const filePath = path.resolve(key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async getArtifactUrl(type: string, key: string): Promise<string> {
    // For local, just return the file path (could be replaced with a download route)
    return path.resolve(key);
  }
}
