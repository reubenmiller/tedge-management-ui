// overwrite console output to add timestamp
require('console-stamp')(console, '[HH:MM:ss.l]');

// use Express
const express = require("express");
const http = require('http');

// http-proxy
const { createProxyMiddleware } = require('http-proxy-middleware');
const socketIO = require('socket.io')

// create new instance of the express server
const app = express();
const thinEdgeBackend = require('./thinEdgeBackend.js');
const CERTIFICATE = "/etc/tedge/device-certs/tedge-certificate.pem";
const DEMO_TENANT = "https://demo.cumulocity.com"

function customRouter(req) {
    let url = DEMO_TENANT
    if (req.query) {
        url = `https://${req.query.proxy}`;
        console.log("Setting target url to: ", url, req.path);
    }
    return url
}

const proxyToTargetUrl = createProxyMiddleware(
    {
        target: "https://demo.cumulocity.com",
        changeOrigin: true,
        secure: true,
        pathRewrite: { '^/c8y': '' },
        router: customRouter,
        logLevel: 'debug'
    }
)


// set up proxy 
app.use('/c8y', proxyToTargetUrl);

// define the JSON parser as a default way 
// to consume and produce data through the 
// exposed APIs
app.use(express.json());

// create link to Angular build directory
// the `ng build` command will save the result
// under the `dist` folder.
//var distDir = __dirname + "/../dist/cumulocity-tedge-setup";
var distDir = __dirname + "/../dist/apps/edge";
//app.use("/home", express.static(distDir));
app.use(express.static(distDir));


const server = http.createServer(app);
// Pass a http.Server instance to the listen method
// const io = new Server(server);
const io = socketIO(server);
// The server should start listening
server.listen(process.env.PORT || 9080, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
    thinEdgeBackend.ThinEdgeBackend.connect2Mongo();
});


/*  "/api/configuration/certificate"
*   GET: certificate 
*/
app.get("/api/configuration/certificate", function (req, res) {
    let deviceId = req.query.deviceId;
    console.log(`Download certificate for : ${deviceId}`);
    res.status(200).sendFile(CERTIFICATE);
});

/*  "/api/edgeConfiguration"
*   GET: edgeConfiguration 
*/
app.get("/api/configuration/edge", function (req, res) {
    thinEdgeBackend.ThinEdgeBackend.getEdgeConfiguration(req, res)
});

/*  "/analyticsConfiguration"
*   POST: Change analytics widget configuration 
*/
app.post("/api/configuration/analytics", function (req, res) {
    thinEdgeBackend.ThinEdgeBackend.setAnalyticsConfiguration(req, res)
});

/*  "/analyticsConfiguration"
*   GET: Get analytics widget configuration 
*/
app.get("/api/configuration/analytics", function (req, res) {
    thinEdgeBackend.ThinEdgeBackend.getAnalyticsConfiguration(req, res)
});
/*  "/api/getLastMeasurements"
*   GET: getLastMeasurements 
*/
app.get("/api/analytics/measurement", function (req, res) {
    thinEdgeBackend.ThinEdgeBackend.getMeasurements(req, res)
});

/*  "/api/series"
*   GET: series 
*/
app.get("/api/analytics/types", function (req, res) {
    thinEdgeBackend.ThinEdgeBackend.getMeasurementTypes(req, res)
});

/*  "/api/services"
*   GET: services 
*/
app.get("/api/services", function (req, res) {
    thinEdgeBackend.ThinEdgeBackend.getEdgeServiceStatus(req, res)
});

/* 
*   Empty dummy responses to avoid errors in the browser console 
*/
app.get("/apps/*", function (req, res) {
    console.log("Ignore request!");
    res.status(200).json({ result: "OK" });
});
app.get("/tenant/loginOptions", function (req, res) {
    console.log("Ignore request!");
    res.status(200).json({ result: "OK" });
});

app.get("/application/*", function (req, res) {
    console.log("Ignore request!");
    const result = {
        "applications": [
        ]
    }
    res.status(200).json(result);
});

/* 
* open socket to receive command from web-ui and send back streamed measurements
*/
io.on('connection', function (socket) {
    console.log(`New connection from web ui: ${socket.id}`);
    backend = new thinEdgeBackend.ThinEdgeBackend(socket)
    socket.on('job-input', function (message) {
        
/*         msg = JSON.parse(message)
        message = msg */

        console.log(`New cmd: ${message}`, message.job);
        if (message.job == 'start') {
            backend.start(message);
        } else if (message.job == 'stop') {
            backend.stop(message);
        } else if (message.job == 'configure') {
            backend.configure(message);
        } else if (message.job == 'reset') {
            backend.reset(message);
        } else if (message.job == 'upload') {
            backend.uploadCertificate();
        } else if (message.job == 'restartPlugins') {
            backend.restartPlugins(message);
        } else {
            socket.emit('job-progress', {
                status: 'ignore',
                progress: 0,
                total: 0
            });
        }
    });
});

io.on('close', function (socket) {
    console.log(`Closing connection from web ui: ${socket.id}`);
});