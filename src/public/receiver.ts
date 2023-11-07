import {
	querySelectorOne as querySelectorOneBase,
	OrbitIframeFileTransferError,
	createLogger,
	rejectAfter,
} from './util.js';

export class OrbitIframeFileTransferReceiverError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_receiver] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileTransferReceiverError.prototype);
	}
}

export type SubmitHandler = <E, R>(url: string, method: string, formData: FormData, orbitEntityData: E) => Promise<R>;

const querySelectorOne = <TElement extends Element = Element>(selector: string, errorMessage: string): TElement => {
	try {
		return querySelectorOneBase<TElement>(selector, OrbitIframeFileTransferReceiverError);
	} catch (err) {
		if (err instanceof OrbitIframeFileTransferError) {
			throw new OrbitIframeFileTransferReceiverError(err.cause === 'absent' ? errorMessage : err.message);
		}
		throw err;
	}
};

interface OrbitInitMessage {
	readonly apiVersion: number;
	readonly event: 'online.orbit::iframe_file_transfer#init';
	readonly entityData: Record<string, any>;
	readonly orbitFileId: string;
	readonly fileName: string;
	readonly lastModified: number;
	readonly mimeType: string;
	readonly size: number;
}

interface OrbitFileChunkMessage {
	readonly event: 'online.orbit::iframe_file_transfer#file_chunk';
	readonly idx: number;
	readonly value: string;
	readonly done: boolean;
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

const isOrbitMessage = (evt: any): evt is OrbitMessageEvent =>
	typeof evt === 'object' &&
	evt != null &&
	typeof evt.data === 'object' &&
	evt.data != null &&
	typeof evt.data.event === 'string' &&
	allOrbitMessageEvents.includes(evt.data.event);

const decodeChunk = (chunk: string): Uint8Array => {
	const byteString = atob(chunk);
	let idx = byteString.length;
	const u8arr = new Uint8Array(idx);
	while (idx--) {
		u8arr[idx] = byteString.charCodeAt(idx);
	}
	return u8arr;
};

const tryGetErrorContainerElement = (): HTMLElement => {
	const errorContainer = querySelectorOne<HTMLElement>(
		'[data-orbit-file-receiver-error-container]',
		`Couldn't find any error container element, there must exist an element in the DOM with the data-orbit-file-receiver-error-container attribute present.
E.g. <div className="..." data-orbit-file-receiver-error-container></div>`,
	);
	errorContainer.style.display = 'none';
	errorContainer.style.whiteSpace = 'pre-wrap';

	return errorContainer;
};

const tryGetFromElement = (): HTMLFormElement =>
	querySelectorOne<HTMLFormElement>(
		'form[data-orbit-file-receiver]',
		`<form /> element wasn't found, there must exist a <form /> element in the DOM with the data-orbit-file-receiver assigned to the name of a submit handler function present in global scope.
e.g.:
<html>
<head>
<script type="module">
globalThis.onSubmitHandler = async (url, method, formData, orbitEntityData) => {
return fetch(url, { method, body: formData }).then(res => res.json());
};
</script>
</head>
<body>
<form
data-orbit-file-receiver="onSubmitHandler"
action="/upload"
enctype="multipart/form-data"
method="post"
>
...
</form>
</body>
</html>
`,
	);

const tryGetFileIdInputElement = (): HTMLInputElement =>
	querySelectorOne<HTMLInputElement>(
		'input[type=hidden][name][data-orbit-file-receiver-file-id]',
		`File id input element <input type="hidden" /> wasn't found, there must exist an input element of type "hidden" present in the DOM with the orbit-file-receiver-file-id attribute assigned.
e.g
<form ...>
	<input type="hidden" name="..." data-orbit-file-receiver-file-id />
</form>`,
	);

const tryGetFileInputElement = (): HTMLInputElement =>
	querySelectorOne<HTMLInputElement>(
		'input[type=file][data-orbit-file-receiver-input]',
		`File input element <input type="file" /> wasn't found, there must exist an input element of type "file" present in the DOM with the orbit-file-receiver-input attribute assigned.
e.g
<form ...>
<input type="file" name="file" data-orbit-file-receiver-input />
</form>`,
	);

const tryGetSubmitHandler = (form: HTMLFormElement): SubmitHandler => {
	const submitHandlerName = form.dataset.orbitFileReceiver?.trim() ?? '';
	if (submitHandlerName.length === 0) {
		throw new OrbitIframeFileTransferReceiverError(
			`<form /> has invalid value for the [data-orbit-file-receiver] attribute: "${form.dataset.orbitFileReceiver}". It should correspond to a function name in global scope.
e.g.:
<html>
<head>
<script type="module">
globalThis.onSubmitHandler = async (url, method, formData, orbitEntityData) => {
return fetch(url, { method, body: formData }).then(res => res.json());
};
</script>
</head>
<body>
<form
data-orbit-file-receiver="onSubmitHandler"
action="/upload"
enctype="multipart/form-data"
method="post"
>
...
</form>
</body>
</html>
`,
		);
	}

	const submitHandler = (globalThis as any)[submitHandlerName] as Maybe<SubmitHandler>;
	if (submitHandler == null) {
		throw new OrbitIframeFileTransferReceiverError(
			`Couldn't find submit handler in global scope with name: ${submitHandlerName}.`,
		);
	}
	return submitHandler;
};

const tryGetOriginFromUrlHash = (hash: string): string => {
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
};

window.addEventListener(
	'DOMContentLoaded',
	async () => {
		const logger = createLogger('orbit:iframe_file_receiver');
		logger.info('DOMContentLoaded');

		let errorContainer: HTMLElement | undefined = undefined;
		try {
			errorContainer = tryGetErrorContainerElement();

			const form = tryGetFromElement();
			const fileIdInput = tryGetFileIdInputElement();
			const fileInput = tryGetFileInputElement();
			const submitHandler = tryGetSubmitHandler(form);
			const orbitOrigin = tryGetOriginFromUrlHash(window.location.hash);

			form.setAttribute('data-orbit-origin', orbitOrigin);

			const entityDataContainer = document.querySelector<HTMLPreElement>(
				'pre[data-orbit-file-receiver-entity-data]',
			);
			const cancel = document.querySelector<HTMLInputElement>('input[type=button][data-orbit-file-receiver-cancel]');
			const image = document.querySelector<HTMLImageElement>('img[data-orbit-file-receiver-image]');
			const progress = document.querySelector<HTMLProgressElement>('progress[data-orbit-file-receiver-progress]');

			cancel == null
				? logger.debug('<input type=button /> Cancel button element not found, skipping...')
				: logger.debug('<input type=button /> Cancel button element found.');
			image == null
				? logger.debug('<img /> Image preview element not found, skipping...')
				: logger.debug('<img /> Image preview element found.');
			progress == null
				? logger.debug('<progress /> File transfer progress indicator element not found, skipping...')
				: logger.debug('<progress /> File transfer progress indicator element found.');

			entityDataContainer == null
				? logger.debug('<pre /> Entity data container not found, skipping...')
				: logger.debug('<pre /> Entity data container found.');

			fileIdInput.disabled = true;
			fileInput.setAttribute('type', 'text');
			fileInput.disabled = true;
			fileInput.required = true;

			let state: Maybe<State> = null;

			if (cancel != null) {
				cancel.addEventListener('click', () => {
					state?.outgoingPort.postMessage({ event: 'cancel' });
				}, { passive: false });
			}

			form.addEventListener(
				'submit',
				async (evt) => {
					evt.preventDefault();
					if (state == null || state.file == null) {
						return;
					}

					const formData = new FormData(form);
					formData.set(fileInput.name, state.file);

					try {
						const payload = await submitHandler(
							form.action,
							form.method,
							formData,
							state.initMessage.entityData,
						);
						state.outgoingPort.postMessage({ event: 'file-uploaded', payload });
					} catch (err) {
						throw new OrbitIframeFileTransferReceiverError(err instanceof Error ? err.message : `${err}`);
					}
				},
				{ passive: false },
			);

			const connect = new Promise<void>((resolve) => {
				window.addEventListener(
					'message',
					async (evt) => {
						if (evt.origin !== orbitOrigin || !isOrbitMessage(evt)) {
							return;
						}

						logger.debug('Received orbit message event');

						const data = evt.data;
						const event = data.event;

						switch (data.event) {
							case 'online.orbit::iframe_file_transfer#init': {
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

								state = {
									bytesReceived: 0,
									file: null,
									fileBuffer: [],
									initMessage: data,
									outgoingPort,
								};

								fileIdInput.value = data.orbitFileId;
								fileInput.value = data.fileName;

								if (entityDataContainer != null) {
									entityDataContainer.textContent = JSON.stringify(data.entityData, undefined, 4);
								}

								document
									.querySelectorAll('input[data-orbit-file-receiver-entity-data-value]')
									.forEach((elm) => {
										if (elm instanceof HTMLInputElement) {
											const key = elm.dataset.orbitFileReceiverEntityDataValue;
											if (key != null && data.entityData[key] != null) {
												elm.value = data.entityData[key];
											}
										}
									});

								outgoingPort.postMessage({ event: 'initialized' });
								break;
							}
							case 'online.orbit::iframe_file_transfer#file_chunk': {
								if (state == null) {
									throw new OrbitIframeFileTransferReceiverError(
										`File buffer was not initialized, maybe the ${allOrbitMessageEvents[0]} event was missed.`,
									);
								}

								const bytes = decodeChunk(data.value);
								state.fileBuffer.push(bytes);
								state.bytesReceived += bytes.length;

								if (progress != null) {
									progress.value = (state.bytesReceived / state.initMessage.size) * 100;
								}

								if (data.done) {
									logger.info('File transfer complete');
									state.file = new File(state.fileBuffer, state.initMessage.fileName, {
										lastModified: state.initMessage.lastModified,
										type: state.initMessage.mimeType,
									});

									if (state.file.size !== state.initMessage.size) {
										throw new OrbitIframeFileTransferReceiverError(
											`Transfered file is corrupt, expected size: ${state.initMessage.size}, got: ${state.file.size}`,
										);
									}

									if (image != null && state.file.type.startsWith('image/')) {
										const fileReader = new FileReader();
										fileReader.onload = () => {
											if (typeof fileReader.result === 'string') {
												image.src = fileReader.result;
												image.style.display = 'block';
											}
										};
										fileReader.readAsDataURL(state.file);
									}
								}

								break;
							}
							default:
								logger.debug(
									`Received non OrbitFileReceiver event: ${event} received from: ${orbitOrigin}`,
								);
								break;
						}
					},
					{ passive: true },
				);
			});

			if (window.location.hash.includes('skipTimeoutCheck=true')) {
				await connect;
			} else {
				await Promise.race([
					connect,
					rejectAfter(
						3000,
						`Connection to orbit host was not established within 3000ms, please verify if the data-orbit-origin URL hash has the correct value, the currently provided value is: "${orbitOrigin}".`,
						OrbitIframeFileTransferReceiverError,
					),
				]);
			}
		} catch (err) {
			if (err instanceof Error) {
				errorContainer == null
					? alert(err.message)
					: ((errorContainer.textContent = err.message), (errorContainer.style.display = 'initial'));
			} else {
				errorContainer == null
					? alert(JSON.stringify(err))
					: ((errorContainer.textContent = JSON.stringify(err)), (errorContainer.style.display = 'initial'));
			}
			throw err;
		}
	},
	{ passive: true },
);
