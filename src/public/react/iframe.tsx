import { createLogger, querySelectorOne, rejectAfter } from '../util.js';
import { OrbitIframeFileTransferReceiverError, SubmitHandler, tryGetOriginFromUrlHash } from '../receiver.js';

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

interface State {
	bytesReceived: number;
	file: Maybe<File>;
	fileBuffer: Uint8Array[];
	initMessage: OrbitInitMessage;
	outgoingPort: MessagePort;
}

function useOrbitIframeFileTransferReceiver(errorHandler: (err: Maybe<Error>) => void, submitHandler: SubmitHandler) {
	const stateRef = React.useRef<State>();
	const [orbitEntityData, setOrbitEntityData] = React.useState<Record<string, any>>({});
	const logger = React.useMemo(() => createLogger('orbit:iframe_file_receiver'), []);

	const formRef = React.useRef<HTMLFormElement>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const fileIdInputRef = React.useRef<HTMLInputElement>(null);
	const errorContainerRef = React.useRef<HTMLElement>(null);
	const imageRef = React.useRef<HTMLImageElement>(null);
	const progressRef = React.useRef<HTMLProgressElement>(null);

	React.useEffect(() => {
		let listener: Maybe<(evt: MessageEvent<any>) => Promise<void>> = null;
		try {
			const form = formRef.current;
			if (form == null) {
				throw new OrbitIframeFileTransferReceiverError(
					`<form /> element wasn't found, there must exist a <form /> element in the DOM assigned to the formRef from the useOrbitIframeFileTransferReceiver hook.
e.g.
const iframeFileTrasnferReceiver = useOrbitIframeFileTransferReceiver(errorHandler, submitHandler);
return (
    <form ref={iframeFileTrasnferReceiver.formRef}>
        ...
    </form>
);`,
				);
			}

			const fileIdInput = fileIdInputRef.current;
			if (fileIdInput == null) {
				throw new OrbitIframeFileTransferReceiverError(
					`File id input element <input /> wasn't found, there must exist an input element present in the DOM assigned to the fileIdInputRef from the useOrbitIframeFileTransferReceiver hook.
e.g.
const iframeFileTrasnferReceiver = useOrbitIframeFileTransferReceiver(errorHandler, submitHandler);
return (
    <form ...>
        <input type="hidden" name="..." ref={iframeFileTrasnferReceiver.fileIdInputRef} />
    </form>
);`,
				);
			}

			const fileInput = fileInputRef.current;
			if (fileInput == null) {
				throw new OrbitIframeFileTransferReceiverError(
					`File id input element <input /> wasn't found, there must exist an input element present of type=file present in the DOM assigned to the fileInputRef from the useOrbitIframeFileTransferReceiver hook.
e.g.
const iframeFileTrasnferReceiver = useOrbitIframeFileTransferReceiver(errorHandler, submitHandler);
return (
    <form ...>
        <input type="file" name="file" ref={iframeFileTrasnferReceiver.fileInputRef} />
    </form>
);`,
				);
			}

			const orbitOrigin = tryGetOriginFromUrlHash(window.location.hash);
			form.setAttribute('data-orbit-origin', orbitOrigin);

			imageRef.current == null
				? logger.debug('<img /> Image preview element not found, skipping...')
				: logger.debug('<img /> Image preview element found.');
			progressRef.current == null
				? logger.debug('<progress /> File transfer progress indicator element not found, skipping...')
				: logger.debug('<progress /> File transfer progress indicator element found.');

			const connect = new Promise<void>((resolve) => {
				listener = async (evt: MessageEvent<any>) => {
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

							stateRef.current = {
								bytesReceived: 0,
								file: null,
								fileBuffer: [],
								initMessage: data,
								outgoingPort,
							};

							fileIdInput.value = data.orbitFileId;
							fileInput.value = data.fileName;

							setOrbitEntityData(data.entityData);

							outgoingPort.postMessage({ event: 'initialized' });
							break;
						}
						case 'online.orbit::iframe_file_transfer#file_chunk': {
							if (stateRef.current == null) {
								throw new OrbitIframeFileTransferReceiverError(
									`File buffer was not initialized, maybe the ${allOrbitMessageEvents[0]} event was missed.`,
								);
							}

							const bytes = decodeChunk(data.value);
							stateRef.current.fileBuffer.push(bytes);
							stateRef.current.bytesReceived += bytes.length;

							if (progressRef.current != null) {
								progressRef.current.value =
									(stateRef.current.bytesReceived / stateRef.current.initMessage.size) * 100;
							}

							if (data.done) {
								logger.info('File transfer complete');
								stateRef.current.file = new File(
									stateRef.current.fileBuffer,
									stateRef.current.initMessage.fileName,
									{
										lastModified: stateRef.current.initMessage.lastModified,
										type: stateRef.current.initMessage.mimeType,
									},
								);

								if (stateRef.current.file.size !== stateRef.current.initMessage.size) {
									throw new OrbitIframeFileTransferReceiverError(
										`Transfered file is corrupt, expected size: ${stateRef.current.initMessage.size}, got: ${stateRef.current.file.size}`,
									);
								}

								if (imageRef.current != null && stateRef.current.file.type.startsWith('image/')) {
									const fileReader = new FileReader();
									fileReader.onload = () => {
										if (typeof fileReader.result === 'string') {
											imageRef.current!.src = fileReader.result;
											imageRef.current!.style.display = 'block';
										}
									};
									fileReader.readAsDataURL(stateRef.current.file);
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
				};

				window.addEventListener('message', listener, { passive: true });
			});

			if (window.location.hash.includes('skipTimeoutCheck=true')) {
				connect.catch(errorHandler);
			} else {
				Promise.race([
					connect,
					rejectAfter(
						3000,
						`Connection to orbit host was not established within 3000ms, please verify if the data-orbit-origin URL hash has the correct value, the currently provided value is: "${orbitOrigin}".`,
						OrbitIframeFileTransferReceiverError,
					),
				]).catch(errorHandler);
			}
		} catch (err) {
			errorHandler(err as Error);
		}

		return () => {
			if (listener != null) {
				window.removeEventListener('message', listener);
			}
		};
	}, []);

	const onSubmit = React.useCallback(
		async (e: React.FormEvent<HTMLFormElement>) => {
			e.preventDefault();
			const state = stateRef.current;
			const form = formRef.current;
			const fileInput = fileInputRef.current;

			if (state == null || state.file == null || form == null || fileInput == null) {
				return;
			}

			const formData = new FormData(e.currentTarget);
			formData.set(fileInput.name, state.file);

			try {
				const payload = await submitHandler(form.action, form.method, formData, state.initMessage.entityData);
				state.outgoingPort.postMessage({ event: 'file-uploaded', payload: payload == null ? null : payload });
			} catch (err) {
				errorHandler(err as Error);
			}
		},
		[errorHandler, submitHandler],
	);

	const onCancel = React.useCallback((e: React.MouseEvent<any>) => {
		const state = stateRef.current;
		if (state == null) {
			return;
		}
		state.outgoingPort.postMessage({ event: 'cancel' });
	}, []);

	return {
		errorContainerRef,
		fileIdInputRef,
		fileInputRef,
		formRef,
		imageRef,
		orbitEntityData,
		onCancel,
		onSubmit,
		progressRef,
	};
}

/**
 * If simple value "data-binding" in the form isn't sufficient
 * you can yield to set values imperativly through the [FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData) Web API
 * and the `orbitEntityData` object.
 *
 * @param {string} url
 * @param {string} method
 * @param {FormData} formData
 * @param {Record<string, any>} orbitEntityData
 */
async function onOrbitFileReceiverFormSubmit(
	url: string,
	method: string,
	formData: FormData,
	orbitEntityData: Record<string, string | number | boolean | null | undefined>,
) {
	const request = new Request(url, {
		method,
		body: formData,
	});

	const response = await fetch(request);
	return response.json();
}

interface AppProps {}

const errorContainerStyles: React.CSSProperties = {
	backgroundColor: '#fff5f5',
	border: 'none',
	borderLeftColor: '#fc8181',
	borderLeftStyle: 'solid',
	borderLeftWidth: 4,
	color: '#c53030',
	gridColumn: '1 / 3',
	padding: '1rem',
	whiteSpace: 'pre-wrap',
};

const App = (props: AppProps) => {
	const [error, setError] = React.useState<Maybe<Error>>(null);
	const iframeFileTrasnferReceiver = useOrbitIframeFileTransferReceiver(setError, onOrbitFileReceiverFormSubmit);

	const errorContainer = error == null ? null : <div style={errorContainerStyles}>{error.message}</div>;

	return (
		<form
			action="/upload"
			encType="multipart/form-data"
			method="post"
			onSubmit={iframeFileTrasnferReceiver.onSubmit}
			ref={iframeFileTrasnferReceiver.formRef}>
			{errorContainer}
			<input type="hidden" name="orbitFileId" ref={iframeFileTrasnferReceiver.fileIdInputRef} required />
			<label>
				<span>Project number</span>
				<input
					type="text"
					disabled
					name="projectNumber"
					value={iframeFileTrasnferReceiver.orbitEntityData.externalId}
				/>
			</label>
			<label>
				<span>Project name</span>
				<input
					type="text"
					disabled
					name="projectName"
					value={iframeFileTrasnferReceiver.orbitEntityData.projectName}
				/>
			</label>
			<label>
				<span>Project start</span>
				<input
					type="date"
					disabled
					name="projectStart"
					value={iframeFileTrasnferReceiver.orbitEntityData.projectStart}
				/>
			</label>
			<label>
				<span>Project end</span>
				<input
					type="date"
					disabled
					name="projectEnd"
					value={iframeFileTrasnferReceiver.orbitEntityData.projectEnd}
				/>
			</label>
			<label>
				<span>File</span>
				<input ref={iframeFileTrasnferReceiver.fileInputRef} name="file" required disabled type="text" />
				<progress ref={iframeFileTrasnferReceiver.progressRef} max="100" value="0"></progress>
				<img ref={iframeFileTrasnferReceiver.imageRef} style={{ display: 'none' }} />
			</label>

			<label>
				<span>Picture taken at</span>
				<input type="date" name="pictureTakenAt" required />
			</label>

			<label>
				<span>Keywords</span>
				<select name="keywords[]" multiple>
					<option value="advisor">Advisor</option>
					<option value="construction">Construction</option>
					<option value="highlighted">Highlighted</option>
				</select>
			</label>

			<div style={{ gridColumn: '2 / 3', justifySelf: 'end' }}>
				<input type="button" value="Cancel" onClick={iframeFileTrasnferReceiver.onCancel} />
				<input type="submit" value="Upload" />
			</div>

			<div style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / 3' }}>
				<h2>Orbit entity data available</h2>
				<pre style={{ flex: '1 1 0%' }}>
					{JSON.stringify(iframeFileTrasnferReceiver.orbitEntityData, undefined, 4)}
				</pre>
			</div>
		</form>
	);
};

document.addEventListener('DOMContentLoaded', () => {
	const root = querySelectorOne<HTMLDivElement>('#root', Error);
	ReactDOM.render(<App />, root);
});
