import { useOrbitIframeFileTransferReceiver } from '../../../src/react/receiver.js';
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

/**
 * If simple value "data-binding" in the form isn't sufficient
 * you can yield to set values imperativly through the [FormData](https://developer.mozilla.org/en-US/docs/Web/API/FormData) Web API
 * and the `orbitEntityData` object.
 *
 * @param {string} url
 * @param {string} method
 * @param {FormData} formData
 * @param {Record<string, any>} _orbitEntityData
 */
async function onOrbitFileReceiverFormSubmit(
	url: string,
	method: string,
	formData: FormData,
	_orbitEntityData: Record<string, any>,
): Promise<void> {
	const request = new Request(url, {
		body: formData,
		method: method,
	});

	const response = await fetch(request);
	if (!response.ok) {
		throw new Error(
			'Upload was unsuccesful, please contact external system administrator at support@external.system with details on how to reproduce this error.',
		);
	}
}

const App = (_props: AppProps) => {
	const { error, file, fileInputRef, formRef, imageSrc, orbitEntityData, orbitFileId, onCancel, onSubmit, progress } =
		useOrbitIframeFileTransferReceiver(onOrbitFileReceiverFormSubmit);

	const errorContainer = error == null ? null : <div style={errorContainerStyles}>{error.message}</div>;

	return (
		<form action="/upload" encType="multipart/form-data" method="post" onSubmit={onSubmit} ref={formRef}>
			{errorContainer}
			<input type="hidden" name="orbitFileId" value={orbitFileId} readOnly required />
			<label>
				<span>Project number</span>
				<input type="text" readOnly name="projectNumber" value={orbitEntityData.externalId} />
			</label>
			<label>
				<span>Project name</span>
				<input type="text" readOnly name="projectName" value={orbitEntityData.projectName} />
			</label>
			<label>
				<span>Project start</span>
				<input type="date" readOnly name="projectStart" value={orbitEntityData.projectStart} />
			</label>
			<label>
				<span>Project end</span>
				<input type="date" readOnly name="projectEnd" value={orbitEntityData.projectEnd} />
			</label>
			<label>
				<span>File</span>
				<input value={file?.name} name="file" ref={fileInputRef} required disabled type="text" />
				<progress max="100" value={progress}></progress>
				{imageSrc == null ? null : <img src={imageSrc} />}
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
				<input type="button" value="Cancel" onClick={onCancel} />
				<input type="submit" value="Upload" />
			</div>

			<div style={{ display: 'flex', flexDirection: 'column', gridColumn: '1 / 3' }}>
				<h2>Orbit entity data available</h2>
				<pre style={{ flex: '1 1 0%' }}>{JSON.stringify(orbitEntityData, undefined, 4)}</pre>
			</div>
		</form>
	);
};

document.addEventListener('DOMContentLoaded', () => {
	ReactDOM.render(<App />, document.querySelector<HTMLDivElement>('#root'));
});
