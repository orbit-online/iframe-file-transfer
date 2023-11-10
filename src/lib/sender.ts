import { OrbitIframeFileTransferError, createDeferred, createReadStream, rejectAfter, sleep } from './util.js';

class OrbitIframeFileSenderError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_sender] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileSenderError.prototype);
	}
}

export function createIframeUrl(url: string) {
	const protocol = url.startsWith('http://') || url.startsWith('https://') ? '' : 'http://';
	const hash = `data-orbit-origin=${encodeURIComponent(window.origin)}`;
	return url.includes('#') ? `${protocol}${url}&${hash}` : `${protocol}${url}#${hash}`;
}

interface IframeHandlerOptions {
	readonly chunkSize?: number;
	readonly entityData: string;
	readonly file: Maybe<File>;
	readonly onCancel: () => void;
	readonly onComplete: () => void;
	readonly onError: (err: Error) => void;
	readonly orbitFileId: string;
	readonly throttle?: number;
}
type IframeHandlerArgs = readonly [
	file: Maybe<File>,
	orbitFileId: string,
	entityData: string,
	onComplete: () => void,
	onCancel: () => void,
	chunkSize?: number,
	throttle?: number,
	onError?: (err: Error) => void,
];
type IframeHandler = (event: React.SyntheticEvent<HTMLIFrameElement> | Event) => void;
type HandlerParams = readonly [params: IframeHandlerOptions] | IframeHandlerArgs;

export function createIframeHandler(options: IframeHandlerOptions): Maybe<IframeHandler>;
export function createIframeHandler(...params: IframeHandlerArgs): Maybe<IframeHandler>;
export function createIframeHandler(...p: HandlerParams): Maybe<IframeHandler> {
	const [file, orbitFileId, entityData, onComplete, onCancel, chunkSize, throttle, onError] =
		p.length === 1
			? [
					p[0].file,
					p[0].orbitFileId,
					p[0].entityData,
					p[0].onComplete,
					p[0].onCancel,
					p[0].chunkSize,
					p[0].throttle,
					p[0].onError,
			  ]
			: p;

	if (file == null) {
		return null;
	}

	const deferred = createDeferred();
	const handler = (event: React.SyntheticEvent<HTMLIFrameElement> | Event) => {
		try {
			const iframe = event.currentTarget as EventTarget & HTMLIFrameElement;
			const { contentWindow } = iframe;
			if (contentWindow === null) {
				throw new OrbitIframeFileSenderError('contentWindow is not present in iframe.');
			}

			const channel = new MessageChannel();
			channel.port1.onmessage = async (evt: MessageEvent<any>) => {
				const data = evt.data;
				switch (data.event) {
					case 'initialized': {
						deferred.resolve();
						const stream = createReadStream(file, 'base64', chunkSize ?? 1024 * 1024);
						let idx = 0;
						let chunk: IteratorResult<string, string>;
						do {
							chunk = await stream.next();
							contentWindow.postMessage(
								{
									event: 'online.orbit::iframe_file_transfer#file_chunk',
									idx: idx++,
									done: chunk.done === true,
									value: chunk.value,
								},
								'*',
							);
							if (throttle != null && throttle > 0) {
								await sleep(throttle);
							}
						} while (chunk.done !== true);
						break;
					}
					case 'file-uploaded': {
						onComplete();
						break;
					}
					case 'cancel': {
						onCancel();
						break;
					}
					case 'error': {
						if (onError != null) {
							onError(
								data.error == null
									? new OrbitIframeFileSenderError('Empty error from receiver.')
									: new OrbitIframeFileSenderError(`Error from receiver: ${data.error}`),
							);
						}
						break;
					}
				}
			};

			const parsedEntityData = JSON.parse(entityData);
			contentWindow.postMessage(
				{
					apiVersion: 1,
					event: 'online.orbit::iframe_file_transfer#init',
					orbitFileId: orbitFileId,
					entityData: parsedEntityData,
					fileName: file.name,
					lastModified: file.lastModified,
					mimeType: file.type,
					size: file.size,
				},
				'*',
				[channel.port2],
			);
		} catch (err) {
			if (onError != null) {
				onError(err as Error);
			}

			if (!deferred.isSettled) {
				deferred.reject(err as Error);
			}
		}
	};

	Promise.race([
		deferred.promise,
		rejectAfter(
			5000,
			'Connection to external service (iframe) could not be established within 5000ms',
			OrbitIframeFileSenderError,
		),
	]).catch(onError);

	return handler;
}
