'use strict';

const config = require('config');
const zmq = require('zmq');
const mongoose = require('mongoose');
const moment = require('moment');

const indicators = require('./indicators');

// configured constants
const INSTRUMENTS = config.get('instruments');
const RSI_DURATION = config.get('indicators.rsi-duration');

const socketIn = zmq.socket('sub');
const socketOut = zmq.socket('pub');

const TickSchema = new mongoose.Schema({}, { strict: false, toObject: true });
const Tick = mongoose.model('ticks', TickSchema, 'ticks');

// construct empty queue - last tick in newest
let tickQueues = {};
INSTRUMENTS.forEach(i => tickQueues[i] = []);
let lastRsis = {};

function init() {
  mongoose.connect(config.get('mongo.uri'), config.get('mongo.options'), err => {
    if(err) return console.error(err);

    // start pulling old ticks from Mongo
    INSTRUMENTS.forEach(pullRecentTicks);

    // subscribe to OANDA only
    socketIn.connect(config.get('mq.inflow.uri'));
    socketIn.subscribe('oanda');
    socketIn.on('message', handleMessage);

    socketOut.connect(config.get('mq.outflow.uri'));
  });
}

function handleMessage(topic, data) {
  const tick = JSON.parse(data);

  const instrument = tick.instrument;
  console.log(`received - ${instrument}`);

  // convert time into timestamp
  tick.timestamp = moment(tick.time).valueOf();

  // delete redundant fields
  delete tick.instrument;
  delete tick.time;
  delete tick.source;

  const lastRsi = lastRsis[instrument];

  if(INSTRUMENTS.indexOf(instrument) > -1) {
    tickQueues[instrument].push(tick);

    const newRsi = indicators.minuteRsi14(tickQueues[instrument]);

    // execution of strategy
    let signal;
    if(lastRsi >= 30 && newRsi < 30) {
      // short when falling below 30
      signal = 'short';

    } else if(lastRsi <= 50 && newRsi > 50) {
      // cover short when rising back to abve 50
      signal = 'cover_short';

    } else if(lastRsi <= 70 && newRsi > 70) {
      signal = 'long';

    } else if(lastRsi >= 50 && newRsi < 50) {
      signal = 'cover_long';
    }

    if(signal) {
      const messagerMessage = {
        strategy: 'minuteRsi',
        instrument: instrument,
        signal: signal,
        ask: tick.ask,
        bid: tick.bid
      };

      socketOut.send([
        'messager',
        JSON.stringify(messagerMessage)
      ]);
    }

    lastRsis[instrument] = newRsi;
  }
}

function pullRecentTicks(instrument) {
  // get all ticks in last 15 minutes
  Tick
    .find({
      instrument: instrument,
      time: { $gte: moment().subtract(RSI_DURATION, 'minutes').toDate() }
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
