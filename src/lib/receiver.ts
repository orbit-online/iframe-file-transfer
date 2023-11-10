import {
	querySelectorOne as querySelectorOneBase,
	OrbitIframeFileTransferError,
	createLogger,
	rejectAfter,
	Logger,
} from './util.js';

export class OrbitIframeFileTransferReceiverError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_receiver] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileTransferReceiverError.prototype);
	}
}

export type SubmitHandler = (
	url: string,
	method: string,
	formData: FormData,
	orbitEntityData: Record<string, number | string | boolean | null | undefined>,
) => Promise<unknown>;

export function querySelectorOne<TElement extends Element = Element>(selector: string, errorMessage: string): TElement {
	try {
		return querySelectorOneBase<TElement>(selector, OrbitIframeFileTransferReceiverError);
	} catch (err) {
		if (err instanceof OrbitIframeFileTransferError) {
			throw new OrbitIframeFileTransferReceiverError(err.cause === 'absent' ? errorMessage : err.message);
		}
		throw err;
	}
}

interface OrbitInitMessage {
	readonly apiVersion: number;
	readonly entityData: Record<string, any>;
	readonly event: 'online.orbit::iframe_file_transfer#init';
	readonly fileName: string;
	readonly lastModified: number;
	readonly mimeType: string;
	readonly orbitFileId: string;
	readonly size: number;
}

interface OrbitFileChunkMessage {
	readonly done: boolean;
	readonly event: 'online.orbit::iframe_file_transfer#file_chunk';
	readonly idx: number;
	readonly value: string;
}

type OrbitMessage = OrbitInitMessage | OrbitFileChunkMessage;
type OrbitMessageEvent = MessageEvent<OrbitMessage>;

interface State {
	bytesReceived: number;
	file: Maybe<File>;
	fileBuffer: Uint8Array[];
	initMessage: OrbitInitMessage;
	outgoingPort: MessagePort;
}

const allOrbitMessageEvents = [
	'online.orbit::iframe_file_transfer#init',
	'online.orbit::iframe_file_transfer#file_chunk',
] as const;

function isOrbitMessage(evt: any): evt is OrbitMessageEvent {
	return (
		typeof evt === 'object' &&
		evt != null &&
		typeof evt.data === 'object' &&
		evt.data != null &&
		typeof evt.data.event === 'string' &&
		allOrbitMessageEvents.includes(evt.data.event)
	);
}

function decodeChunk(chunk: string): Uint8Array {
	const byteString = atob(chunk);
	let idx = byteString.length;
	const u8arr = new Uint8Array(idx);
	while (idx--) {
		u8arr[idx] = byteString.charCodeAt(idx);
	}
	return u8arr;
}

export function tryGetOriginFromUrlHash(hash: string): string {
	if (!hash.includes('data-orbit-origin=')) {
		throw new OrbitIframeFileTransferReceiverError(
			`The orbit host should provide the origin via the [hash] part of the URL in the iframe source, it appears that it hasn't, please contact Orbit about this error,
it can be provded like this from the host
<iframe src="https://external-upload-site.example.com/iframe.html#data-orbit-origin=https://customer-name.orbit.online"></iframe>`,
		);
	}
	const urlHashParts = Object.fromEntries(
		hash
			.slice(1)
			.split('&')
			.map((pair) => pair.split('=').map((kv) => decodeURIComponent(kv)) as [string, string]),
	);
	return urlHashParts['data-orbit-origin'];
}

export class OrbitIframeFileTransferReceiver {
	private disconnect: (() => void) | null = null;
	private readonly logger: Logger;
	private readonly onError: (err: Error) => void;
	private readonly onFileChunkReceived?: (bytesReceived: number, totalSize: number, chunkSize: number) => void;
	private readonly onFileTransferCompleted?: (file: File) => void;
	private readonly onFileTransferInit: (msg: OrbitInitMessage) => void;
	private readonly onFormSubmit: SubmitHandler;
	private readonly orbitOrigin: string;
	private state: Maybe<State> = null;

	public constructor(initObject: {
		onError: OrbitIframeFileTransferReceiver['onError'];
		onFileChunkReceived?: OrbitIframeFileTransferReceiver['onFileChunkReceived'];
		onFileTransferCompleted?: OrbitIframeFileTransferReceiver['onFileTransferCompleted'];
		onFileTransferInit: OrbitIframeFileTransferReceiver['onFileTransferInit'];
		onFormSubmit: OrbitIframeFileTransferReceiver['onFormSubmit'];
	}) {
		this.logger = createLogger('orbit:iframe_file_receiver');
		try {
			this.orbitOrigin = tryGetOriginFromUrlHash(window.location.hash);
		} catch (err) {
			initObject.onError(err as Error);
			this.orbitOrigin = '';
		}
		this.onFileTransferCompleted = initObject.onFileTransferCompleted;
		this.onFileChunkReceived = initObject.onFileChunkReceived;
		this.onError = (err: Error) => {
			this.logger.error(err instanceof Error ? err.message : String(err));
			this.state?.outgoingPort.postMessage({
				event: 'error',
				error: err instanceof Error ? err.message : String(err),
			});
			initObject.onError(err);
		};
		this.onFileTransferInit = initObject.onFileTransferInit;
		this.onFormSubmit = initObject.onFormSubmit;
	}

	public cancel() {
		this.state?.outgoingPort.postMessage({ event: 'cancel' });
	}

	public close() {
		this.disconnect?.();
		this.state = null;
	}

	public async connect(): Promise<() => void> {
		let disconnect = () => {
			return;
		};

		const connect = new Promise<void>((resolve) => {
			const onMessage = async (evt: MessageEvent<any>) => {
				if (evt.origin !== this.orbitOrigin || !isOrbitMessage(evt)) {
					return;
				}

				this.logger.debug('Received orbit message event');

				const data = evt.data;
				const event = data.event;

				switch (data.event) {
					case 'online.orbit::iframe_file_transfer#init': {
						this.logger.info('Connection to Orbit host established.');
						resolve();

						const outgoingPort: Maybe<MessagePort> = evt.ports?.[0] ?? null;
						if (outgoingPort == null) {
							throw new OrbitIframeFileTransferReceiverError(
								'Outgoing message port not present in init message',
							);
						}

						if (data.apiVersion !== 1) {
							throw new OrbitIframeFileTransferReceiverError(
								`OrbitFileReceiver only supports apiVersion 1, got: ${data.apiVersion}`,
							);
						}

						this.state = {
							bytesReceived: 0,
							file: null,
							fileBuffer: [],
							initMessage: data,
							outgoingPort,
						};

						this.onFileTransferInit(data);

						outgoingPort.postMessage({ event: 'initialized' });
						break;
					}
					case 'online.orbit::iframe_file_transfer#file_chunk': {
						if (this.state == null) {
							throw new OrbitIframeFileTransferReceiverError(
								`File buffer was not initialized, maybe the ${allOrbitMessageEvents[0]} event was missed.`,
							);
						}

						const bytes = decodeChunk(data.value);
						this.state.fileBuffer.push(bytes);
						this.state.bytesReceived += bytes.length;

						this.onFileChunkReceived?.(this.state.bytesReceived, this.state.initMessage.size, bytes.length);

						if (data.done) {
							this.logger.info('File transfer complete');
							this.state.file = new File(this.state.fileBuffer, this.state.initMessage.fileName, {
								lastModified: this.state.initMessage.lastModified,
								type: this.state.initMessage.mimeType,
							});

							if (this.state.file.size !== this.state.initMessage.size) {
								throw new OrbitIframeFileTransferReceiverError(
									`Transfered file is corrupt, expected size: ${this.state.initMessage.size}, got: ${this.state.file.size}`,
								);
							}

							this.onFileTransferCompleted?.(this.state.file);
						}

						break;
					}
					default:
						this.logger.debug(
							`Received non OrbitFileReceiver event: ${event} received from: ${this.orbitOrigin}`,
						);
						break;
				}
			};

			window.addEventListener('message', onMessage, { passive: true });
			disconnect = () => {
				window.removeEventListener('message', onMessage);
				disconnect = () => {
					return;
				};
			};
		});

		try {
			if (window.location.hash.includes('skipTimeoutCheck=true')) {
				// eslint-disable-next-line @secoya/orbit/proper-promise-use
				await connect;
			} else {
				await Promise.race([
					connect,
					rejectAfter(
						3000,
						`Connection to orbit host was not established within 3000ms, please verify if the data-orbit-origin URL hash has the correct value, the currently provided value is: "${this.orbitOrigin}".`,
						OrbitIframeFileTransferReceiverError,
					),
				]);
			}
		} catch (err) {
			disconnect();
			this.onError(err as Error);
		}

		return disconnect;
	}

	public createSubmitHandler(
		fileInput: HTMLInputElement,
		handlerType: 'react',
	): React.FormEventHandler<HTMLFormElement>;
	public createSubmitHandler(
		fileInput: HTMLInputElement,
		handlerType?: 'native' | undefined,
	): NonNullable<GlobalEventHandlers['onsubmit']>;
	public createSubmitHandler(fileInput: HTMLInputElement, _handlerType?: 'react' | 'native') {
		const self = this;
		// returning a plain old function instead of an arrow function here
		// to support assigned this result to a DOM element.
		//
		// const form = document.createElement('form');
		// form.onsubmit = createSubmitHandler('native');
		return async function onsubmit(evt: SubmitEvent | React.FormEvent<HTMLFormElement>) {
			evt.preventDefault();
			const state = self.state;
			if (state == null || state.file == null) {
				return;
			}

			if (fileInput.name.trim() === '') {
				self.onError(
					new OrbitIframeFileTransferReceiverError(
						`File input element <input /> must have a name attribute.
e.g.
<input name="file" />`,
					),
				);
				return;
			}

			evt.stopPropagation();
			const form = evt.currentTarget as HTMLFormElement;

			const formData = new FormData(form);
			formData.set(fileInput.name, state.file);

			try {
				const payload = await self.onFormSubmit(
					form.action,
					form.method,
					formData,
					state.initMessage.entityData,
				);
				state.outgoingPort.postMessage({ event: 'file-uploaded', payload });
			} catch (err) {
				self.onError(new OrbitIframeFileTransferReceiverError(err instanceof Error ? err.message : `${err}`));
			}
		};
	}
}
