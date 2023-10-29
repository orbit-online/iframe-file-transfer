import {
	Logger,
	OrbitIframeFileTransferError,
	createLogger,
	createReadStream,
	querySelectorOne,
	sleep,
} from './util.js';

class OrbitIframeFileSenderError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_sender] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileSenderError.prototype);
	}
}

interface State {
	readonly logger: Logger;
	get file(): Maybe<File>;
	set file(file: Maybe<File>);
}

const createState = (
	logger: Logger,
	orbitFileIdInput: HTMLInputElement,
	container: HTMLElement,
	entityDataInput: HTMLTextAreaElement,
	chunkSizeInput: Maybe<HTMLInputElement>,
	throttleInput: Maybe<HTMLInputElement>,
): State => {
	interface InnerState {
		channel: Maybe<MessageChannel>;
		file: Maybe<File>;
		iframe: Maybe<HTMLIFrameElement>;
	}
	const innerState: InnerState = {
		file: null,
		iframe: null,
		channel: null,
	};

	return {
		logger,
		set file(file: Maybe<File>) {
			if (file == innerState.file) {
				return;
			}

			innerState.iframe?.remove();

			innerState.iframe = null;
			innerState.channel = null;
			innerState.file = file;

			if (file == null) {
				return;
			}

			const iframe = document.createElement('iframe');
			const channel = new MessageChannel();

			channel.port1.onmessage = createIncommingMessageHandler(file, iframe, chunkSizeInput, throttleInput);

			iframe.classList.add('w-96');
			iframe.onload = createIframeLoadedHandler(logger, file, iframe, channel, orbitFileIdInput, entityDataInput);
			iframe.src = `http://localhost:3001/iframe.html#data-orbit-origin=${encodeURIComponent(
				window.location.origin,
			)}`;

			innerState.channel = channel;
			innerState.iframe = iframe;

			container.appendChild(iframe);
		},
		get file() {
			return innerState.file;
		},
	};
};

const createInputChangeHandler = (input: HTMLInputElement, state: State) => (_e: Event) => {
	state.file = input.files?.[0] ?? null;
	if (state.file == null) {
		return;
	}
	state.logger.debug('File input changed');
};

const createIframeLoadedHandler =
	(
		logger: Logger,
		file: File,
		iframe: HTMLIFrameElement,
		channel: MessageChannel,
		orbitFileIdInput: HTMLInputElement,
		entityDataInput: HTMLTextAreaElement,
	) =>
	() => {
		logger.info('iframe onload.');
		const { contentWindow } = iframe;
		if (contentWindow === null) {
			throw new OrbitIframeFileSenderError('contentWindow is not present in iframe.');
		}

		const entityData = JSON.parse(entityDataInput.value);

		contentWindow.postMessage(
			{
				apiVersion: 1,
				event: 'online.orbit::iframe_file_transfer#init',
				orbitFileId: orbitFileIdInput.value,
				entityData: entityData,
				fileName: file.name,
				lastModified: file.lastModified,
				mimeType: file.type,
				size: file.size,
			},
			'*',
			[channel.port2],
		);
	};

const createIncommingMessageHandler =
	(
		file: File,
		iframe: HTMLIFrameElement,
		chunkSizeInput: HTMLInputElement | null,
		throttleInput: HTMLInputElement | null,
	) =>
	async (evt: MessageEvent<any>) => {
		const { contentWindow } = iframe;
		if (contentWindow === null) {
			throw new OrbitIframeFileSenderError('contentWindow is not present in iframe.');
		}

		const data = evt.data;
		switch (data.event) {
			case 'initialized': {
				const chunkSize = chunkSizeInput?.valueAsNumber ?? 1024 * 1024;
				const throttle = throttleInput?.valueAsNumber ?? 0;

				const stream = createReadStream(file, 'base64', chunkSize);
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
					if (throttle > 0) {
						await sleep(throttle);
					}
				} while (chunk.done !== true);
				break;
			}
			case 'file-uploaded': {
				debugger;
				break;
			}

			default:
				debugger;
		}
	};

const initializeSender = () => {
	const logger = createLogger('orbit:iframe_file_sender');
	logger.info('DOMContentLoaded');

	const orbitFileIdInput = querySelectorOne<HTMLInputElement>(
		'input[data-orbit-file-sender-orbit-file-id]',
		OrbitIframeFileSenderError,
	);
	const input = querySelectorOne<HTMLInputElement>(
		'input[type=file][data-orbit-file-sender-input]',
		OrbitIframeFileSenderError,
	);
	const container = querySelectorOne<HTMLElement>('[data-orbit-file-sender-container', OrbitIframeFileSenderError);
	const entityDataInput = querySelectorOne<HTMLTextAreaElement>(
		'textarea[data-orbit-file-sender-entity-data]',
		OrbitIframeFileSenderError,
	);
	const chunkSizeInput = document.querySelector<HTMLInputElement>(
		'input[type=range][data-orbit-file-transfer-chunk-size]',
	);
	const throttleInput = document.querySelector<HTMLInputElement>(
		'input[type=range][data-orbit-file-transfer-throttle]',
	);

	input.addEventListener(
		'input',
		createInputChangeHandler(
			input,
			createState(logger, orbitFileIdInput, container, entityDataInput, chunkSizeInput, throttleInput),
		),
		{ passive: false },
	);
};

window.addEventListener('DOMContentLoaded', initializeSender, { passive: true });
