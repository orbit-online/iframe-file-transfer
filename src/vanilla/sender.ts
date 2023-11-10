import { createIframeHandler, createIframeUrl } from '../lib/sender.js';
import { OrbitIframeFileTransferError, createLogger, querySelectorOne } from '../lib/util.js';

class OrbitIframeFileSenderError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_sender] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileSenderError.prototype);
	}
}

export const initializeSender = (iframeUrl?: string) => {
	return () => {
		const logger = createLogger('orbit:iframe_file_sender');
		logger.info('DOMContentLoaded');

		const iframeUrlInput = document.querySelector<HTMLInputElement>('input[data-orbit-file-sender-iframe-url]');
		if (iframeUrl == null && iframeUrlInput == null) {
			throw new OrbitIframeFileSenderError(`No iframe URL provided. It can be provided either via the an <input /> element with the [data-orbit-file-sender-iframe-url] attribute or as argument to the initializeSender() function.
e.g.:

<input type="text" data-orbit-file-sender-iframe-url />

or e.g.:
window.addEventListener('DOMContentLoaded', initializeSender(IFRAME_URL), { passive: true });
`);
		}

		if (iframeUrl != null && iframeUrlInput != null) {
			throw new OrbitIframeFileSenderError(
				"Iframe URL cannot be provided both by initializeSender('http://...') and <input data-orbit-file-sender-iframe-url />, you'll have to pick one.",
			);
		}

		const orbitFileIdInput = querySelectorOne<HTMLInputElement>(
			'input[data-orbit-file-sender-orbit-file-id]',
			OrbitIframeFileSenderError,
		);
		const input = querySelectorOne<HTMLInputElement>(
			'input[type=file][data-orbit-file-sender-input]',
			OrbitIframeFileSenderError,
		);
		const container = querySelectorOne<HTMLElement>(
			'[data-orbit-file-sender-container',
			OrbitIframeFileSenderError,
		);
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
		const iframePlaceholder = document.querySelector<HTMLElement>('[data-orbit-file-sender-iframe-placeholder]');

		let iframe: Maybe<HTMLIFrameElement> = null;
		const swapOrRemove = () => {
			if (iframe != null) {
				if (iframePlaceholder == null) {
					iframe.remove();
				} else {
					iframe.replaceWith(iframePlaceholder);
				}
			}
		};

		input.addEventListener(
			'input',
			(_evt: Event) => {
				logger.debug('File input changed');

				swapOrRemove();

				const file = input.files?.[0] ?? null;
				if (file == null) {
					return;
				}

				const resolvedIframeUrl = iframeUrl ?? iframeUrlInput?.value;
				if (resolvedIframeUrl == null) {
					throw new OrbitIframeFileSenderError('Could not resolve iframe URL');
				}

				iframe = document.createElement('iframe');
				iframe.src = createIframeUrl(resolvedIframeUrl);
				iframe.onload = createIframeHandler({
					chunkSize: chunkSizeInput?.valueAsNumber,
					entityData: entityDataInput.value,
					file: file,
					onCancel: () => {
						alert('File upload cancelled.');
						swapOrRemove();
					},
					onComplete: () => {
						alert('File upload completed.');
						swapOrRemove();
					},
					onError: (err) => alert(err instanceof Error ? err.message : JSON.stringify(err)),
					orbitFileId: orbitFileIdInput.value,
					throttle: throttleInput?.valueAsNumber,
				});

				if (iframePlaceholder == null) {
					container.appendChild(iframe);
				} else {
					iframePlaceholder.replaceWith(iframe);
				}
			},
			{ passive: false },
		);
	};
};
