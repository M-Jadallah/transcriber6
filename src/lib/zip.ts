// ZIP archive generation for bulk downloads
import * as archiver from "archiver";
import { Writable } from "stream";

export interface ZipFile {
  filename: string;
  content: Buffer | string;
}

export async function createZipBuffer(files: ZipFile[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    // archiver is a factory function (no default export — use named call)
    const archive = (archiver as any).default
      ? (archiver as any).default("zip", { zlib: { level: 6 } })
      : (archiver as any)("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    writable.on("finish", () => resolve(Buffer.concat(chunks)));
    archive.pipe(writable);
    for (const f of files) {
      archive.append(f.content, { name: f.filename });
    }
    archive.finalize();
  });
}
