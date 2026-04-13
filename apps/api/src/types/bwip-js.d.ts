declare module "bwip-js" {
  export function toBuffer(
    options: Record<string, unknown>,
    callback: (err: unknown, png: Buffer) => void,
  ): void;
}

