const http = require("http");
const WebSocket = require("ws");
const STREAM_SECRET = "secret";
const STREAM_PORT = process.env.PORT || 3000;
const wss1 = new WebSocket.Server({ noServer: true });
const wss2 = new WebSocket.Server({ noServer: true });

wss1.connectionCount = 0;
wss2.connectionCount = 0;

wss1.on("connection", function connection(socket, upgradeReq) {
  wss1.connectionCount++;
  console.log(
    "New WebSocket Connection: ",
    (upgradeReq || socket.upgradeReq).socket.remoteAddress,
    (upgradeReq || socket.upgradeReq).headers["user-agent"],
    "(" + wss1.connectionCount + " total)"
  );
  socket.on("close", function (code, message) {
    wss1.connectionCount--;
    console.log("Disconnected WebSocket (" + wss1.connectionCount + " total)");
  });
});
wss1.broadcast = (data) => {
  wss1.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

wss2.on("connection", function connection(socket, upgradeReq) {
  wss2.connectionCount++;
  console.log(
    "New WebSocket Connection: ",
    (upgradeReq || socket.upgradeReq).socket.remoteAddress,
    (upgradeReq || socket.upgradeReq).headers["user-agent"],
    "(" + wss2.connectionCount + " total)"
  );
  socket.on("close", function (code, message) {
    wss2.connectionCount--;
    console.log("Disconnected WebSocket (" + wss2.connectionCount + " total)");
  });
});
wss2.broadcast = (data) => {
  wss2.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// --------------------------------------------------
// HTTPS
// --------------------------------------------------
const streamServer = http.createServer(
  function (request, response) {
    // Cors config

    // |route|secretKey
    var params = request.url.substr(1).split("/");

    if (!params || params.length !== 2) {
      console.log("Failed Stream Connection. Invalid Stream Path");
      response.end();
    }
    const route = params[0];
    const secretKey = params[1];

    if (secretKey !== STREAM_SECRET) {
      console.log("Failed Stream Connection. Invalid Stream Secret");
      response.end();
    }

    response.socket.setTimeout(0);

    request.on("data", function (data) {
      if (route == "cam1") {
        wss1.broadcast(data);
		
      } else if (route == "cam2") {
        wss2.broadcast(data);
		
      } else {
        response.end();
      }
    });
    request.on("end", function () {
      console.log("close");
      response.end();
    });
  }
);

streamServer.on("upgrade", function upgrade(request, socket, head) {
  const route = request.url;
  if (route === "/cam1") {
    wss1.handleUpgrade(request, socket, head, function done(ws) {
      wss1.emit("connection", ws, request);
    });
  } else if (route === "/cam2") {
    wss2.handleUpgrade(request, socket, head, function done(ws) {
      wss2.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

streamServer.headersTimeout = 0;

streamServer.listen(STREAM_PORT, () => {
  console.log(
    "Listening for incomming MPEG-TS Stream on http url:" +
      STREAM_PORT +
      "/<route-[cam1/cam2]>/<secret>"
  );
  console.log(
    "Awaiting WebSocket connections on wss url:" +
      STREAM_PORT +
      "/<route-[cam1/cam2]>"
  );
  
  console.log("HTTPS server STARTED on port ${streamServer.address().port}");
});
