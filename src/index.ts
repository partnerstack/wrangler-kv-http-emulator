import { Router } from "itty-router";
import {
  jsonResponse,
  withKVBinding,
  errorHandler,
  getKVBinding,
  buildNamespaceMap,
  KVError,
} from "./utils";

export interface Env {
  // Dynamic configuration: JSON string array of { id, binding }
  // Example: [{ "id": "my-ns", "binding": "MY_KV" }]
  NAMESPACES: string;
  // Allow dynamic access to bindings by name
  [key: string]: unknown;
}

// Create the router
const router = Router();

// // Values routes - GET/PUT/DELETE individual keys
router.get(
  "/*/accounts/*/storage/kv/namespaces/:namespace/values/:key",
  withKVBinding,
  async (request: any, env: Env) => {
    const { key } = request.params!;
    const decodedKey = decodeURIComponent(key);
    const kvBinding = getKVBinding(request.namespaceKey, env);
    const value = await kvBinding.get(decodedKey);
    if (value === null) return new Response("", { status: 404 });
    return new Response(value, { status: 200 });
  }
);

router.put(
  "/*/accounts/*/storage/kv/namespaces/:namespace/values/:key",
  withKVBinding,
  async (request: any, env: Env) => {
    const { key } = request.params!;
    const decodedKey = decodeURIComponent(key);
    const value = await request.text();
    const kvBinding = getKVBinding(request.namespaceKey, env);
    await kvBinding.put(decodedKey, value);
    return jsonResponse({ success: true, result: null });
  }
);

router.delete(
  "/*/accounts/*/storage/kv/namespaces/:namespace/values/:key",
  withKVBinding,
  async (request: any, env: Env) => {
    const { key } = request.params!;
    const decodedKey = decodeURIComponent(key);
    const kvBinding = getKVBinding(request.namespaceKey, env);
    await kvBinding.delete(decodedKey);
    return jsonResponse({ success: true, result: null });
  }
);

// Bulk routes - PUT/DELETE multiple keys
router.put(
  "/*/accounts/*/storage/kv/namespaces/:namespace/bulk",
  withKVBinding,
  async (request: any, env: Env) => {
    const body = (await request.json()) as any[];
    const kvBinding = getKVBinding(request.namespaceKey, env);
    for (const item of body) {
      const key = String(item.key);
      const value = String(item.value);
      await kvBinding.put(key, value);
    }
    return jsonResponse({ success: true, result: null });
  }
);

router.delete(
  "/*/accounts/*/storage/kv/namespaces/:namespace/bulk",
  withKVBinding,
  async (request: any, env: Env) => {
    const body = (await request.json()) as string[];
    const kvBinding = getKVBinding(request.namespaceKey, env);
    for (const key of body) {
      await kvBinding.delete(String(key));
    }
    return jsonResponse({ success: true, result: null });
  }
);

// Keys route - GET list of keys
router.get(
  "/*/accounts/*/storage/kv/namespaces/:namespace/keys",
  withKVBinding,
  async (request: any, env: Env) => {
    const url = new URL(request.url);
    const prefix = url.searchParams.get("prefix") ?? "";
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 1000;

    // cursor param accepted but ignored in local mode
    const kvBinding = getKVBinding(request.namespaceKey, env);
    const list = await kvBinding.list({ prefix });
    const limited = list.keys
      .slice(0, Math.max(1, Math.min(1000, limit)))
      .map((k: { name: string }) => ({ name: k.name }));

    return jsonResponse({
      success: true,
      result: limited,
      result_info: {
        cursor: null,
        count: limited.length,
        list_complete: true,
      },
    });
  }
);

// Handle missing key cases
router.all("/*/accounts/*/storage/kv/namespaces/:namespace/values/", () => {
  return jsonResponse(
    { success: false, errors: [{ message: "Missing key" }] },
    400
  );
});

// Handle unsupported methods on valid paths
router.all("/*/accounts/*/storage/kv/namespaces/:namespace/values/:key", () => {
  return jsonResponse(
    { success: false, errors: [{ message: "Method not allowed" }] },
    405
  );
});

// 404 handler
router.all("*", () => {
  return jsonResponse(
    { success: false, errors: [{ message: "Invalid path" }] },
    404
  );
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Validate namespace configuration on startup
    try {
      buildNamespaceMap(env);
    } catch (error) {
      console.error("Startup validation failed:", error);
      if (error instanceof KVError) {
        return jsonResponse(
          {
            success: false,
            errors: [
              {
                message: `Configuration error: ${error.message}`,
                code: "STARTUP_CONFIG_ERROR",
              },
            ],
          },
          500
        );
      }
      return jsonResponse(
        {
          success: false,
          errors: [
            {
              message: "Internal configuration error",
              code: "STARTUP_ERROR",
            },
          ],
        },
        500
      );
    }

    return router.fetch(request, env).catch(errorHandler);
  },
};
