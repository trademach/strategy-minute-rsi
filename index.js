'use strict';

const config = require('config');
const zmq = require('zmq');
const mongoose = require('mongoose');
const moment = require('moment');

const socket = zmq.socket('sub');

const TickSchema = new mongoose.Schema({}, { strict: false, toObject: true });
const Tick = mongoose.model('ticks', TickSchema, 'ticks');

const INSTRUMENTS = config.get('instruments');

// construct empty queue - last tick in newest
let tickQueues = {};
INSTRUMENTS.forEach(i => tickQueues[i] = []);

function init() {
  mongoose.connect(config.get('mongo.uri'), config.get('mongo.options'), err => {
    if(err) return console.error(err);

    // start pulling old ticks from Mongo
    INSTRUMENTS.forEach(pullRecentTicks);

    // subscribe to OANDA only
    socket.connect(config.get('mq.uri'));
    socket.subscribe('oanda');
    socket.on('message', handleMessage);
  });
}

function handleMessage(topic, data) {
  const tick = JSON.parse(data);

  const instrument = tick.instrument;

  // convert time into timestamp
  tick.timestamp = moment(tick.time).valueOf();

  // delete redundant fields
  delete tick.instrument;
  delete tick.time;
  delete tick.source;

  if(INSTRUMENTS.indexOf(instrument) > -1) {
    tickQueues[instrument].push(tick);
  }

  console.log(`received - ${instrument}`);
}

function pullRecentTicks(instrument) {
  // get all ticks in last 15 minutes
  Tick
    .find({
      instrument: instrument,
      time: { $gte: moment().subtract(15, 'minutes').toDate() }
    })
    .lean()
    .exec((err, ticks) => {
      const tickObjs = ticks.map(t => {
        return {
          timestamp: Number(t.time),
          bid: t.bid,
          ask: t.ask
        };
      });

      // merge Mongo ticks with recently pulled ticks
      const oldQueue = tickQueues[instrument].slice();
      const newQueue = ticks.map(t => {
        return {
          timestamp: Number(t.time),
          bid: t.bid,
          ask: t.ask
        };
      });

      oldQueue.forEach(t => {
        if(t.timestamp > newQueue[newQueue.length - 1].timestamp) {
          newQueue.push(t);
        }
      });
      tickQueues[instrument] = newQueue;

      console.log(`merged - ${instrument}`);
    });
}

init();
