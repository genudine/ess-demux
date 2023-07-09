import { ServerWebSocket, sleep, sleepSync } from "bun";

const serviceID = process.env.SERVICE_ID?.replace("s:", "");
if (!serviceID) throw new Error("No service ID provided");

let primary: "ess" | "nss" | "none" = "none";
let downstreams: ServerWebSocket<any>[] = [];
let upstreams: WebSocket[] = [];
let queuedLocalToRemoteMessages: any[] = [];

function connect(
  name: typeof primary,
  url: string,
  queue: typeof queuedLocalToRemoteMessages
): Promise<boolean> {
  return new Promise((_, reject) => {
    const socket = new WebSocket(url);
    socket.onopen = () => {
      console.log(`Connected to ${url}`);
      primary = name;

      upstreams.push(socket);

      downstreams.forEach((ws) =>
        ws.send(
          JSON.stringify({
            connected: upstreams.length > 0,
            service: "ess-demux",
            type: "essDemuxConnectionStateChanged",
            upstream: primary,
          })
        )
      );

      if (queue.length > 0) {
        for (const message of queue) {
          socket.send(message);
        }

        queuedLocalToRemoteMessages = [];
      }
    };
    socket.onclose = () => {
      upstreams = upstreams.filter((upstream) => upstream !== socket);
      reject(new Error("socket closed"));
    };
    socket.onmessage = (message) => {
      for (const downstream of downstreams) {
        downstream.send(message.data);
      }
    };
    socket.onerror = (error) => {
      reject(new Error(error.toString()));
    };
  });
}

async function connectUpstream() {
  try {
    await connect(
      "nss",
      `wss://push.nanite-systems.net/streaming?environment=all&service-id=s:${serviceID}`,
      Array.from(queuedLocalToRemoteMessages)
    );
  } catch (err) {
    console.warn("Failed to connect to upstream NSS", err);
    if (primary === "nss") disconnectDownstreams();
    try {
      const platforms = ["ps2", "ps2ps4eu", "ps2ps4us"];
      await Promise.all(
        platforms.map((platform) =>
          connect(
            "ess",
            `wss://push.planetside2.com/streaming?environment=${platform}&service-id=s:${serviceID}`,
            Array.from(queuedLocalToRemoteMessages)
          )
        )
      );
    } catch (err) {
      if (primary === "ess" || primary === "nss") disconnectDownstreams();
      primary = "none";
      console.error("Failed to connect to upstream ESS or NSS", err);
    }
  }
}

function disconnectDownstreams() {
  for (const downstream of downstreams) {
    downstream.close();
  }
}

function disconnectUpstreams() {
  for (const upstream of upstreams) {
    upstream.close();
  }
}

function sendConnectionStateChanged(ws: ServerWebSocket<any>) {
  ws.send(
    JSON.stringify({
      connected: upstreams.length > 0,
      service: "ess-demux",
      type: "essDemuxConnectionStateChanged",
      upstream: primary,
    })
  );
}

Bun.serve({
  port: process.env.PORT || 8007,

  fetch(request, server) {
    if (server.upgrade(request)) return;

    return new Response(JSON.stringify({ primary }));
  },

  websocket: {
    open(ws) {
      downstreams.push(ws);
      sendConnectionStateChanged(ws);
      if (primary !== "nss") {
        disconnectUpstreams();
        connectUpstream();
      }
    },

    close(ws) {
      downstreams = downstreams.filter((downstream) => downstream !== ws);
    },

    message(_, message) {
      if (upstreams.length === 0) {
        queuedLocalToRemoteMessages.push(message);
        return;
      }
      for (const upstream of upstreams) {
        upstream.send(message);
      }
    },
  },
});
