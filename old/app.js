require('dotenv').config();
var vr = require('../src/vr').vr,
    response = require('../src/response').response,
    logger = require('../src/logger').logger,
    slack = require('../src/slack').slack;

var Faye = require('faye'),
    events = require('events'),
    os = require('os'),
    express = require('express'),
    cors = require('cors');

var msgApiKeyRequest = 'api_authorize_temporary_key',
    msgApiKeyRevoke = 'api_revoke_temporary_key';

var token = process.env.VR_TOKEN,
    group = process.env.VR_GROUP,
    version = '';

var EventEmitter = events.EventEmitter,
    ee = new EventEmitter(),
    waitTime = 0.5 * 60 * 1000;

function getIPAddress() {
    var ifaces = os.networkInterfaces();
    var ip;

    Object.keys(ifaces).forEach(function (ifname) {
        var alias = 0;

        ifaces[ifname].forEach(function (iface) {
            if ('IPv4' !== iface.family || iface.internal !== false) {
                // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
                return;
            }

            if (alias >= 1) {
                // this single interface has multiple ipv4 addresses
                //console.log(ifname + ':' + alias, iface.address);
                ip = iface.address;
            } else {
                // this interface has only one ipv4 adress
                //console.log(ifname, iface.address);
                ip = iface.address;
            }
            ++alias;
        });
    });

    return ip.toString();
}

function responseHome(req, res, next) {
    var string = 'BSE VR API';
    response.init(req, res, next);
    response.success(string);
    //return next();
}

function responseApi(req, res, next) {
    response.res = res;
    console.log('received http req');
    var message = req.params.message,
        api_key = null;

    if(message === msgApiKeyRequest || message === msgApiKeyRevoke) {
        api_key = token;
    }
    else {
        api_key = req.headers['x-api-key'];
    }

    version = req.params.version;

    var options = {};

    if(req.headers['x-store-number'] !== undefined || req.headers['x-store-number'] !== null) {
        options['siteID'] = parseInt(req.headers['x-store-number']);
    }
    else {
        var error = 'Store Undefined';
        logger.error(error);
        slack.push(error);
        response.error(null, 400, error);
    }

    var temp = req.body;

    if(typeof req.body === 'string') {
        temp = req.params;
    }

    // Collect Deposit needs to be looked at
    for(var index in temp ) {
        if(index === 'siteID') {
            // do nothing
        }
        else if(index === 'transactionType') {
            options[index] = parseInt(temp[index]);
        }
        else if(index === 'points') {
            options[index] = parseInt(temp[index]);
        }
        else if(index === 'totalPayment') {
            options[index] = parseFloat(temp[index]);
        }
        else if(index === 'minimumAvailable') {
            options[index] = parseInt(temp[index]);
        }
        else if(index === 'includeUsed') {
            options[index] = (temp[index] === "true");
        }
        else if(index === 'includeNew') {
            options[index] = (temp[index] === "true");
        }
        else if(index === 'depositAmount') {
            options[index] = parseFloat(temp[index]);
        }
        else if(index === 'convenienceFee') {
            options[index] = parseFloat(temp[index]);
        }
        else {
            options[index] = temp[index];
        }
    }
    console.log('before publish');
    var messageID = vr.publish(message, options, api_key);
    console.log('after publish');

    var timeout = setTimeout(function() {
        var string = '----Timeout: '+ messageID +'----';
        logger.error(string);
        slack.push(string);
        response.error(messageID, 500, string);
    }, waitTime);

    ee.on('messageReceived', function(message) {
        console.log('response: ', message);
        if(message.data.message === msgApiKeyRequest) {
            keys[message.data.temp_token] = message.data.private_key;
            delete message.data.private_key;
        }

        if(message.data[version].messageID === messageID) {
            clearTimeout(timeout);
            response.success(message);
        }
    });

    ee.on('errorReceived', function(message) {
        console.log(message);
        //if(message.message.messageID === messageID) {
            clearTimeout(timeout);
            slack.push(message.message.error);
            response.error(messageID, message.status, message.message);
            //return next();
        //}
    });
}

var app = express(),
    client = new Faye.Client(process.env.VR_URL);

app.on('uncaughtException', function (request, response, route, error) {});

app.use(cors());
app.options('*', cors());

app.post('/:version/:message', responseApi);
app.get('/', responseHome);

var ip = getIPAddress();
app.listen({
    port: 3030,
    //hostname: 'dev.api.local',
},
    function () {
        vr.connect();
    }
);
