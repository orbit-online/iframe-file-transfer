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

const DEFAULT_PORT = 3000;
const DEFAULT_HOSTNAME = 'localhost';
const DEFAULT_PROTOCOL = 'http';
const DEFAULT_PUBLIC_PATH = path.join(__dirname, 'public');

const PORT = ((port) => (Number.isNaN(port) ? DEFAULT_PORT : port))(Number(process.env.PORT?.trim() ?? DEFAULT_PORT));
const HOSTNAME = (process.env.HOSTNAME ?? DEFAULT_HOSTNAME).trim();
const PROTOCOL = (process.env.PROTOCOL ?? DEFAULT_PROTOCOL).trim();
const PUBLIC_PATH = path.resolve((process.env.PUBLIC_PATH ?? DEFAULT_PUBLIC_PATH).trim());

const baseUrl = `${PROTOCOL}://${HOSTNAME}:${PORT}`;

const handler: RequestListener<typeof IncomingMessage, typeof ServerResponse> = async (req, res) => {
	if (req.url == null) {
		res.writeHead(405);
		res.end();
		return;
	}

	const method = req.method ?? 'GET';

	switch (method) {
		case 'GET': {
			try {
				const url = new URL(req.url, baseUrl);
				logger.info(url.pathname);
				const filePath = url.pathname.startsWith('/src/public/')
					? path.join(__dirname, '..', url.pathname)
					: url.pathname.startsWith('/src/')
					? path.join(PUBLIC_PATH, '..', url.pathname)
					: path.join(PUBLIC_PATH, url.pathname === '/' ? 'index.html' : url.pathname);
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
