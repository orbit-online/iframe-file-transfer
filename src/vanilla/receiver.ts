import {
	OrbitIframeFileTransferReceiver,
	OrbitIframeFileTransferReceiverError,
	SubmitHandler,
	querySelectorOne,
	tryGetOriginFromUrlHash,
} from '../lib/receiver.js';
import { createLogger } from '../lib/util.js';

function tryGetErrorContainerElement(): HTMLElement {
	const errorContainer = querySelectorOne<HTMLElement>(
		'[data-orbit-file-receiver-error-container]',
		`Couldn't find any error container element, there must exist an element in the DOM with the data-orbit-file-receiver-error-container attribute present.
E.g. <div className="..." data-orbit-file-receiver-error-container></div>`,
	);
	const dataDisplay = errorContainer.getAttribute('data-display');
	if (dataDisplay == null || dataDisplay === '') {
		errorContainer.setAttribute(
			'data-display',
			window.getComputedStyle(errorContainer).getPropertyValue('display'),
		);
	}

	errorContainer.style.display = 'none';
	errorContainer.style.whiteSpace = 'pre-wrap';

	return errorContainer;
}

function tryGetFormElement(): HTMLFormElement {
	return querySelectorOne<HTMLFormElement>(
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
}

function tryGetFileIdInputElement(): HTMLInputElement {
	return querySelectorOne<HTMLInputElement>(
		'input[type=hidden][name][data-orbit-file-receiver-file-id]',
		`File id input element <input type="hidden" /> wasn't found, there must exist an input element of type "hidden" present in the DOM with the orbit-file-receiver-file-id attribute assigned.
e.g
<form ...>
	<input type="hidden" name="..." data-orbit-file-receiver-file-id />
</form>`,
	);
}

function tryGetFileInputElement(): HTMLInputElement {
	return querySelectorOne<HTMLInputElement>(
		'input[type=file][data-orbit-file-receiver-input]',
		`File input element <input type="file" /> wasn't found, there must exist an input element of type "file" present in the DOM with the orbit-file-receiver-input attribute assigned.
e.g
<form ...>
<input type="file" name="file" data-orbit-file-receiver-input />
</form>`,
	);
}

function tryGetSubmitHandler(form: HTMLFormElement): SubmitHandler {
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
			`Couldn't find submit handler in global scope with name: ${submitHandlerName}.
Please check if the function name is spelled correctly.`,
		);
	}
	return submitHandler;
}

window.addEventListener(
	'DOMContentLoaded',
	async () => {
		const logger = createLogger('orbit:iframe_file_receiver');
		logger.info('DOMContentLoaded');

		// eslint-disable-next-line no-undef-init
		let errorContainer: HTMLElement | undefined = undefined;
		const errorHandler = (err: unknown) => {
			if (err instanceof Error) {
				if (errorContainer == null) {
					alert(err.message);
				} else {
					const dataDisplay = errorContainer.getAttribute('data-display');
					errorContainer.textContent = err.message;
					errorContainer.style.display =
						dataDisplay == null || dataDisplay === '' || dataDisplay === 'none' ? 'initial' : dataDisplay;
				}
			} else {
				if (errorContainer == null) {
					alert(JSON.stringify(err));
				} else {
					const dataDisplay = errorContainer.getAttribute('data-display');
					errorContainer.textContent = JSON.stringify(err);
					errorContainer.style.display =
						dataDisplay == null || dataDisplay === '' || dataDisplay === 'none' ? 'initial' : dataDisplay;
				}
			}
		};

		try {
			errorContainer = tryGetErrorContainerElement();

			const form = tryGetFormElement();
			const fileIdInput = tryGetFileIdInputElement();
			const fileInput = tryGetFileInputElement();
			const submitHandler = tryGetSubmitHandler(form);
			const orbitOrigin = tryGetOriginFromUrlHash(window.location.hash);

			form.setAttribute('data-orbit-origin', orbitOrigin);

			const entityDataContainer = document.querySelector<HTMLPreElement>(
				'pre[data-orbit-file-receiver-entity-data]',
			);
			const cancel = document.querySelector<HTMLInputElement>(
				'input[type=button][data-orbit-file-receiver-cancel]',
			);
			const image = document.querySelector<HTMLImageElement>('img[data-orbit-file-receiver-image]');
			const progress = document.querySelector<HTMLProgressElement>('progress[data-orbit-file-receiver-progress]');

			if (cancel == null) {
				logger.debug('<input type=button /> Cancel button element not found, skipping...');
			} else {
				logger.debug('<input type=button /> Cancel button element found.');
			}
			if (image == null) {
				logger.debug('<img /> Image preview element not found, skipping...');
			} else {
				logger.debug('<img /> Image preview element found.');
			}
			if (progress == null) {
				logger.debug('<progress /> File transfer progress indicator element not found, skipping...');
			} else {
				logger.debug('<progress /> File transfer progress indicator element found.');
			}

			if (entityDataContainer == null) {
				logger.debug('<pre /> Entity data container not found, skipping...');
			} else {
				logger.debug('<pre /> Entity data container found.');
			}

			fileIdInput.disabled = true;
			fileInput.setAttribute('type', 'text');
			fileInput.disabled = true;
			fileInput.required = true;

			const receiver = new OrbitIframeFileTransferReceiver({
				onFormSubmit: submitHandler,
				onError: errorHandler,
				onFileTransferInit: (msg) => {
					fileIdInput.value = msg.orbitFileId;
					fileInput.value = msg.fileName;

					if (entityDataContainer != null) {
						entityDataContainer.textContent = JSON.stringify(msg.entityData, undefined, 4);
					}

					document.querySelectorAll('input[data-orbit-file-receiver-entity-data-value]').forEach((elm) => {
						if (elm instanceof HTMLInputElement) {
							const key = elm.dataset.orbitFileReceiverEntityDataValue;
							if (key != null && msg.entityData[key] != null) {
								elm.value = msg.entityData[key];
							}
						}
					});
				},
				onFileChunkReceived: (bytesReceived, totalSize) => {
					if (progress != null) {
						progress.value = (bytesReceived / totalSize) * 100;
					}
				},
				onFileTransferCompleted: (file) => {
					if (image != null && file.type.startsWith('image/')) {
						const fileReader = new FileReader();
						fileReader.onload = () => {
							if (typeof fileReader.result === 'string') {
								image.src = fileReader.result;
								image.style.display = 'block';
							}
						};
						fileReader.readAsDataURL(file);
					}
				},
			});

			form.addEventListener('submit', receiver.createSubmitHandler(fileInput), { passive: false });

			if (cancel != null) {
				cancel.addEventListener('click', () => receiver.cancel(), { passive: false });
			}

			await receiver.connect();
		} catch (err) {
			errorHandler(err);
		}
	},
	{ passive: true },
);
