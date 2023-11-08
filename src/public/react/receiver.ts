import { createLogger } from '../util.js';
import {
	OrbitIframeFileTransferReceiver,
	OrbitIframeFileTransferReceiverError,
	SubmitHandler,
	tryGetOriginFromUrlHash,
} from '../receiver.js';

export function useOrbitIframeFileTransferReceiver(
	errorHandler: (err: Maybe<Error>) => void,
	submitHandler: SubmitHandler,
) {
	const [orbitEntityData, setOrbitEntityData] = React.useState<Record<string, any>>({});
	const logger = React.useMemo(() => createLogger('orbit:iframe_file_receiver'), []);

	const formRef = React.useRef<HTMLFormElement>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);
	const fileIdInputRef = React.useRef<HTMLInputElement>(null);
	const imageRef = React.useRef<HTMLImageElement>(null);
	const progressRef = React.useRef<HTMLProgressElement>(null);

	const receiver = React.useMemo(
		() =>
			new OrbitIframeFileTransferReceiver({
				onFormSubmit: submitHandler,
				onError: errorHandler,
				onFileTransferInit: (msg) => {
					if (fileIdInputRef.current != null) {
						fileIdInputRef.current.value = msg.orbitFileId;
					}
					if (fileInputRef.current != null) {
						fileInputRef.current.value = msg.fileName;
					}
					setOrbitEntityData(msg.entityData);
				},
				onFileChunkReceived: (bytesReceived, totalBytes) => {
					if (progressRef.current != null) {
						progressRef.current.value = (bytesReceived / totalBytes) * 100;
					}
				},
				onFileTransferCompleted: (file) => {
					if (imageRef.current != null && file.type.startsWith('image/')) {
						const fileReader = new FileReader();
						fileReader.onload = () => {
							if (typeof fileReader.result === 'string') {
								imageRef.current!.src = fileReader.result;
								imageRef.current!.style.display = 'block';
							}
						};
						fileReader.readAsDataURL(file);
					}
				},
			}),
		[],
	);

	React.useEffect(() => {
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
					`File input element <input /> wasn't found, there must exist an input element present of type=file present in the DOM assigned to the fileInputRef from the useOrbitIframeFileTransferReceiver hook.
e.g.
const iframeFileTrasnferReceiver = useOrbitIframeFileTransferReceiver(errorHandler, submitHandler);
return (
    <form ...>
        <input name="file" disabled ref={iframeFileTrasnferReceiver.fileInputRef} />
    </form>
);

If you don't want the users to have a file input field, you can declare it hidden
e.g.

<input type="hidden" name="file" ref={iframeFileTrasnferReceiver.fileInputRef} />
`,
				);
			}

			if (fileInput.name.trim() === '') {
				throw new OrbitIframeFileTransferReceiverError(
					`File input element <input /> must have a value assigned to the name attribute.
e.g.
<input name="file" />`,
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

			form.onsubmit = receiver.createSubmitHandler(fileInput);
			receiver.connect().catch(errorHandler);
		} catch (err) {
			errorHandler(err as Error);
		}
		return () => receiver.close();
	}, []);

	const onCancel = React.useCallback((e: React.MouseEvent<any>) => receiver.cancel(), [receiver]);

	return {
		fileIdInputRef,
		fileInputRef,
		formRef,
		imageRef,
		orbitEntityData,
		onCancel,
		progressRef,
	};
}
