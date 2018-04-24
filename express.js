require('dotenv').config();
var response = require('./src/response').response,
    logger = require('./src/logger').logger;

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

var app = express(),
    bodyParser = require('body-parser'),
    client = new Faye.Client(process.env.VR_URL),
    extender = require('./src/extender').extender;

var timeout;
const time_lapse = .5 * 60 * 1000;

client.addExtension(extender);
client.disable('WebSocket');

app.on('uncaughtException', function (request, response, route, error) {});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.options('*', cors());

app.post('/:version/:message', responseApi, function(req, res, next) {
    if(response.message !== null) {
        return res.status(response.status).type('json').send(response.message);
    }
    if(response.error_message !== null) {
        return res.status(response.status).type('json').send(response.error_message);
    }
});
app.get('/', responseHome);

var ip = getIPAddress();
app.listen({
        port: 3030,
        hostname: 'api.bse.solutions',
    },
    function () {
       logger.info('---- Server Started ----');
    }
);

function responseApi(req, res, next) {
    var message = req.params.message,
        version = req.params.version
        uri = '/' + version + '/' + message,
        options = typeSetOptions(req.body),
        api_name = whichApi(message);

    response.init(req, res, next);

    logger.info('---- HTTP Request Received: '+ uri + ' ----');

    extender.init({
        api_name: api_name
    });

    timeout = setTimeout(function() {
        logger.error('---- Request Timed Out ----');

        return response.error('general',500, 'Request Timed Out');
    }, time_lapse);

    client.connect(function () {
        //logger.info('---- Connected to VR API ----');

        client.subscribe(extender.get_channel(), messageReceived)
            .then(publish(message, options))
            .catch(error);

    });
}

function publish(message, options) {
    //logger.info('---- Subscribed ----');

    var api = extender.api_name,
        location = options.siteID,
        group = extender.get_group(),
        version = extender.get_version(),
        api_key = extender.get_api_key();

    if(message === msgApiKeyRequest) {
        //options['expires'] = moment().add(1,'hours').format();
    }
    if(message === msgApiKeyRevoke) {
        options['temp_token'] = api_key;
    }

    var json = getRequest(message, options, api_key),
        channel = '/' + api + '/' + group + '/' + location,
        messageID = json[version].messageID;

    //logger.info('---- Publishing to: ' + channel + ' ----');

    client.publish(channel, json)
        .then(function () {
            //logger.info('---- Published ----');
        })
        .catch(function (error) {
            logger.error('---- Publish Error ----');
            return response.error(json[version].messageID, 400, error);
        });

    return messageID;
}

function error(error) {
    logger.error('---- Caught an Error----');
    logger.log(error);

    clearTimeout(timeout);
    return response.error('general',400, error);
}

function messageReceived(message) {
    //logger.info('---- Message Received ----');

    clearTimeout(timeout);

    var version = extender.get_version(),
        messageID = message.data[version].messageID;

    if (message.data[version].successful) {
        //logger.info('---- Successful ----');

        return response.success(message);
    }
    else {
        logger.error('---- Failed ----');

        return response.error(messageID, 400, message);
    }
}

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
    return response.success(string);
    //return next();
}

function whichApi(message) {
    switch(message) {
        case 'new_opportunity':
            return 'crm_orders';
        default:
            return 'vr_store';
    }
}

function getRequest(message, options, api_key) {
    //logger.info('---- Getting Request ----');
    var json = {
        message: message,
        api_key: api_key
    };

    var date = new Date(),
        time = date.getTime(),
        ver = '',
        version = extender.get_version();

    if(options.siteID !== undefined) {
        ver = options.siteID;
    }

    ver += message.replace(/^\//,'') + time.toString();

    json[version] = options;
    json[version].returnChannel = extender.get_channel();
    json[version].messageID = ver;
    json[version].currentTimeStamp =  new Date().toISOString();

    return json;
}

function typeSetOptions(options) {
    for(var index in options) {
        switch(index) {
            case 'siteID':
            case 'transactionType':
            case 'points':
            case 'minimumAvailable':
                options[index] = parseInt(options[index]);
                break;
            case 'totalPayment':
            case 'depositAmount':
            case 'convenienceFee':
                options[index] = parseFloat(options[index]);
                break;
            case 'includeUsed':
            case 'includeNew':
                options[index] = (options[index] === "true");
                break;
            default:
                options[index] = options[index];
                break;
        }
    }

    return options;
}