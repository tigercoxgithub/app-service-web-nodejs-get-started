var fs = require("fs"),
http = require("http"),
WebSocket = require("ws");

var STREAM_SECRET = "secret",
STREAM_PORT = process.env.PORT || 3000,
RECORD_STREAM = false;

// --------------------------------------------------
// WEBSOCKET SERVER
// --------------------------------------------------
const wss1 = new WebSocket.Server({
    noServer: true
});
const wss2 = new WebSocket.Server({
    noServer: true
});

wss1.connectionCount = 0;
wss2.connectionCount = 0;

wss1.on("connection", function connection(socket, upgradeReq) {
    wss1.connectionCount++;
    console.log(
        "New WebSocket Connection: ",
        (upgradeReq || socket.upgradeReq).socket.remoteAddress,
        (upgradeReq || socket.upgradeReq).headers["user-agent"],
        "(" + wss1.connectionCount + " total)");
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
        "(" + wss2.connectionCount + " total)");
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

// -------------------------------------------------
// CORS CONFIG
// -------------------------------------------------
const CORS = (req, res) => {
    const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS, POST, GET",
        "Access-Control-Max-Age": 2592000, // 30 days
        /** add other headers as per requirement */
    };

    if (req.method === "OPTIONS") {
        res.writeHead(204, headers);
        return;
    }

    if (["GET", "POST", "PUT"].indexOf(req.method) > -1) {
        res.writeHead(200, headers);
        return;
    }

    res.writeHead(405, headers);
    res.end(`${req.method} is not allowed for the request.`);
};

// --------------------------------------------------
// HTTPS
// --------------------------------------------------
const streamServer = http.createServer(
        function (request, response) {
    // Cors setup
    CORS(request, response);

    // Expected route /[route]/[secret]
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

    console.log(`Accepted Incoming MPEG-TS Stream from ${route.toUpperCase()}`);
    response.socket.setTimeout(0);

    let recordingPathCam1 =
        __dirname + `/recordings/cam1/` + Date.now() + ".ts";
    let recordingPathCam2 =
        __dirname + `/recordings/cam2/` + Date.now() + ".ts";

    if (route == "cam1" && !request.socket.cam1_recording) {
        if (RECORD_STREAM) {
            request.socket.cam1_recording = fs.createWriteStream(recordingPathCam1);
            console.log("Cam1 recording requested");
        } else {
            console.log("Cam1 recording NOOOOOOTTT requested");
        }
    } else if (route == "cam2" && !request.socket.cam2_recording) {
        if (RECORD_STREAM) {
            request.socket.cam2_recording = fs.createWriteStream(recordingPathCam2);
            console.log("Cam2 recording requested");
        } else {
            console.log("Cam2 recording NOOOOOOTTT requested");
        }
    }

    request.on("data", function (data) {
        if (route == "cam1") {
            if (RECORD_STREAM && request.socket.cam1_recording)
                request.socket.cam1_recording.write(data, "binary");
            wss1.broadcast(data);
        } else if (route == "cam2") {
            if (RECORD_STREAM && request.socket.cam2_recording)
                request.socket.cam2_recording.write(data, "binary");
            wss2.broadcast(data);
        } else {
            response.end();
        }
    });

    request.on("end", function () {
        // Close write streams from cams
        if (request.socket.cam1_recording) {
            console.log("Closing cam1 stream!", request.socket.cam1_recording);
            request.socket.cam1_recording.close();
        } if (request.socket.cam2_recording) {
            console.log("Closing cam2 stream!", request.socket.cam2_recording);
            request.socket.cam2_recording.close();
        } else {
            console.log("Closing a non recorded connection");
        }
    });
});

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
        "/<route-[cam1/cam2]>/<secret>");
    console.log(
        "Awaiting WebSocket connections on wss url:" +
        STREAM_PORT +
        "/<route-[cam1/cam2]>");

    console.log("HTTPS server STARTED on port: " + streamServer.address().port);
});
