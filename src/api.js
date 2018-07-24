require('dotenv').config();
var Faye = require('faye'),
    logger = require('./logger').logger;

let timeout = null;

let api = {
    responseHome: function(req, res, next) {
        let string = 'BSE VR API',
            response = this.response;
        response.init(req, res, next);
        return response.success(string);
        //return next();
    },
    sendResponse: function(req, res, next) {
        let response = this.response;

        if(process.env.DEBUG) {
            logger.info(response.full_message);
        }

        if(response.message !== null) {
            return res.status(response.status).type('json').send(response.message);
        }
        if(response.error_message !== null) {
            return res.status(response.status).type('json').send(response.error_message);
        }
    },
    responseApi: function(req, res, next) {
        let client = new Faye.Client(process.env.VR_URL),
            extender = require('./extender').extender,
            response = require('./response').response;

        const time_lapse = .5 * 60 * 1000;

        client.addExtension(extender);
        client.disable('WebSocket');


        let message = req.params.message,
            version = req.params.version,
            uri = '/' + version + '/' + message,
            location = req.headers['x-store-number'],
            options = typeSetOptions(req.body);


        response.init(req, res, next);

        logger.info('---- HTTP Request Received: '+ uri + 'for '+ location + ' ----');

        timeout = setTimeout(function() {
            logger.error('---- Request Timed Out: '+ extender.get_channel() + ' ----');

            return response.error('general',500, 'Request Timed Out');
        }, time_lapse);

        let data = {
            message,
            options,
            extender,
            client,
        };

        let connection = client.connect(() => {
            let channel = extender.get_channel();

            logger.info('---- Subscribing to: ' + channel + ' ----');

            client.subscribe(channel, messageReceived)
                .then(publish(data))
                .catch(error);
        });
    }
};

function publish(data) {
    logger.info('---- Subscribed ----');

    let message = data.message,
        options = data.options,
        extender = data.extender,
        client = data.client;

    var api = extender.api_name,
        location = options.siteID,
        group = extender.get_group(),
        version = extender.get_version(),
        api_key = extender.get_api_key();

    var json = getRequest(extender, message, options, api_key),
        channel = '/' + api + '/' + group + '/' + locationl

    logger.info('---- Publishing to: ' + channel + ' ----');

    client.publish(channel, json)
        .then(function () {
            logger.info('---- Published ----');
        })
        .catch(function (error) {
            logger.error('---- Publish Error ----');
            return response.error(json[version].messageID, 400, error);
        });

    //return messageID;
}

function error(error) {
    logger.error('---- Caught an Error----');
    logger.log(error);

    clearTimeout(timeout);
    return api.response.error('general',400, error);
}

function messageReceived(message) {
    logger.info('---- Message Received ----');

    clearTimeout(timeout);

    api.response.full_message = message;

    if(process.env.DEBUG) {
        logger.info(message);
    }


    let version = process.env.VR_VERSION,
        messageID = message.data[version].messageID;

    if (message.data[version].successful) {
        //logger.info('---- Successful ----');

        return api.response.success(message);
    }
    else {
        logger.error('---- Failed ----');

        return api.response.error(messageID, 400, message);
    }
}

function getRequest(extender, message, options, api_key) {
    logger.info('---- Getting Request ----');
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
    let output = {};
    console.log(options);
    for(var index in options) {
        switch(index) {
            case 'siteID':
            case 'transactionType':
            case 'points':
            case 'minimumAvailable':
                output[index] = parseInt(options[index]);
                break;
            case 'totalPayment':
            case 'depositAmount':
            case 'convenienceFee':
                output[index] = parseFloat(options[index]);
                break;
            case 'includeUsed':
            case 'includeNew':
                output[index] = (options[index] === "true");
                break;
            default:
                let re = /([a-zA-Z0-9_]+)\[[0-9]+\]\[([a-zA-Z0-9_]+)\]/,
                    matches = index.match(re);

                if(matches !== null) {
                    if(output[matches[1]] === undefined) {
                        output[matches[1]] = [];
                    }
                    output[matches[1]].push({
                        [matches[2]]: options[index],
                    });
                }
                else {
                    output[index] = options[index];
                }
                break;
        }
    }
    return output;
}

exports.api = api;