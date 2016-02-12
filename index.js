'use strict';

const config = require('config');
const zmq = require('zmq');
const mongoose = require('mongoose');

const socket = zmq.socket('sub');

function init() {
  mongoose.connect(config.get('mongo.uri'), config.get('mongo.options'), err => {
    if(err) return console.error(err);

    // subscribe to OANDA only
    socket.connect(config.get('mq.uri'));
    socket.subscribe('oanda');
    socket.on('message', handleMessage);
  });
}

function handleMessage(topic, data) {
  const message = JSON.parse(data);

  console.log(message);
}

init();
