import {
	OrbitIframeFileTransferReceiver,
	OrbitIframeFileTransferReceiverError,
	OrbitInitMessage,
	SubmitHandler,
	tryGetOriginFromUrlHash,
} from '../lib/receiver.js';
import { createLogger } from '../lib/util.js';

interface InitialState {
	readonly error: Maybe<Error>;
	readonly file: null;
	readonly imageSrc: null;
	readonly initMessage: null;
	readonly logger: ReturnType<typeof createLogger>;
	readonly orbitFileId: null;
	readonly progress: null;
	readonly status: 'initial';
}

interface TransferingState {
	readonly error: Maybe<Error>;
	readonly file: null;
	readonly imageSrc: null;
	readonly initMessage: OrbitInitMessage;
	readonly logger: ReturnType<typeof createLogger>;
	readonly orbitFileId: string;
	readonly progress: number;
	readonly status: 'transfering';
}

interface CompleteState {
	readonly error: Maybe<Error>;
	readonly file: File;
	readonly imageSrc: Maybe<string>;
	readonly initMessage: OrbitInitMessage;
	readonly logger: ReturnType<typeof createLogger>;
	readonly orbitFileId: string;
	readonly progress: number;
	readonly status: 'complete';
}

interface ErrorState {
	readonly error: Error;
	readonly file: Maybe<File>;
	readonly imageSrc: Maybe<string>;
	readonly initMessage: Maybe<OrbitInitMessage>;
	readonly logger: ReturnType<typeof createLogger>;
	readonly orbitFileId: Maybe<string>;
	readonly progress: Maybe<number>;
	readonly status: 'error';
}

type State = InitialState | TransferingState | CompleteState | ErrorState;

const initialState: Omit<InitialState, 'logger'> = {
	error: null,
	file: null,
	imageSrc: null,
	initMessage: null,
	orbitFileId: null,
	progress: null,
	status: 'initial',
};

type Action =
	| { readonly payload: { readonly msg: OrbitInitMessage }; readonly type: 'FILE_TRANSFER_INIT' }
	| { readonly payload: { readonly progress: number }; readonly type: 'FILE_TRANSFER_CHUNK_RECEIVED' }
	| { readonly payload: { readonly file: File }; readonly type: 'FILE_TRANSFER_COMPLETED' }
	| { readonly payload: { readonly imageSrc: string }; readonly type: 'SET_IMAGE_SRC' }
	| { readonly payload: { readonly error: Error }; readonly type: 'SET_ERROR' };

function reducer(prevState: State, action: Action): State {
	const { type } = action;
	switch (type) {
		case 'FILE_TRANSFER_INIT': {
			return {
				...prevState,
				initMessage: action.payload.msg,
				orbitFileId: action.payload.msg.orbitFileId,
				progress: 0,
				status: 'transfering',
			} as TransferingState;
		}
		case 'FILE_TRANSFER_CHUNK_RECEIVED': {
			return {
				...prevState,
				progress: action.payload.progress,
				status: 'transfering',
			} as TransferingState;
		}
		case 'FILE_TRANSFER_COMPLETED': {
			return {
				...prevState,
				error: null,
				file: action.payload.file,
				status: 'complete',
			} as CompleteState;
		}
		case 'SET_IMAGE_SRC': {
			return {
				...prevState,
				imageSrc: action.payload.imageSrc,
			} as State;
		}
		case 'SET_ERROR': {
			return {
				...prevState,
				error: action.payload.error,
				status: 'error',
			};
		}
	}
}

export function useOrbitIframeFileTransferReceiver(submitHandler: SubmitHandler) {
	const [state, dispatch] = React.useReducer(reducer, initialState, (initialState_) => ({
		...initialState_,
		logger: createLogger('orbit:iframe_file_receiver'),
	}));
	const formRef = React.useRef<HTMLFormElement>(null);
	const fileInputRef = React.useRef<HTMLInputElement>(null);

	const setError = React.useCallback((err: Error) => dispatch({ type: 'SET_ERROR', payload: { error: err } }), []);

	const receiver = React.useMemo(
		() =>
			new OrbitIframeFileTransferReceiver({
				onFormSubmit: submitHandler,
				onError: (err) => dispatch({ type: 'SET_ERROR', payload: { error: err } }),
				onFileTransferInit: (msg) => {
					dispatch({
						type: 'FILE_TRANSFER_INIT',
						payload: {
							msg,
						},
					});
				},
				onFileChunkReceived: (bytesReceived, totalBytes) => {
					dispatch({
						type: 'FILE_TRANSFER_CHUNK_RECEIVED',
						payload: { progress: (bytesReceived / totalBytes) * 100 },
					});
				},
				onFileTransferCompleted: (file) => {
					dispatch({ type: 'FILE_TRANSFER_COMPLETED', payload: { file } });
					if (file.type.startsWith('image/')) {
						const fileReader = new FileReader();
						fileReader.onload = () => {
							if (fileReader.result != null) {
								dispatch({
									type: 'SET_IMAGE_SRC',
									payload: { imageSrc: fileReader.result.toString() },
								});
							}
						};
						fileReader.onerror = () => {
							dispatch({
								type: 'SET_ERROR',
								payload: { error: new Error("Couldn't load image into preview.") },
							});
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

			receiver.connect().catch((err) =>
				dispatch({
					type: 'SET_ERROR',
					payload: { error: err instanceof Error ? err : new Error(String(err)) },
				}),
			);
		} catch (err) {
			dispatch({ type: 'SET_ERROR', payload: { error: err instanceof Error ? err : new Error(String(err)) } });
		}
		return () => receiver.close();
	}, []);

	const onCancel = React.useCallback((_evt: React.MouseEvent<any>) => receiver.cancel(), [receiver]);
	const onSubmit = React.useCallback(
		(evt: React.FormEvent<HTMLFormElement>) => {
			evt.preventDefault();
			if (fileInputRef.current != null) {
				receiver.createSubmitHandler(fileInputRef.current, 'react')(evt);
			} else {
				dispatch({
					type: 'SET_ERROR',
					payload: { error: new Error('File input file <input name="..." /> wasn\'t found') },
				});
			}
		},
		[receiver],
	);

	return {
		error: state.error,
		file: state.file,
		fileInputRef: fileInputRef,
		formRef: formRef,
		imageSrc: state.imageSrc ?? undefined,
		onCancel: onCancel,
		onSubmit: onSubmit,
		orbitEntityData: state.initMessage?.entityData ?? {},
		orbitFileId: state.orbitFileId ?? undefined,
		progress: state.progress ?? undefined,
		setError: setError,
		status: state.status,
	};
}
