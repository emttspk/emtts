import { Buffer } from "node:buffer";

export interface StorageProvider {
  writeArtifact(type: string, key: string, data: Buffer | string): Promise<string>;
  readArtifact(type: string, key: string): Promise<Buffer>;
  deleteArtifact(type: string, key: string): Promise<void>;
  artifactExists(type: string, key: string): Promise<boolean>;
  getArtifactUrl(type: string, key: string): Promise<string>;
}
