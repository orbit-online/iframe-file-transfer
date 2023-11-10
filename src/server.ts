import mime from 'mime';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import http, { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import path from 'node:path';

// const __filename = new URL('', import.meta.url).pathname;
// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = new URL('.', import.meta.url).pathname;

const logger = {
	// eslint-disable-next-line no-console
	debug: (msg?: any, ...optionalParams: any[]): void => console.debug(`[server] ${msg}`, ...optionalParams),
	// eslint-disable-next-line no-console
	error: (msg?: any, ...optionalParams: any[]): void => console.error(`[server] ${msg}`, ...optionalParams),
	// eslint-disable-next-line no-console
	info: (msg?: any, ...optionalParams: any[]): void => console.info(`[server] ${msg}`, ...optionalParams),
	// eslint-disable-next-line no-console
	log: (msg?: any, ...optionalParams: any[]): void => console.log(`[server] ${msg}`, ...optionalParams),
	// eslint-disable-next-line no-console
	warn: (msg?: any, ...optionalParams: any[]): void => console.warn(`[server] ${msg}`, ...optionalParams),
} as const;

const cwd = process.cwd();

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = 'localhost';
const DEFAULT_PROTOCOL = 'http';

const DEFAULT_DIST_PATH = path.join(cwd, 'dist');
const DIST_PATH = path.resolve((process.env.DIST_PATH ?? DEFAULT_DIST_PATH).trim());

const DEFAULT_PUBLIC_PATH = path.join(DIST_PATH, 'public');
const PUBLIC_PATH = path.resolve((process.env.PUBLIC_PATH ?? DEFAULT_PUBLIC_PATH).trim());
const DEFAULT_SOURCE_PATH = path.join(cwd, 'src');
const SOURCE_PATH = path.resolve((process.env.SOURCE_PATH ?? DEFAULT_SOURCE_PATH).trim());
const DEFAULT_EXAMPLES_SOURCE_PATH = path.join(cwd, 'public', 'examples');
const EXAMPLES_SOURCE_PATH = path.resolve((process.env.EXAMPLES_SOURCE_PATH ?? DEFAULT_EXAMPLES_SOURCE_PATH).trim());

const PORT = ((port) => (Number.isNaN(port) ? DEFAULT_PORT : port))(Number(process.env.PORT?.trim() ?? DEFAULT_PORT));
const HOSTNAME = (process.env.HOSTNAME ?? DEFAULT_HOSTNAME).trim();
const PROTOCOL = (process.env.PROTOCOL ?? DEFAULT_PROTOCOL).trim();

const baseUrl = `${PROTOCOL}://${HOSTNAME}:${PORT}`;

const handler: RequestListener<typeof IncomingMessage, typeof ServerResponse> = async (req, res) => {
	if (req.url == null) {
		res.writeHead(405);
		res.end();
		return;
	}

	const method = req.method ?? 'GET';

	const url = new URL(req.url, `http://${req.headers.host}`);
	switch (method) {
		case 'GET': {
			try {
				const isSourceFile = url.pathname.endsWith('.ts') || url.pathname.endsWith('.tsx');
				const isExample = url.pathname.startsWith('/examples/');
				const filePath = isSourceFile
					? isExample
						? path.join(EXAMPLES_SOURCE_PATH, '..', url.pathname)
						: path.join(SOURCE_PATH, '..', url.pathname)
					: url.pathname.startsWith('/src/')
					? path.join(DIST_PATH, url.pathname)
					: path.join(PUBLIC_PATH, url.pathname === '/' ? 'index.html' : url.pathname);

				logger.debug(`${url.pathname} -> ${filePath}`);
				const fileStat = await fs.stat(filePath);
				if (fileStat.isFile()) {
					res.setHeader('access-control-allow-origin', '*');
					res.setHeader('content-type', mime.getType(path.extname(filePath)) ?? 'application/octet-stream');
					createReadStream(filePath).pipe(res);
					return;
				}

				res.writeHead(404);
				res.end();
			} catch (e) {
				logger.error(e);
				res.writeHead(404);
				res.end();
			}
			return;
		}
		case 'POST': {
			if (url.pathname !== '/upload') {
				res.setHeader('content-type', 'application/json');
				res.writeHead(404);
				res.write(JSON.stringify({ error: 'Not found.' }));
				res.end();
				return;
			}
			res.setHeader('content-type', 'application/json');
			res.writeHead(200);
			res.write(JSON.stringify({ id: 'dam-file-id-123' }));
			res.end();
			return;
		}
		default: {
			res.writeHead(405);
			res.end();
			return;
		}
	}
};

async function main(): Promise<void> {
	const server1 = http.createServer(handler);
	const server2 = http.createServer(handler);

	server1.listen(PORT, () => {
		logger.info(`Serving: ${baseUrl}`);
	});
	server2.listen(3001, () => {
		logger.info('Listening on ::3001');
	});
}

main().catch(logger.error);
