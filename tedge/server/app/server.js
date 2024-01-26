// overwrite logger output to add timestamp
const { logger, STORAGE_ENABLED, ANALYTICS_FLOW_ENABLED } = require('./global');
// use Express
const express = require('express');
const http = require('http');
const { makeRequest } = require('./utils');

// http-proxy
const { createProxyMiddleware } = require('http-proxy-middleware');
const socketIO = require('socket.io');

// create new instance of the express server
const app = express();
const { TedgeBackend } = require('./tedgeBackend');
const CERTIFICATE = '/etc/tedge/device-certs/tedge-certificate.pem';
const DEMO_TENANT = 'https://demo.cumulocity.com';
const tedgeBackend = new TedgeBackend();

function customRouter(req) {
  let url = DEMO_TENANT;
  if (req.query) {
    url = `https://${req.query.proxy}`;
    logger.info('Setting target url to: ', url, req.path);
  }
  return url;
}

const proxyToTargetUrl = createProxyMiddleware({
  target: 'https://demo.cumulocity.com',
  changeOrigin: true,
  secure: true,
  pathRewrite: { '^/c8yCloud': '' },
  router: customRouter,
  logLevel: 'debug'
});

// set up proxy
app.use('/c8yCloud', proxyToTargetUrl);

// define the JSON parser as a default way
// to consume and produce data through the
// exposed APIs
app.use(express.json());

// create link to Angular build directory
// the `ng build` command will save the result
// under the `dist` folder.
//var distDir = __dirname + "/../dist/cumulocity-tedge-setup";
var distDir = __dirname + '/../dist/apps/edge';
//app.use("/home", express.static(distDir));
app.use(express.static(distDir));

const server = http.createServer(app);
// Pass a http.Server instance to the listen method
// const io = new Server(server);
const io = socketIO(server);
// The server should start listening
server.listen(process.env.PORT || 9080, function () {
  var port = server.address().port;
  if (STORAGE_ENABLED) {
    tedgeBackend.connectToMongo();
  }
  logger.info(
    `App now running on port: ${port}, isStorageEnabled:  ${STORAGE_ENABLED}, isAnalyticsFlowEnabled:  ${ANALYTICS_FLOW_ENABLED}`
  );
});

/*
 * "/api/inventory/managedObjects"
 *   GET: managedObjects from cloud, this call is bridged through the tedge agent
 */
app.get('/api/bridgedInventory/:externalId', function (req, res) {
  let externalId = req.params.externalId;
  logger.info(`Details for: ${externalId}`);
  /// # wget http://localhost:8001/c8y/identity/externalIds/c8y_Serial/monday-II

  makeRequest(
    `http://localhost:8001/c8y/identity/externalIds/c8y_Serial/${externalId}`
  )
    .then((result) => {
      logger.info(`First request data: ${result}`);
      let externalIdObject = JSON.parse(result);
      logger.info(`First request data parsed: ${externalIdObject}`);
      let deviceId = externalIdObject.managedObject.id;
      return makeRequest(
        `http://localhost:8001/c8y/inventory/managedObjects/${deviceId}`
      );
    })
    .then((result) => {
      logger.info(`Second request data: ${result}`);
      res.send(result);
    })
    .catch((error) => {
      logger.error(`Error getExternalId: ${error.message}`);
      res.status(500).json({ message: error.message });
    });
});

/*
 * "/api/configuration/certificate"
 *   GET: certificate
 */
app.get('/api/configuration/certificate', function (req, res) {
  let deviceId = req.query.deviceId;
  logger.info(`Download certificate for : ${deviceId}`);
  res.status(200).sendFile(CERTIFICATE);
});

/*
 * "/api/edgeConfiguration"
 *   GET: edgeConfiguration
 */
app.get('/api/configuration/tedge', function (req, res) {
  tedgeBackend.getTedgeConfiguration(req, res);
});

/*
 * "api/configuration/tedge-mgm"
 *   POST: Change analytics widget configuration
 */
app.post('/api/configuration/tedge-mgm', function (req, res) {
  tedgeBackend.setTedgeMgmConfiguration(req, res);
});

/*
 * "api/analyticsConfiguration"
 *   GET: Get analytics widget configuration
 */
app.get('/api/configuration/tedge-mgm', function (req, res) {
  tedgeBackend.getTedgeMgmConfiguration(req, res);
});

/*
 * "api/cmd/:cmd"
 *   POST: Create request log_upload, config_snapshot, ...
 */
app.post('/api/cmd/:cmd', function (req, res) {
  tedgeBackend.sendTedgeGenericCmdRequest(req, res);
});

/*
 * "api/cmd/log_upload"
 *   GET: Get response for log_upload, config_snapshot, ...
 */
app.get('/api/cmd/:cmd', function (req, res) {
  tedgeBackend.getTedgeGenericCmdResponse(req, res);
});

/*
 * "/api/getLastMeasurements"
 *   GET: getLastMeasurements
 */
app.get('/api/analytics/measurement', function (req, res) {
  tedgeBackend.getMeasurements(req, res);
});

/*
 *  "/api/series"
 *   GET: series
 */
app.get('/api/analytics/types', function (req, res) {
  tedgeBackend.getMeasurementTypes(req, res);
});

/*
 * "/api/services"
 *   GET: services
 */
app.get('/api/services', function (req, res) {
  tedgeBackend.getTedgeServiceStatus(req, res);
});

/*
 * "/api/storage/statistic"
 *   GET: statistic
 */
app.get('/api/storage/statistic', function (req, res) {
  tedgeBackend.getStorageStatistic(req, res);
});

/*
 * "/api/storage/ttl"
 *   GET: ttl
 */
app.get('/api/storage/ttl', function (req, res) {
  tedgeBackend.getStorageTTL(req, res);
});

/*
 * "/api/storage/ttl"
 *   POST: ttl
 */
app.post('/api/storage/ttl', function (req, res) {
  tedgeBackend.updateStorageTTL(req, res);
});

/*
 *   Empty dummy responses to avoid errors in the browser logger
 */
app.get('/apps/*', function (req, res) {
  logger.info('Ignore request!');
  res.status(200).json({ result: 'OK' });
});
app.get('/tenant/loginOptions', function (req, res) {
  logger.info('Ignore request!');
  res.status(200).json({ result: 'OK' });
});

app.get('/application/*', function (req, res) {
  logger.info('Ignore request!');
  const result = {
    applications: []
  };
  res.status(200).json(result);
});

/*
 * open socket to receive command from web-ui and send back streamed measurements
 */
io.on('connection', function (socket) {
  logger.info(`New connection from web ui: ${socket.id}`);
  tedgeBackend.socketOpened(socket);
  socket.on('channel-job-submit', function (job) {
    logger.info(`New cmd submitted: ${JSON.stringify(job)} ${job.jobName}`);
    if (job.jobName == 'start') {
      tedgeBackend.start(job);
    } else if (job.jobName == 'stop') {
      tedgeBackend.stop(job);
    } else if (job.jobName == 'configure') {
      tedgeBackend.configure(job);
    } else if (job.jobName == 'reset') {
      tedgeBackend.reset(job);
    } else if (job.jobName == 'upload') {
      tedgeBackend.uploadCertificate(job);
    } else if (job.jobName == 'custom') {
      tedgeBackend.customCommand(job);
    } else {
      socket.emit('channel-job-progress', {
        status: 'ignore',
        progress: 0,
        total: 0
      });
    }
  });
});

io.on('close', function (socket) {
  logger.info(`Closing connection from web ui: ${socket.id}`);
});
