# ESS Demux

This service guarantees one thing to you; it will have a websocket connected with ESS events.

The specific flow is as follows:

1. If https://push.nanite-systems.net/ is up, the client websocket is wired to that.
2. Else, connect to https://push.planetside2.com/ and multiplex the 3 environments.
3. If that fails, the client websocket will fail, and you should attempt to reconnect.

This service is designed to run as a sidecar, not a public service, and opening it to the public is at your own risk.

## Why would you want this?

NSS helps be resilient to ESS failures, but NSS isn't failure-proof itself. This acts as a proxy that'll gracefully select one source or another.

### Alternatives

If you can accept the loss of PS4 data, you may use nginx or HAProxy to achieve the same effect...

[**nginx example.conf**](./docs/alternatives/ess.nginx.conf)

The above may not work entirely correctly... ymmv.

Saerro **does** want PS4 data, so we use the ess-demux service.

## How to use this

The service runs on port 8007 by default, you can change it to whatever via `PORT`, if you're using this as a bare service. You must set `SERVICE_ID`; allowing you to omit this from the URL.

`docker run -d -p 8007:8007 ghcr.io/genudine/ess-demux/ess-demux:latest`

Connect to `ws://localhost:8007` (any other part of the URL is optional and ignored...)

Send subscriptions like any other ESS-compatible websocket.

Upon connection, you can expect an event like this to validate what we're connected to.

```json
{
  "connected": true,
  "service": "ess-demux",
  "type": "essDemuxConnectionStateChanged",
  "upstream": "nss" // or "ess"
}
```
