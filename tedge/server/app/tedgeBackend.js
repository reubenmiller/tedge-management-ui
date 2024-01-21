// spawn
const { spawn } = require('child_process');
const { TaskQueue } = require('./taskQueue');
const { TedgeFileStore } = require('./tedgeFileStore');
const fs = require('fs');
const { flattenJSON, flattenJSONAndClean } = require('./utils');

// emitter to signal completion of current task

const propertiesToJSON = require('properties-to-json');
const { MongoClient } = require('mongodb');

const mqtt = require('mqtt');
const MQTT_BROKER = process.env.MQTT_BROKER;
const MQTT_PORT = process.env.MQTT_PORT;
const STORAGE_ENABLED = process.env.STORAGE_ENABLED == 'true';
const MQTT_URL = `mqtt://${MQTT_BROKER}:${MQTT_PORT}`;
const MQTT_TOPIC = 'te/+/+/+/+/m/+';

const MONGO_DB = 'localDB';
const MONGO_URL = `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}?directConnection=true`;
const MONGO_MEASUREMENT_COLLECTION = 'measurement';
const MONGO_SERIES_COLLECTION = 'serie';
const MAX_MEASUREMENT = 2000;
const NAME_INDEX_FOR_TTL = 'datetime_ttl';

class TedgeBackend {
  cmdInProgress = false;
  mqttClient = null;
  db = null;
  measurementCollection = null;
  seriesCollection = null;
  taskQueue = null;
  tedgeFileStore = null;
  socket = null;
  clientStatus = {
    isMQTTConnected: false,
    isMongoConnected: false,
    isStreaming: false
  };

  constructor() {
    this.tedgeFileStore = new TedgeFileStore();

    // bind this to all methods of notifier
    Object.keys(this.notifier).forEach((key) => {
      this.notifier[key] = this.notifier[key].bind(this);
    });
    console.log(`Constructor TedgeBackend, storage: ${STORAGE_ENABLED}`);

    this.taskQueue = new TaskQueue();
    // initialize configuration
    this.tedgeFileStore.getTedgeMgmConfiguration();
    this.initializeMQTT();
    if (STORAGE_ENABLED) this.initializeMongo();
  }

  initializeMQTT() {
    this.connectToMQTT();
    this.clientStatus.isMQTTConnected = this.mqttClient
      ? this.mqttClient.connected
      : false;
    this.watchMeasurementFromMQTT();
    console.log(`Connected to MQTT: ${this.clientStatus.isMQTTConnected}!`);
  }

  initializeMongo() {
    this.connectToMongo();
    console.log(`Connected to Mongo: ${this.clientStatus.isMQTTConnected}!`);
  }

  socketOpened(socket) {
    console.log(`TedgeBackend, open socket: ${socket.id}`);
    this.socket = socket;
    let self = this;
    socket.on('new-measurement', function (message) {
      // only start new changed stream if no old ones exists
      if (message == 'start') {
        self.clientStatus.isStreaming = true;
      } else if (message == 'stop') {
        self.clientStatus.isStreaming = false;
      }
    });
    // if (STORAGE_ENABLED) {
    //   if (this.measurementCollection == null || this.seriesCollection == null) {
    //     console.error(`Connect to mongo first: ${socket.id}`);
    //   } else {
    //     this.watchMeasurementFromCollection();
    //   }
    // }
  }

  notifier = {
    sendProgress: function (job, task) {
      this.socket.emit('job-progress', {
        status: 'processing',
        progress: task.id,
        total: task.total,
        job,
        cmd: task.cmd + ' ' + task.args.join(' ')
      });
    },
    sendResult: function (result) {
      this.socket.emit('job-output', result);
    },
    sendError: function (job, task, exitCode) {
      this.cmdInProgress = false;
      this.socket.emit('job-output', `${exitCode} (task ${task.id})`);
      this.socket.emit('job-progress', {
        status: 'error',
        progress: task.id,
        job,
        total: task.total
      });
    },
    sendJobStart: function (job, promptText, length) {
      this.cmdInProgress = true;
      this.socket.emit('job-progress', {
        status: 'start-job',
        progress: 0,
        job,
        promptText: promptText,
        total: length
      });
    },
    sendJobEnd: function (job, task) {
      this.cmdInProgress = false;
      this.socket.emit('job-progress', {
        status: 'end-job',
        progress: task.id,
        job,
        total: task.total
      });
      if (job == 'configure') {
        this.tedgeFileStore.setTedgeMgmConfigurationInternal({
          status: 'INITIALIZED'
        });
      } else if (job == 'start') {
        this.tedgeFileStore.setTedgeMgmConfigurationInternal({
          status: 'REGISTERED'
        });
      } else if (job == 'upload') {
        this.tedgeFileStore.setTedgeMgmConfigurationInternal({
          status: 'CERTIFICATE_UPLOADED'
        });
      } else if (job == 'reset') {
        this.tedgeFileStore.setTedgeMgmConfigurationInternal({
          status: 'BLANK'
        });
      }
    }
  };

  watchMeasurementFromCollection() {
    let changeStream = undefined;
    let localSocket = this.socket;
    // watch measurement collection for changes
    localSocket.on('new-measurement', function (message) {
      console.log(`New measurement: ${message}`);
      // only start new changed stream if no old ones exists
      if (message == 'start' && !changeStream) {
        console.log(`Start polling measurement from storage: ${message}`);
        changeStream = this.measurementCollection.watch();
        changeStream.on('change', function (change) {
          localSocket.emit(
            'new-measurement',
            JSON.stringify(change.fullDocument)
          );
        });
      } else if (message == 'stop') {
        if (changeStream) {
          console.log(`Stop message stream: ${message}`);
          changeStream.close();
          changeStream = undefined;
        }
      }
    });
  }

  watchMeasurementFromMQTT() {
    let self = this;

    // watch measurement collection for changes
    this.mqttClient.on('connect', () => {
      self.mqttClient.subscribe(MQTT_TOPIC, (err) => {
        if (!err) {
          console.log(`Successfully subscribed to topic: ${MQTT_TOPIC}`);
        }
      });
    });
    console.log(`Start polling measurement from MQTT.`);

    this.mqttClient.on('message', (topic, message) => {
      // message is Buffer
      // console.log(`New measurement: ${message.toString()}`);
      const topicSplit = topic.split('/');
      const device = topicSplit[2];
      const type = topicSplit[6] == '' ? 'default' : topicSplit[6];
      const payload = JSON.parse(message.toString());
      const datetime = payload.time;
      delete payload.time;
      const document = {
        topic,
        device,
        payload,
        type,
        datetime
      };
      if (self.clientStatus.isStreaming && self.socket)
        self.socket.emit('new-measurement', JSON.stringify(document));

      if (!STORAGE_ENABLED) {
        self.tedgeFileStore.updateMeasurementTypes(document);
      } else {
        self.updateMeasurementTypes(document);
        self.storeMeasurement(document);
      }
    });
  }

  async getMeasurements(req, res) {
    let displaySpan = req.query.displaySpan;
    let dateFrom = req.query.dateFrom;
    let dateTo = req.query.dateTo;
    if (displaySpan) {
      console.log(
        'Measurement query (last, after):',
        displaySpan,
        new Date(Date.now() - 1000 * parseInt(displaySpan))
      );
      let query = {
        datetime: {
          // 18 minutes ago (from now)
          $gt: new Date(Date.now() - 1000 * parseInt(displaySpan))
        }
      };
      let result = [];
      const cursor = this.measurementCollection
        .find(query)
        .limit(MAX_MEASUREMENT)
        .sort({ datetime: 1 });
      for await (const rawMeasurement of cursor) {
        result.push(rawMeasurement);
      }
      res.status(200).json(result);
    } else {
      console.log('Measurement query (from,to):', dateFrom, dateTo);
      let query = {
        datetime: {
          // 18 minutes ago (from now)
          $gt: new Date(dateFrom),
          $lt: new Date(dateTo)
        }
      };
      let result = [];
      const cursor = this.measurementCollection
        .find(query)
        .limit(MAX_MEASUREMENT)
        .sort({ datetime: 1 });
      for await (const rawMeasurement of cursor) {
        result.push(rawMeasurement);
      }
      res.status(200).json(result);
    }
  }

  async connectToMongo() {
    // const mongoOptions = {
    //     poolSize: 100,
    //     wtimeout: 2500,
    //     useNewUrlParser: true,
    //     useUnifiedTopology: true,
    //   };
    if (this.measurementCollection == null || this.seriesCollection == null) {
      console.log('Connecting to mongo ...', MONGO_URL, MONGO_DB);
      try {
        const client = await new MongoClient(MONGO_URL);
        const dbo = client.db(MONGO_DB);
        this.db = dbo;
        this.measurementCollection = dbo.collection(
          MONGO_MEASUREMENT_COLLECTION
        );
        this.seriesCollection = dbo.collection(MONGO_SERIES_COLLECTION);
        this.clientStatus.isMongoConnected = true;
      } catch (error) {
        console.error(`Error storing measurement: ${error}`);
      }
    }
  }

  async connectToMQTT() {
    this.mqttClient = mqtt.connect(MQTT_URL, { reconnectPeriod: 5000 });
    console.log(`Connected to MQTT; ${MQTT_BROKER} ${MQTT_URL}`);
  }

  async setTedgeMgmConfiguration(req, res) {
    this.tedgeFileStore.setTedgeMgmConfiguration(req, res);
  }

  async getTedgeMgmConfiguration(req, res) {
    this.tedgeFileStore.getTedgeMgmConfiguration(req, res);
  }

  async getMeasurementTypes(req, res) {
    let result = [];
    if (STORAGE_ENABLED) {
      console.log('Calling getMeasurementTypes ...');
      const query = {};
      const cursor = this.seriesCollection.find(query);
      // Print a message if no documents were found
      if (this.seriesCollection.countDocuments(query) === 0) {
        console.log('No series found!');
      }
      for await (const measurementType of cursor) {
        const series = measurementType.series;
        measurementType.series = Object.keys(series);
        result.push(measurementType);
      }
    } else {
      result = this.tedgeFileStore.getMeasurementTypes();
    }
    res.status(200).json(result);
  }

  async storeMeasurement(document) {
    console.log('Calling storeMeasurement ...');
    try {
      const insertResult = await this.measurementCollection.insertOne(document);
    } catch (error) {
      console.error(`Error storing measurement: ${error}`);
    }
  }

  async updateMeasurementTypes(document) {
    try {
      const { device, payload, type } = document;
      const series = flattenJSONAndClean(payload, '__');
      console.debug('Calling updateMeasurementTypes ...');
      const updateResult = await this.seriesCollection.updateOne(
        { type, device },
        [
          {
            $replaceWith: {
              series: {
                $mergeObjects: [series, '$series']
              },
              type,
              device
            }
          },
          { $set: { modified: '$$NOW' } }
        ],
        {
          upsert: true
        }
      );
      console.log(
        `Update measurementType, modifiedCount: ${updateResult.modifiedCount}, matchedCount: ${updateResult.matchedCount}`
      );
    } catch (error) {
      console.error(`Error storing measurementType: ${error}`);
    }
  }

  async getStorageStatistic(req, res) {
    console.log('Calling get storage satistic ...');
    const result = await this.db.command({
      dbStats: 1
    });
    res.status(200).json(result);
  }

  async getStorageTTL(req, res) {
    console.log('Calling get TTL ...');
    const result = await this.measurementCollection.indexes();
    res.status(200).json(result);
  }

  async updateStorageTTL(req, res) {
    const { ttl } = req.body;
    console.log('Calling update TTL:', ttl);
    const result = await this.db.command({
      collMod: 'measurement',
      index: {
        name: NAME_INDEX_FOR_TTL,
        expireAfterSeconds: ttl
      }
    });
    res.status(200).json(result);
  }

  getTedgeConfiguration(req, res) {
    try {
      let sent = false;
      var stdoutChunks = [];
      const child = spawn('tedge', ['config', 'list']);

      child.stdout.on('data', (data) => {
        stdoutChunks = stdoutChunks.concat(data);
      });
      child.stderr.on('data', (data) => {
        console.error(`Output stderr: ${data}`);
        res.status(500).json(data);
        sent = true;
      });

      child.on('error', function (err) {
        console.error('Error : ' + err);
        res.status(500).json(err);
        sent = true;
      });

      child.stdout.on('end', (data) => {
        console.log('Output stdout:', Buffer.concat(stdoutChunks).toString());
        if (!sent) {
          let stdoutContent = Buffer.concat(stdoutChunks).toString();
          let config = propertiesToJSON(stdoutContent);
          res.status(200).json(config);
        }
      });
      console.log('Retrieved configuration');
    } catch (err) {
      console.error('Error when reading configuration: ' + err);
      res.status(500).json({ data: err });
    }
  }

  getTedgeServiceStatus(req, res) {
    try {
      let sent = false;
      var stdoutChunks = [];

      const child = spawn('sh', [
        '-c',
        'rc-status -s | sed -r "s/ {10}//" | sort'
      ]);

      child.stdout.on('data', (data) => {
        stdoutChunks = stdoutChunks.concat(data);
      });
      child.stderr.on('data', (data) => {
        console.error(`Output stderr: ${data}`);
        res.status(500).json(data);
        sent = true;
      });

      child.on('error', function (err) {
        console.error('Error : ' + err);
        res.status(500).json(err);
        sent = true;
      });

      child.stdout.on('end', (data) => {
        console.log('Output stdout:', Buffer.concat(stdoutChunks).toString());
        if (!sent) {
          let stdoutContent = Buffer.concat(stdoutChunks).toString();
          res.status(200).send({ result: stdoutContent });
        }
      });
      console.log('Retrieved job status');
    } catch (err) {
      console.error('Error when executing top: ' + err);
      res.status(500).json({ data: err });
    }
  }

  reset(msg) {
    try {
      console.log('Starting resetting ...');
      const tasks = [
        {
          cmd: 'sudo',
          args: ['tedge', 'cert', 'remove']
        },
        {
          cmd: 'sudo',
          args: ['tedge', 'disconnect', 'c8y']
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'mosquitto']
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'tedge-mapper-c8y']
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'tedge-agent']
        },
        {
          cmd: 'echo',
          args: ['Finished resetting edge']
        }
      ];
      if (!this.cmdInProgress) {
        this.taskQueue.queueTasks(msg.job, msg.promptText, tasks, true);
        this.taskQueue.registerNotifier(this.notifier);
        this.taskQueue.start();
      } else {
        this.socket.emit('job-progress', {
          status: 'ignore',
          progress: 0,
          total: 0
        });
      }
    } catch (err) {
      console.error(`The following error occurred: ${err.message}`);
    }
  }

  restartPlugins(msg) {
    try {
      console.log('Restart plugins  ...');
      const tasks = [
        {
          cmd: 'sudo',
          args: ['tedgectl', 'restart', 'c8y-firmware-plugin']
        }
      ];
      if (!this.cmdInProgress) {
        this.taskQueue.queueTasks(msg.job, msg.promptText, tasks, true);
        this.taskQueue.registerNotifier(this.notifier);
        this.taskQueue.start();
      } else {
        this.socket.emit('job-progress', {
          status: 'ignore',
          progress: 0,
          total: 0
        });
      }
    } catch (err) {
      console.error(`The following error occurred: ${err.message}`);
    }
  }

  uploadCertificate(msg) {
    try {
      console.log('Upload certificate  ...');
      // empty job
      const tasks = [
        {
          cmd: 'echo',
          args: ['Upload certificate by UI ..., noting to do']
        }
      ];
      if (!this.cmdInProgress) {
        this.taskQueue.queueTasks(msg.job, msg.promptText, tasks, true);
        this.taskQueue.registerNotifier(this.notifier);
        this.taskQueue.start();
      } else {
        this.socket.emit('job-progress', {
          status: 'ignore',
          progress: 0,
          total: 0
        });
      }
    } catch (err) {
      console.error(`The following error occurred: ${err.message}`);
    }
  }

  configure(msg) {
    try {
      console.log(
        `Starting configuration of edge: ${msg.deviceId}, ${msg.tenantUrl}`
      );

      const tasks = [
        {
          cmd: 'sudo',
          args: ['tedge', 'cert', 'create', '--device-id', msg.deviceId]
        },
        {
          cmd: 'sudo',
          args: ['tedge', 'config', 'set', 'c8y.url', msg.tenantUrl]
        },
        {
          cmd: 'sudo',
          args: ['tedge', 'config', 'set', 'mqtt.bind.port', '1883']
        },
        {
          cmd: 'sudo',
          args: ['tedge', 'config', 'set', 'mqtt.bind.address', '0.0.0.0']
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'restart', 'collectd']
        }
      ];
      if (!this.cmdInProgress) {
        this.taskQueue.queueTasks(msg.job, msg.promptText, tasks, false);
        this.taskQueue.registerNotifier(this.notifier);
        this.taskQueue.start();
      } else {
        this.socket.emit('job-progress', {
          status: 'ignore',
          progress: 0,
          total: 0
        });
      }
    } catch (err) {
      console.error(`The following error occurred: ${err.message}`);
    }
  }

  stop(msg) {
    try {
      console.log(`Stopping edge processes ${this.cmdInProgress}...`);
      const tasks = [
        {
          cmd: 'sudo',
          args: ['tedge', 'disconnect', 'c8y'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'mosquitto'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'tedge-mapper-c8y'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'tedge-agent'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'collectd'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'stop', 'tedge-mapper-collectd'],
          continueOnError: true
        }
      ];
      if (!this.cmdInProgress) {
        this.taskQueue.queueTasks(msg.job, msg.promptText, tasks, true);
        this.taskQueue.registerNotifier(this.notifier);
        this.taskQueue.start();
      } else {
        this.socket.emit('job-progress', {
          status: 'ignore',
          progress: 0,
          total: 0
        });
      }
    } catch (err) {
      console.error(`The following error occurred: ${err.message}`);
    }
  }

  start(msg) {
    try {
      console.log(`Starting edge ${this.cmdInProgress} ...`);
      const tasks = [
        {
          cmd: 'sudo',
          args: ['tedge', 'connect', 'c8y'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'start', 'collectd'],
          continueOnError: true
        },
        {
          cmd: 'sudo',
          args: ['tedgectl', 'start', 'tedge-mapper-collectd'],
          continueOnError: true
        }
      ];

      if (!this.cmdInProgress) {
        this.taskQueue.queueTasks(msg.job, msg.promptText, tasks, false);
        this.taskQueue.registerNotifier(this.notifier);
        this.taskQueue.start();
      } else {
        this.socket.emit('job-progress', {
          status: 'ignore',
          progress: 0,
          total: 0
        });
      }
    } catch (err) {
      console.error(`Error when starting edge:${err}`, err);
    }
  }
}
module.exports = { TedgeBackend };
