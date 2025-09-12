import type { Env } from "./index";
import { json } from "itty-router";

export class KVError extends Error {
  constructor(message: string, public status: number = 500) {
    super(message);
    this.name = "KVError";
  }
}

export class NamespaceNotFoundError extends KVError {
  constructor(namespace: string) {
    super("Invalid namespace", 404);
    this.name = "NamespaceNotFoundError";
  }
}

export function jsonResponse(obj: unknown, status = 200): Response {
  return json(obj, { status });
}

export function buildNamespaceMap(env: Env): Record<string, KVNamespace> {
  if (!env.NAMESPACES) {
    throw new KVError("NAMESPACES environment variable is required", 500);
  }

  let parsed: Array<{ id: string; binding: string }>;
  try {
    parsed = JSON.parse(String(env.NAMESPACES)) as Array<{
      id: string;
      binding: string;
    }>;
  } catch (error) {
    console.error(error);
    console.error(env.NAMESPACES);
    throw new KVError(
      "NAMESPACES environment variable must be valid JSON",
      500
    );
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new KVError(
      "NAMESPACES must contain at least one namespace configuration",
      500
    );
  }

  const dynamicMap: Record<string, KVNamespace> = {};
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const { id, binding } = item;
    if (typeof id !== "string" || typeof binding !== "string") continue;
    const kv = env[binding] as KVNamespace | undefined;
    if (kv) {
      dynamicMap[id] = kv;
    } else {
      throw new KVError(
        `KV binding '${binding}' not found for namespace '${id}'`,
        500
      );
    }
  }

  if (Object.keys(dynamicMap).length === 0) {
    throw new KVError("No valid namespace configurations found", 500);
  }

  return dynamicMap;
}

export function getKVBinding(namespaceId: string, env: Env): KVNamespace {
  const namespaceMap = buildNamespaceMap(env);
  const kvBinding = namespaceMap[namespaceId];
  if (!kvBinding) {
    throw new NamespaceNotFoundError(namespaceId);
  }
  return kvBinding;
}

// Middleware to resolve namespace key and validate it exists
export const withKVBinding = (request: any, env: Env) => {
  try {
    const { namespace } = request.params!;
    // Just validate that the namespace exists and can be resolved
    getKVBinding(namespace, env);
    // Store the namespace key for the route handler to use
    request.namespaceKey = namespace;
  } catch (error) {
    // If there's an error (like namespace not found), return an error response immediately
    if (error instanceof KVError) {
      return jsonResponse(
        { success: false, errors: [{ message: error.message }] },
        error.status
      );
    }
    // Generic error fallback
    return jsonResponse(
      { success: false, errors: [{ message: "Internal server error" }] },
      500
    );
  }
};

// Error handler
export const errorHandler = (error: Error) => {
  console.error("Route error:", error);

  if (error instanceof KVError) {
    return jsonResponse(
      { success: false, errors: [{ message: error.message }] },
      error.status
    );
  }

  // Generic error fallback
  return jsonResponse(
    { success: false, errors: [{ message: "Internal server error" }] },
    500
  );
};
