'use strict';

const fs = require('fs');
const path = require('path');
const { getWorkerSource } = require('./source');

function writeWorker(distDir, workerSource) {
  fs.writeFileSync(path.join(distDir, '_worker.js'), workerSource);
}

module.exports = {
  writeWorker,
  getWorkerSource
};
