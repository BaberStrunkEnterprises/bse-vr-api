const winston = require('winston');
const slack = require('./slack').slack;

require('winston-daily-rotate-file');

var transport = new (winston.transports.DailyRotateFile)({
    filename: 'logs/.log',
    level: 'debug',
    datePattern: 'yyyy-MM-dd',
    prepend: true,
    maxDays: 30
});

const logger = new (winston.Logger)({
    transports: [
        transport
    ],
    exitOnError: false
});

exports.logger = {
    info: function(message) {
        console.log(message);
        slack.push(message);
        logger.info(message);
    },
    error: function(message) {
        console.log(message);
        slack.push(message);
        logger.error(message);
    },
    warn: function(message) {
        console.log(message);
        slack.push(message);
        logger.warn(message);
    }
};