# Iframe file transfer

This library is typically used for transfering files, users has provided via input fields in the Orbit web client, to iframes hosted by 3rd parties.

Browsers doesn't simply allow moving the protected File objects between browser contexts. It seems that ServiceWorkers support this to some extent, but it is not supported in iframes.

This library chunks the file and serializes the content of the protected File objects (sender) that originates from `<input type="file" />` input elements, and transer the chunks to the iframe (receiver) for deserialization and re-assembly.

Though it is not possible to make the re-assembled file appear to the BrowserContext (iframe) as a trusted File, this library facilitates orchestration for mimicking the browsers behavior in a way that it feels close (enough).

## Sender

3rd party integrators to Orbit that facilitate uploading files to external systems for processing and centralized asset management won't have to implement the sender part of the protocol, as it is facilitated by Orbit.

A sender is responsible for listening for file input element change events and spawn an iframe that implements the receiver end of the file transfer protocol. Once the iframe is loaded, the sender establish a connection with it via `MessageChannel` and starts transferring the file to the receiver along with some metadata. 

Example "mock" implementations can be found here and are useful for testing the receiver end of the protocol.

## Receiver

Receivers are responsible for listening to file transfer events, and sending complete or cancel events back to the host, along with facilitating a place for error messages can appear to users in case anything should go wrong.

As an implementor of a receiver you are responsible for providing a form submit handler that uploads the file along with form- and metadata to a webservice, and return a resolved promised upon success or rejected promise upon error.

Files are transfered to the receiver along with an unique id, that is important in order to be able to update the file in Orbit afterwards via the Orbit Import Framework.

You can find example of receiver implementations in React or in vanilla JS with a declarative HTML `data-*` attribute API.

