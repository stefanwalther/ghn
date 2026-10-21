import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export interface ServeOptions {
  /** 0 picks an ephemeral port, which is what every test wants. */
  port?: number;
  fetch: (req: Request) => Response | Promise<Response>;
}

export interface ServeHandle {
  readonly port: number;
  readonly url: string;
  stop(force?: boolean): Promise<void>;
}

/**
 * A local HTTP server for tests that need a real socket.
 *
 * This replaces `Bun.serve`, which is not available on the Node runtime the
 * test suite runs on. The handler receives a standard `Request` and returns
 * a standard `Response`, so the call sites read the same as before.
 *
 * The request body is forwarded. A server that drops it makes a write call
 * look empty and produces a confusing assertion failure rather than an
 * obvious one.
 */
export async function serve(
  options: ServeOptions | ((req: Request) => Response | Promise<Response>)
): Promise<ServeHandle> {
  const handler = typeof options === "function" ? options : options.fetch;
  const port = typeof options === "function" ? 0 : (options.port ?? 0);
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void (async () => {
        try {
          const body = Buffer.concat(chunks);
          const host = req.headers.host ?? "127.0.0.1";
          const method = req.method ?? "GET";
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(", "));
          }
          const hasBody = body.length > 0 && method !== "GET" && method !== "HEAD";
          const request = new Request(`http://${host}${req.url ?? "/"}`, {
            method,
            headers,
            body: hasBody ? body : undefined,
          });
          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          res.statusCode = 500;
          res.end();
        }
      })();
    });
  });

  await new Promise<void>((resolve) =>
    server.listen(port, "127.0.0.1", resolve)
  );
  const address = server.address() as AddressInfo;

  return {
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    stop: async () => {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
