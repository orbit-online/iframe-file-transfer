import { OrbitIframeFileTransferError, createReadStream, sleep } from './util.js';

class OrbitIframeFileSenderError extends OrbitIframeFileTransferError {
	public constructor(msg: string, options?: ErrorOptions) {
		super(`[orbit:iframe_file_sender] ${msg}`, options);
		Object.setPrototypeOf(this, OrbitIframeFileSenderError.prototype);
	}
}

export function createIframeUrl(url: string) {
	const hash = `data-orbit-origin=${encodeURIComponent(window.origin)}`;
	return url.includes('#') ? `${url}&${hash}` : `${url}#${hash}`;
}

export function createIframeHandler(
	file: Maybe<File>,
	orbitFileId: string,
	entityData: string,
	onComplete: () => void,
	onCancel: () => void,
	chunkSize?: number,
	throttle?: number,
) {
	if (file == null) {
		return null;
	}

	return (evt: React.SyntheticEvent<HTMLIFrameElement> | Event) => {
		const iframe = evt.currentTarget as EventTarget & HTMLIFrameElement;
		const { contentWindow } = iframe;
		if (contentWindow === null) {
			throw new OrbitIframeFileSenderError('contentWindow is not present in iframe.');
		}

		const channel = new MessageChannel();
		channel.port1.onmessage = async (evt: MessageEvent<any>) => {
			const data = evt.data;
			switch (data.event) {
				case 'initialized': {
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
				case 'cancel':
					onCancel();
					break;

				default:
					debugger;
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
	};
}
