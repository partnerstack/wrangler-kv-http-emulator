import { writeFile, readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import Mustache from 'mustache';

const projectRoot = process.cwd();
const wranglerTomlPath = path.join(projectRoot, 'wrangler.toml');
const wranglerTemplatePath = path.join(projectRoot, 'wrangler.toml.mustache');

function parseNamespacesEnv() {
    const raw = process.env.NAMESPACES;
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(Boolean).map((n) => ({
            id: String(n.id),
            binding: String(n.binding),
        }));
    } catch {
        return [];
    }
}

async function renderWranglerToml(namespaces) {
    const template = await readFile(wranglerTemplatePath, 'utf8');
    const data = {
        kv_namespaces: namespaces.map((n, idx) => ({
            binding: n.binding,
            id: n.id,
            comma: idx < namespaces.length - 1,
        })),
        namespaces_json: JSON.stringify(namespaces),
    };
    const content = Mustache.render(template, data);
    await writeFile(wranglerTomlPath, content, 'utf8');
}

async function main() {
    const namespaces = parseNamespacesEnv();

    // Fail if no namespaces are configured
    if (!process.env.NAMESPACES) {
        console.error('ERROR: NAMESPACES environment variable is required');
        console.error('Please provide a JSON array of namespace configurations like:');
        console.error('NAMESPACES=\'[{"id": "my-ns", "binding": "MY_KV"}]\'');
        process.exit(1);
    }

    if (namespaces.length === 0) {
        console.error('ERROR: NAMESPACES environment variable must contain at least one valid namespace');
        console.error('Expected format: [{"id": "namespace-id", "binding": "BINDING_NAME"}]');
        console.error('Received:', process.env.NAMESPACES);
        process.exit(1);
    }

    await renderWranglerToml(namespaces);

    const portEnv = (process.env.PORT ?? '').trim();
    const persistToEnv = (process.env.PERSIST_TO ?? '').trim();
    const port = portEnv || '8787';
    const persistTo = persistToEnv || './.wrangler-kv-store';

    const args = [
        'dev',
        '--ip', '0.0.0.0',
        '--port', String(port),
        '--local',
        '--persist-to', persistTo,
    ];

    // NAMESPACES is injected via generated wrangler.toml vars

    const child = spawn('npx', ['wrangler', ...args], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
