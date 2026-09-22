import { Storage, File } from "@google-cloud/storage";
import { list, put } from "@vercel/blob";
import { Response } from "express";
import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const LOCAL_UPLOAD_DIR = join(process.cwd(), "local-uploads");

function usesBlobStorage(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function usesLocalObjectStorage(): boolean {
  return !process.env.PRIVATE_OBJECT_DIR && !usesBlobStorage();
}

export function localObjectId(objectPath: string): string | null {
  const match = objectPath.match(/(?:\/api\/local-objects\/|\/objects\/local\/)([0-9a-fA-F-]{36})/);
  return match?.[1] || null;
}

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error("PRIVATE_OBJECT_DIR not set");
    }
    return dir;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    if (usesLocalObjectStorage()) {
      return `/api/local-objects/${randomUUID()}`;
    }
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async saveLocalObject(id: string, data: Buffer): Promise<void> {
    if (usesBlobStorage()) {
      await put(`training/${id}`, data, {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return;
    }
    await mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
    await writeFile(join(LOCAL_UPLOAD_DIR, id), data);
  }

  async readLocalObject(id: string): Promise<Buffer> {
    if (usesBlobStorage()) {
      const { blobs } = await list({ prefix: `training/${id}` });
      if (!blobs[0]?.url) throw new ObjectNotFoundError();
      const response = await fetch(blobs[0].url);
      if (!response.ok) throw new ObjectNotFoundError();
      return Buffer.from(await response.arrayBuffer());
    }
    const path = join(LOCAL_UPLOAD_DIR, id);
    if (!existsSync(path)) throw new ObjectNotFoundError();
    return readFile(path);
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const localId = localObjectId(rawPath);
    if (localId) return `/objects/local/${localId}`;

    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  async generatePresignedUrl(objectPath: string, ttlMs: number = 3600000): Promise<string> {
    const localId = localObjectId(objectPath);
    if (localId) return `/objects/local/${localId}`;

    const privateObjectDir = this.getPrivateObjectDir();
    let fullPath = objectPath;
    
    // If it's a normalized path, convert it back to full path
    if (objectPath.startsWith('uploads/')) {
      fullPath = `${privateObjectDir}/${objectPath}`;
    }
    
    const { bucketName, objectName } = parseObjectPath(fullPath);
    
    return signObjectURL({
      bucketName,
      objectName,
      method: "GET",
      ttlSec: Math.floor(ttlMs / 1000),
    });
  }

  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      const [metadata] = await file.getMetadata();
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `public, max-age=${cacheTtlSec}`,
        "Content-Disposition": "inline", // Open in browser instead of downloading
      });

      const stream = file.createReadStream();
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  async getObjectBuffer(file: File): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = file.createReadStream();
      
      stream.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      
      stream.on("end", () => {
        resolve(Buffer.concat(chunks));
      });
      
      stream.on("error", (err) => {
        reject(err);
      });
    });
  }

  async getObjectEntity(objectPath: string): Promise<Buffer> {
    let localId = localObjectId(objectPath);
    if (!localId && usesLocalObjectStorage() && /^[0-9a-fA-F-]{36}$/.test(objectPath)) {
      localId = objectPath;
    }
    if (localId) return this.readLocalObject(localId);
    if (usesLocalObjectStorage()) {
      throw new ObjectNotFoundError();
    }
    const file = await this.getObjectEntityFile(objectPath);
    return await this.getObjectBuffer(file);
  }
}

export const objectStorageService = new ObjectStorageService();

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(`${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
