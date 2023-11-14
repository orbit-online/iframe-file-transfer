# Iframe file transfer

This library is typically used for transfering files, users has provided via input fields in the Orbit web client, to iframes hosted by 3rd parties.

Browsers doesn't simply allow moving the protected File objects between browser contexts. It seems that ServiceWorkers support this to some extent, but it is not supported in iframes.

This library chunks the file and serializes the content of the protected File objects (sender) that originates from `<input type="file" />` input elements, and transer the chunks to the iframe (receiver) for deserialization and re-assembly.

Though it is not possible to make the re-assembled file appear to the BrowserContext (iframe) as a trusted File, this library facilitates orchestration for mimicking the browsers behavior in a way that it feels close (enough).

## Sender

3rd party integrators to Orbit that facilitate uploading files to external systems for processing and centralized asset management won't have to implement the sender part of the protocol, as it is facilitated by Orbit.

A sender is responsible for listening for file input element change events and spawn an iframe that implements the receiver end of the file transfer protocol. Once the iframe is loaded, the sender establish a connection with it via `MessageChannel` and starts transferring the file to the receiver along with some metadata.

Example "mock" implementations can be found here and are useful for testing the receiver end of the protocol.

The [playground](https://orbit-online.github.io/iframe-file-transfer/playground.html) is an implementation for a sender that can be used to simulate a Orbit web client for testing a custom receiver implementation.

> **Note:** When using the playground, which is hosted on Github, it is served over HTTPS and modern browsers doesn't allow serving _insecure_ content from a secure site, to use the playground the iframe must be served over HTTPS as well, it doesn't have to be remotely hosted, it can very well be at `https://localhost/iframe.html`, as long as your browser trusts the SSL certificate. If you need to test on an insecure connection, you'll need to clone the respository and run `yarn install --frozen-lockfile --quiet && yarn dev`.

## Receiver

Receivers are responsible for listening to file transfer events, and sending complete or cancel events back to the host, along with facilitating a place for error messages can appear to users in case anything should go wrong.

As an implementor of a receiver you are responsible for providing a form submit handler that uploads the file along with form- and metadata to a webservice, and return a resolved promised upon success or rejected promise upon error.

Files are transfered to the receiver along with an unique id, that is important in order to be able to update the file in Orbit afterwards via the Orbit Import Framework.

You can find example of receiver implementations in React or in vanilla JS with a declarative HTML `data-*` attribute API.

### API

#### Vanilla JS (declarative HTML)

This API is based on HTML `data-*` attributes for specifing which input fields that should be used by the receiver. The following attributes are sorted after "mandatory, name", all mandatory attributes are marked with a trailing `*`.

-   `form[data-orbit-file-receiver=submitHandler]*`  
     This attributes must be set on a `<form />` element that should be submitted to the external web service with the binary file along with the metadata fields that lives within the form element.

    The `submitHandler` is a function name that lives in global scope at initialization time.

    ```html
    <script type="module">
    	globalThis.onSubmit = async (url, method, formData, entityData) => {
    	    await fetch(...)
    	}
    </script>
    <form enctype="multipart/form-data" action="/upload" method="post" data-orbit-file-receiver="onSubmit">...</form>
    ```

-   `input[data-orbit-file-receiver-file-id]*`  
    This part of the API contains the unique id of the file coming from Orbit, that should be sent agains the File importer API in order to update the placeholder file in Orbit with the processed data. If you don't want the user to be aware of this information you can set the input type to `type=hidden`, the name attribute represents the key the value will be submitted as (provided in the `formData` variable in the `submitHandler`).

    In the example below `formData` will contain the unique file id at the key named `orbitFileId`.

    ```html
    <input type="hidden" name="orbitFileId" data-orbit-file-receiver-file-id />
    ```

-   `input[type=file][data-orbit-file-receiver-input]*`  
    The receiver input attribute represents the file sent from the Orbit web client.
    At initialization time the input must be of `type=file` it will get converted to a `<input type=text disabled />` field with the name preserved. The `[name]` attribute represents the key for the file lives when the form get submitted.

    ```html
    <input type="file" name="file" data-orbit-file-receiver-input />
    ```

    After initialization the file input element above will be converted into

    ```html
    <input type="text" name="file" value="filename.jpg" disabled data-orbit-file-receiver-input />
    ```

-   `[data-orbit-file-receiver-error-container]*`  
    An element that will "host" any errors that might occur, _any_ element will do here, typically a `<div />`.

    This element will be hidden (`display: none`) at initialization time and will restore the `display` value when an error occurs. If the value was `none` at initialization time, it will be set to `display: initial`. This can cause layout problems, in those cases you can set the `[data-display]` attribute to set the value want to be set when an error occurs.

    ```html
    <div data-orbit-file-receiver-error-container data-display="inline-block"></div>
    ```

    In the example above the element will be hidden at initialization time, and will appear with `display: inline-block` when an error occurs.

-   `input[type=button][data-orbit-file-receiver-cancel]`  
    Optional element, it is fine to omit this element/attribute. However if you include a cancel button it must be a `<input type="button" />` element and not a `<button />` element as all buttons that live within a `<form />` element, submits the form, but `<input type="button" />` does not.

    ```html
    <input type="button" value="Cancel" data-orbit-file-receiver-cancel />
    ```

    The example above will render a button containing the text: Cancel.

-   `[data-orbit-file-receiver-entity-data]`
    This optional element will is for debugging perposes. It will show a JSON representation of the data received from the Orbit web client as entity data available for rendering via the `[data-orbit-file-receiver-entity-data-value=<entityDataProperty>]` attribute.
    If you render an `<input name="..." />` element with this attribute, it will be included in the `formData` in the submit handler, and thus automatically included in the request when the form is submitted.

    ```html
    <input name="projectName" readonly data-orbit-file-receiver-entity-data-value="externalId" />
    ```

    **Note** Beware that disabled input fields will be discarded from the `formData` variable in the submit handler, and thus not automatically be included in the request when the form is submitted. It is recommended if you want to include the data, that you use `[readonly]` instead of `[disabled]` when the data needs to be included in the form submission reuquest.

    The example above will not be editable by the user and the data will automatically included in the form submission request on the key `externalId`.

-   `input[data-orbit-file-receiver-entity-data-value=<entityDataProperty>]`

    You can map values from entity data transfered from the via this API.
    e.g. if entity data contains:

    ```json
    { "projectName": "Large construction enterprise" }
    ```

    it can be referenced and automatically be filled out with this data attribute:

    ```html
    <input data-orbit-file-receiver-entity-data-value="projectName" readonly />
    ```

    You can reference nested data too, like this:

    ```json
    { "user": { "name": "John Doe", "email": "john@doe.org" } }
    ```

    ```html
    <input data-orbit-file-receiver-entity-data-value="user.name" name="uploaderName" readonly />
    <input data-orbit-file-receiver-entity-data-value="user.email" name="uploaderEmail" readonly />
    ```

    **Note** If you use the disabled attribute, the input field won't appear in the data, when the form is submitted.

    This is a great/easy way of automatically getting meta information submitted along the form,
    if the user should be presented with the information, you can still use this API just by declaring the input fields `type=hidden`, this can however also be accomplised by accessing the `orbitEntityData` in the submit handler, and populate the `formData` data from there.

-   `img[data-orbit-file-receiver-image]`

    You can present a preview of the image (if the file as an image mimetype and is supported by the browser), the user is uploading with this data-attribute.

    E.g.

    ```html
    <img src="" data-orbit-file-receiver-image />
    ```

    **Note** This API will set the `img.style.display = 'block'` once the transfer is complete, which can give layout issues if not taken into account.

-   `progress[data-orbit-file-receiver-progress]`

    Progress bar for transfering the file from the sender to the receiver (iframe).
    Mostly useful for debugging purposes, to see if chunks are in deed getting transmitted and receieved, but maybe be corrupted along the away. Often the transmission happens so fast, that
    the progress jumps from `0` to `100` at once. However if the files are large enough it can make sense to utilize to give the users visual feedback that "something is happening".

    E.g.

    ```html
    <progress min="0" max="100" data-orbit-file-receiver-progress></progress>
    ```

#### React

The react API is mostly reduced to a single hook, where the only that is needed to be passed to the hook is `submitHandler`` and an `errorHandler`.

```tsx
import { useOrbitIframeFileTransferReceiver } from '@orbit-online/iframe-file-transfer/react/receiver.js';

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

const App = () => {
	const {
		error,
		file,
		fileInputRef,
		formRef,
		imageSrc,
		onCancel,
		onSubmit,
		orbitEntityData,
		orbitFileId,
		progress,
		setError,
	} = useOrbitIframeFileTransferReceiver(onOrbitFileReceiverFormSubmit);
	const errorContainer = error == null ? null : <div style={errorContainerStyles}>{error.message}</div>;

	return (
		<form action="/upload" encType="multipart/form-data" method="post" onSubmit={onSubmit} ref={formRef}>
			{errorContainer}
			<input type="hidden" name="orbitFileId" ref={fileIdInputRef} value={orbitFileId} readOnly required />
			<input type="text" name="file" ref={fileInputRef} value={file?.name} disabled required />
			<input type="button" value="Cancel" onClick={onCancel} />
			<input type="submit" value="Upload" />
		</form>
	);
};
```

Will take a look at this bare minimum example above, and explain the API in terms of this simplified usage.

```ts
function useOrbitIframeFileTransferReceiver(submitHandler): {
	readonly error: Maybe<Error>,
	readonly file: Maybe<File>,
	readonly fileInputRef: React.RefObject<HTMLInputElement>,
	readonly formRef: React.RefObject<HTMLFormElement>,
	readonly imageSrc: string | undefined,
	readonly onCancel: () => void,
	readonly onSubmit: (url: string, method: string, formData: FormData, orbitEntityData: React<string, any>) => Promise<unknown>,
	readonly orbitEntityData: state.initMessage?.entityData ?? {},
	readonly orbitFileId: string | undefined,
	readonly progress: string | undefined,
	readonly setError: (err: Error) => void,
	readonly status: 'initial' | 'transfering' | 'complete' | 'error',
};
```

-   `submitHandler` argument
    The submit handler is called with the data from the form input fields, along with metadata from Orbit.
    It is expected that submit handler posts the data to the server returns`Promise`that resolves when
    the submission is successful or throws an error (returns a`Promse` that rejects) if something went wrong.

            ```ts
            async function onOrbitFileReceiverFormSubmit(
            	url: string,
            	method: string,
            	formData: FormData,
            	_orbitEntityData: Record<string, any>,
            ): Promise<void> {}
            ```

-   `formRef` and `onSubmit`  
    The ref that should be passed along to the form element, in order to the form submission/interception and `formData` "patch-up" to work.

    ```tsx
    const { formRef, onSubmit ... } useOrbitIframeFileTransferReceiver(...);

    return (
        <form action="/upload" encType="multipart/form-data" method="post" onSubmit={onSubmit} ref={formRef}>
            ...
        </form>
    );
    ```

-   `orbitFileId`  
    The id of the file from Orbit, that should be used by the external system
    to update the file in Orbit after processing it via the Orbit importer.

    The value in the `[name]` attribute controls the field name in the form submission
    to the external system.

    ```tsx
    const { orbitFileId, ... } useOrbitIframeFileTransferReceiver(...);

    return (
        <form ...>
            <input type="hidden" name="orbitFileId" value={orbitFileId} readOnly required />
        </form>
    );
    ```

-   `fileInputRef`  
    The id of the file from Orbit, that should be used by the external system
    to update the file in Orbit after processing it via the Orbit importer.

    ```tsx
    const { orbitFileId, ... } useOrbitIframeFileTransferReceiver(...);

    return (
        <form ...>
            <input type="hidden" name="orbitFileId" required />
        </form>
    );
    ```

-   `orbitEntityData`  
    Meta about the, entity and the user that uploaded the file, sent from Orbit a long with the file.
    The `orbitEntityData` is available when `state` is `transfering` and `complete` states.

    ```tsx
    const { orbitEntityData, ... } useOrbitIframeFileTransferReceiver(...);
    return (
        <form ...>
            <input type="text" readOnly name="projectName" value={orbitEntityData.projectName} />
        </form>
    );
    ```

-   `onCancel`  
    The cancel handler that tells the host (sender), that the operation has been cancelled by the user.

    ```tsx
    const { onCancel, ... } useOrbitIframeFileTransferReceiver(...);
    return (
        <form ...>
            <input type="button" value="Cancel" onClick={onCancel} />
        </form>
    );
    ```

-   `imageSrc`  
    Image src useful for preview of image, will have a value when `status` is `complete` and the file that is an image supported by the browser.

    ```tsx
    const { imageSrc, ... } useOrbitIframeFileTransferReceiver(...);
    return (
        ...
        <img src={imageSrc} />
        ...
    );
    ```

-   `progress`  
    The file transfer progress percentage between the sender and the receiver (iframe).

    ```tsx
    const { progress, ... } useOrbitIframeFileTransferReceiver(...);
    return (
        ...
        <progress ref={progress} value={progress} max="100" />
        ...
    );
    ```

-   `status`, `file`, `error` and `setError`
    Current status of the transmission from the sender to the receiver.

    Possible values are `initial`, `transfering`, `complete`, `error`.

    When status is `initial`, `file`, `error`, `orbitFileId` and `progress` are `null` and has no value.
    When status is `error`, the `error` property of the hook has a value.
    When status is `transfering`, the `orbitFileId`, `progress` has values.
    when status is `complete`, the `file` property has a value, `imageSrc` has a value if the file is an image supported by the browser.

    `file` contains a DOM `File` when the transfering from the sender (host/Orbit web client) is complete.

    `setError` can be used to set custom errors and make them available in the `error` property, and change the `status` to `error`.

    ```tsx
    const { status, ... } useOrbitIframeFileTransferReceiver(...);
    ```
