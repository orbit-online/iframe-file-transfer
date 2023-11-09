import { createIframeHandler, createIframeUrl } from '../lib/sender.js';
import { OrbitIframeFileTransferError, createLogger, querySelectorOne } from '../lib/util.js';

class OrbitIframeFileSenderError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_sender] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileSenderError.prototype);
	}
}

export const initializeSender = (iframUrl: string) => {
	return () => {
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

		let iframe: Maybe<HTMLIFrameElement> = null;
		input.addEventListener(
			'input',
			(_evt: Event) => {
				logger.debug('File input changed');

				iframe?.remove();
				const file = input.files?.[0] ?? null;
				if (file == null) {
					return;
				}

				iframe = document.createElement('iframe');
				iframe.src = createIframeUrl(iframUrl);
				iframe.onload = createIframeHandler(
					file,
					orbitFileIdInput.value,
					entityDataInput.value,
					() => {
						alert('File upload completed.');
						iframe?.remove();
					},
					() => {
						alert('File upload cancelled.');
						iframe?.remove();
					},
					chunkSizeInput?.valueAsNumber,
					throttleInput?.valueAsNumber,
				);

				container.appendChild(iframe);
			},
			{ passive: false },
		);
	};
};