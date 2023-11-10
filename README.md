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

-   `img[data-orbit-file-receiver-image]`

-   `progress[data-orbit-file-receiver-progress]`

#### React
