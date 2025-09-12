import { SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

describe("KV HTTP Emulator", () => {
    const accountId = "test-account";
    const namespaceId = "test-namespace-1";
    const baseUrl = `http://example.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}`;

    beforeEach(async () => {
        // Clean up any existing test data
        const listResponse = await SELF.fetch(`${baseUrl}/keys`);
        if (listResponse.ok) {
            const listData = await listResponse.json();
            if (listData.result && listData.result.length > 0) {
                const keys = listData.result.map((item) => item.name);
                await SELF.fetch(`${baseUrl}/bulk`, {
                    method: "DELETE",
                    body: JSON.stringify(keys),
                    headers: { "Content-Type": "application/json" },
                });
            }
        }
    });

    describe("PUT /values/:key", () => {
        it("stores a value and returns success", async () => {
            const response = await SELF.fetch(`${baseUrl}/values/test-key`, {
                method: "PUT",
                body: "test-value",
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toEqual({ success: true, result: null });
        });

        // it("stores a value with expiration", async () => {
        //     const expiration = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
        //     const response = await SELF.fetch(`${baseUrl}/values/test-key-exp?expiration=${expiration}`, {
        //         method: "PUT",
        //         body: "test-value-with-expiration",
        //     });

        //     expect(response.status).toBe(200);
        //     const data = await response.json();
        //     expect(data).toEqual({ success: true, result: null });
        // });
    });

    describe("GET /values/:key", () => {
        it("retrieves a stored value", async () => {
            // First store a value
            await SELF.fetch(`${baseUrl}/values/get-test-key`, {
                method: "PUT",
                body: "get-test-value",
            });

            // Then retrieve it
            const response = await SELF.fetch(`${baseUrl}/values/get-test-key`);
            expect(response.status).toBe(200);
            expect(await response.text()).toBe("get-test-value");
        });

        it("returns 404 for non-existent key", async () => {
            const response = await SELF.fetch(`${baseUrl}/values/non-existent-key`);
            expect(response.status).toBe(404);
            expect(await response.text()).toBe("");
        });
    });

    describe("DELETE /values/:key", () => {
        it("deletes a stored value", async () => {
            // First store a value
            await SELF.fetch(`${baseUrl}/values/delete-test-key`, {
                method: "PUT",
                body: "delete-test-value",
            });

            // Delete it
            const deleteResponse = await SELF.fetch(`${baseUrl}/values/delete-test-key`, {
                method: "DELETE",
            });
            expect(deleteResponse.status).toBe(200);
            const deleteData = await deleteResponse.json();
            expect(deleteData).toEqual({ success: true, result: null });

            // Verify it's gone
            const getResponse = await SELF.fetch(`${baseUrl}/values/delete-test-key`);
            expect(getResponse.status).toBe(404);
        });
    });

    describe("PUT /bulk", () => {
        it("stores multiple values", async () => {
            const bulkData = [
                { key: "bulk-key-1", value: "bulk-value-1" },
                { key: "bulk-key-2", value: "bulk-value-2" },
                { key: "bulk-key-3", value: "bulk-value-3" },
            ];

            const response = await SELF.fetch(`${baseUrl}/bulk`, {
                method: "PUT",
                body: JSON.stringify(bulkData),
                headers: { "Content-Type": "application/json" },
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toEqual({ success: true, result: null });

            // Verify all values were stored
            for (const item of bulkData) {
                const getResponse = await SELF.fetch(`${baseUrl}/values/${item.key}`);
                expect(getResponse.status).toBe(200);
                expect(await getResponse.text()).toBe(item.value);
            }
        });

        it("stores bulk values with expiration", async () => {
            const expiration = Math.floor(Date.now() / 1000) + 3600;
            const bulkData = [
                { key: "bulk-exp-key-1", value: "bulk-exp-value-1", expiration },
                { key: "bulk-exp-key-2", value: "bulk-exp-value-2", expiration },
            ];

            const response = await SELF.fetch(`${baseUrl}/bulk`, {
                method: "PUT",
                body: JSON.stringify(bulkData),
                headers: { "Content-Type": "application/json" },
            });

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(data).toEqual({ success: true, result: null });
        });
    });

    describe("DELETE /bulk", () => {
        it("deletes multiple values", async () => {
            // First store some values
            const bulkData = [
                { key: "bulk-delete-1", value: "value-1" },
                { key: "bulk-delete-2", value: "value-2" },
                { key: "bulk-delete-3", value: "value-3" },
            ];

            await SELF.fetch(`${baseUrl}/bulk`, {
                method: "PUT",
                body: JSON.stringify(bulkData),
                headers: { "Content-Type": "application/json" },
            });

            // Delete them
            const keysToDelete = ["bulk-delete-1", "bulk-delete-2", "bulk-delete-3"];
            const deleteResponse = await SELF.fetch(`${baseUrl}/bulk`, {
                method: "DELETE",
                body: JSON.stringify(keysToDelete),
                headers: { "Content-Type": "application/json" },
            });

            expect(deleteResponse.status).toBe(200);
            const deleteData = await deleteResponse.json();
            expect(deleteData).toEqual({ success: true, result: null });

            // Verify all values are gone
            for (const key of keysToDelete) {
                const getResponse = await SELF.fetch(`${baseUrl}/values/${key}`);
                expect(getResponse.status).toBe(404);
            }
        });
    });

    describe("GET /keys", () => {
        it("lists stored keys", async () => {
            // Store some test keys
            const testKeys = ["list-key-1", "list-key-2", "list-key-3"];
            for (const key of testKeys) {
                await SELF.fetch(`${baseUrl}/values/${key}`, {
                    method: "PUT",
                    body: `value-for-${key}`,
                });
            }

            const response = await SELF.fetch(`${baseUrl}/keys`);
            expect(response.status).toBe(200);
            const data = await response.json();

            expect(data.success).toBe(true);
            expect(Array.isArray(data.result)).toBe(true);
            expect(data.result_info.list_complete).toBe(true);
            expect(data.result_info.cursor).toBe(null);

            const returnedKeys = data.result.map((item) => item.name);
            for (const key of testKeys) {
                expect(returnedKeys).toContain(key);
            }
        });

        it("filters keys by prefix", async () => {
            // Store keys with different prefixes
            await SELF.fetch(`${baseUrl}/values/prefix-test-1`, {
                method: "PUT",
                body: "value-1",
            });
            await SELF.fetch(`${baseUrl}/values/prefix-test-2`, {
                method: "PUT",
                body: "value-2",
            });
            await SELF.fetch(`${baseUrl}/values/other-key`, {
                method: "PUT",
                body: "other-value",
            });

            const response = await SELF.fetch(`${baseUrl}/keys?prefix=prefix-test`);
            expect(response.status).toBe(200);
            const data = await response.json();

            expect(data.success).toBe(true);
            expect(data.result).toHaveLength(2);
            const returnedKeys = data.result.map((item) => item.name);
            expect(returnedKeys).toContain("prefix-test-1");
            expect(returnedKeys).toContain("prefix-test-2");
            expect(returnedKeys).not.toContain("other-key");
        });

        it("respects limit parameter", async () => {
            // Store multiple keys
            const testKeys = ["limit-key-1", "limit-key-2", "limit-key-3", "limit-key-4"];
            for (const key of testKeys) {
                await SELF.fetch(`${baseUrl}/values/${key}`, {
                    method: "PUT",
                    body: `value-for-${key}`,
                });
            }

            const response = await SELF.fetch(`${baseUrl}/keys?limit=2`);
            expect(response.status).toBe(200);
            const data = await response.json();

            expect(data.success).toBe(true);
            expect(data.result.length).toBeLessThanOrEqual(2);
        });
    });

    describe("Error handling", () => {
        it("returns 404 for invalid namespace", async () => {
            const invalidUrl = `http://example.com/client/v4/accounts/${accountId}/storage/kv/namespaces/invalid-namespace/values/test-key`;
            const response = await SELF.fetch(invalidUrl, {
                method: "PUT",
                body: "test-value",
            });

            expect(response.status).toBe(404);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.errors[0].message).toBe("Invalid namespace");
        });

        it("returns 404 for invalid path", async () => {
            const response = await SELF.fetch("http://example.com/invalid/path", {
                method: "GET",
            });

            expect(response.status).toBe(404);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.errors[0].message).toBe("Invalid path");
        });

        it("returns 400 for missing key", async () => {
            const response = await SELF.fetch(`${baseUrl}/values/`, {
                method: "PUT",
                body: "test-value",
            });

            expect(response.status).toBe(400);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.errors[0].message).toBe("Missing key");
        });

        it("returns 405 for unsupported method", async () => {
            const response = await SELF.fetch(`${baseUrl}/values/test-key`, {
                method: "PATCH",
                body: "test-value",
            });

            expect(response.status).toBe(405);
            const data = await response.json();
            expect(data.success).toBe(false);
            expect(data.errors[0].message).toBe("Method not allowed");
        });
    });

    describe("Multiple namespaces", () => {
        it("isolates data between namespaces", async () => {
            const namespace1Url = `http://example.com/client/v4/accounts/${accountId}/storage/kv/namespaces/test-namespace-1/values/shared-key`;
            const namespace2Url = `http://example.com/client/v4/accounts/${accountId}/storage/kv/namespaces/test-namespace-2/values/shared-key`;

            // Store different values in each namespace
            await SELF.fetch(namespace1Url, {
                method: "PUT",
                body: "namespace-1-value",
            });

            await SELF.fetch(namespace2Url, {
                method: "PUT",
                body: "namespace-2-value",
            });

            // Verify each namespace has its own value
            const response1 = await SELF.fetch(namespace1Url);
            expect(response1.status).toBe(200);
            expect(await response1.text()).toBe("namespace-1-value");

            const response2 = await SELF.fetch(namespace2Url);
            expect(response2.status).toBe(200);
            expect(await response2.text()).toBe("namespace-2-value");
        });
    });
});
