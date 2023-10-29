export class OrbitIframeFileTransferError extends Error {
	public constructor(msg: string, options?: ErrorOptions) {
		super(msg, options);
		Object.setPrototypeOf(this, OrbitIframeFileTransferError.prototype);
	}
}

export const querySelectorOne = <TElement extends Element = Element>(
	selector: string,
	ErrorConstructor: typeof OrbitIframeFileTransferError,
): TElement => {
	const elements = document.querySelectorAll(selector);
	if (elements.length === 0) {
		throw new ErrorConstructor(`couldn't find any ${selector} element.`, {
			cause: 'absent',
		});
	} else if (elements.length > 1) {
		throw new ErrorConstructor(`expected to find exactly one of ${selector} element, got: ${elements.length}.`, {
			cause: 'non-unique',
		});
	} else {
		return elements.item(0) as TElement;
	}
};

export const sleep = (millis: number) => new Promise((resolve) => setTimeout(resolve, millis));

export function createReadStream(
	file: File,
	encoding: 'base64',
	chunkSize?: number,
): AsyncGenerator<string, string, void>;
export function createReadStream(
	file: File,
	encoding: 'buffer',
	chunkSize?: number,
): AsyncGenerator<ArrayBuffer, ArrayBuffer, void>;
export function createReadStream(
	file: File,
	encoding: 'text',
	chunkSize?: number,
): AsyncGenerator<string, string, void>;
export function createReadStream(
	file: File,
	encoding?: 'base64' | 'buffer' | 'text',
	chunkSize?: number,
): AsyncGenerator<string, string, void>;
export async function* createReadStream(
	file: File,
	encoding: 'base64' | 'buffer' | 'text' = 'base64',
	chunkSize = 1024,
): AsyncGenerator<string | ArrayBuffer, string | ArrayBuffer, void> {
	const fileSize = file.size;
	let bytesRead = 0;

	do {
		const fileReader = new FileReader();
		const nextSliceSize = Math.min(chunkSize, fileSize - bytesRead);
		const nextSlice = file.slice(bytesRead, bytesRead + nextSliceSize);
		const dataSlice = await new Promise<string | ArrayBuffer>((resolve, reject) => {
			fileReader.addEventListener('load', () => {
				fileReader.result == null
					? reject(new OrbitIframeFileTransferError('FileReader result is empty.'))
					: resolve(
							encoding === 'base64'
								? fileReader.result.slice('data:application/octet-stream;base64,'.length)
								: fileReader.result,
					  );
			});
			fileReader.addEventListener('error', (err) => reject(err));
			switch (encoding) {
				case 'base64':
					fileReader.readAsDataURL(nextSlice);
					break;
				case 'buffer':
					fileReader.readAsArrayBuffer(nextSlice);
					break;
				case 'text':
					fileReader.readAsText(nextSlice);
					break;
			}
		});
		bytesRead += nextSliceSize;

		if (bytesRead === fileSize) {
			return dataSlice;
		}

		yield dataSlice;
	} while (bytesRead < fileSize);

	throw new OrbitIframeFileTransferError('Unreachable');
}

export interface Logger {
	readonly info: (msg: string) => void;
	readonly debug: (msg: string) => void;
	readonly warn: (msg: string) => void;
	readonly log: (msg: string) => void;
	readonly error: (msg: string) => void;
}

export const createLogger = (brand: string): Logger => ({
	info: (msg: string) => console.info(`[${brand}] ${msg}`),
	debug: (msg: string) => console.debug(`[${brand}] ${msg}`),
	warn: (msg: string) => console.warn(`[${brand}] ${msg}`),
	log: (msg: string) => console.log(`[${brand}] ${msg}`),
	error: (msg: string) => console.error(`[${brand}] ${msg}`),
});
export const rejectAfter = (
	millis: number,
	rejectionMessage: string,
	ErrorConstructor: typeof OrbitIframeFileTransferError,
) => new Promise((_, reject) => setTimeout(() => reject(new ErrorConstructor(rejectionMessage)), millis));
