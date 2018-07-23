var sha256 = require('js-sha256'),
    utf8 = require('utf8'),
    Faye = require('faye');
    Slack = require('./slack').slack,
    Logger = require('./logger').logger,
    events = require('events');

var msgHandshake = '/meta/handshake',
    msgConnect = '/meta/connect',
    msgSubscribe = '/meta/subscribe',
    msgApiKeyRequest = 'api_authorize_temporary_key',
    msgApiKeyRevoke = 'api_revoke_temporary_key';

var EventEmitter = events.EventEmitter,
    ee = new EventEmitter();

var token = process.env.VR_TOKEN,
    group = process.env.VR_GROUP,
    version = '';

var channels = {
    vr_store: {
        response: '',
        publish: '/vr_store/' + group + '/'
    },
    crm_orders: {
        response: '',
        publish: '/crm_orders/' + group + '/'
    }
};

var mysql      = require('mysql');
var connection = mysql.createConnection({
    host     : process.env.DB_HOST,
    user     : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_DATABASE
});

var client = new Faye.Client(process.env.VR_URL);

function convertToBase64(string) {
    var output = '';
    output = new Buffer(string).toString('base64');

    return output;
}

function getRequest(message, options, api_key) {
    var json = {
        message: message,
        api_key: api_key
    };

    var date = new Date(),
        time = date.getTime(),
        ver = '';

    if(options.siteID !== undefined) {
        ver = options.siteID;
    }

    ver += message.replace(/^\//,'') + time.toString();

    var api = whichApi(message);

    json[version] = options;
    json[version].returnChannel = channels[api].response;
    json[version].messageID = ver;
    json[version].currentTimeStamp =  new Date().toISOString();

    return json;
}

function whichApi(message) {
    var pattern = new RegExp('crm_orders');

    if(pattern.exec(message)) {
        message = 'crm_orders';
    }

    switch(message) {
        case 'new_opportunity': case 'crm_orders':
        return 'crm_orders';
        default:
            return 'vr_store';
    }
}

function whichLocation(message, options) {
    switch(message) {
        case 'new_opportunity':
            return 'crmChannel';
        default:
            return options.siteID;
    }
}

function createSignature(salt, json, key) {
    var utf8Json = utf8.encode(json),
        utf8Key = utf8.encode(key),
        utf8Salt = utf8.encode(salt);

    var encodedJson = sha256(utf8Json),
        encodedJsonPlusKey = sha256(encodedJson + utf8Key),
        encodedJsonPlusKeyPlusSalt = sha256(encodedJsonPlusKey + utf8Salt);

    return encodedJsonPlusKeyPlusSalt;
}

function generateSalt() {
    var charString = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
        salt = '';

    for(var i = 0; i < 16; i++) {
        salt += charString[Math.floor(Math.random() * charString.length)];
    }
    return salt;

}

function outgoingResponse(message, api_key, key) {
    var salt = generateSalt(),
        type = '';

    var jsonString = JSON.stringify(message);
    var api = null;

    if (message.channel === msgHandshake || message.channel === msgConnect) {
        return message;
    }
    else if (message.channel === msgSubscribe) {
        type = msgSubscribe;
        api = whichApi(message.subscription);
    }
    else {
        type = message.data.message;
        api = whichApi(type);
    }

    message.ext = {
        "api": api,
        "token": api_key,
        "salt": convertToBase64(salt),
        "signature": createSignature(salt, jsonString, key),
        "message": type,
        "data": convertToBase64(jsonString)
    };

    return message;
}

var Extender = {
    incoming: function (message, callback) {
        if (message.channel === msgHandshake && message.successful) {
            var obj = JSON.parse(JSON.stringify(message)),
                client_id = (obj.clientId);

            for(var index in channels) {
                channels[index].response = "/" + index + "/" + group + "/" + client_id + "/response";

                Logger.info(index + ' response channel: ' + channels[index].response);
                Slack.push(index + ' response channel: ' + channels[index].response);
            }
        }

        if(message.data !== undefined) {
            console.log(callback);
            console.log('incoming', message.data);
        }

        return callback(message);
    },
    outgoing: function (message, callback) {
        if(message.data !== undefined && message.data.api_key !== undefined) {
            var api_key = message.data.api_key;
            delete message.data.api_key;
        }
        else if(message.data !== undefined) {
            delete message.data.api_key;
            api_key = token;
        }
        else {
            api_key = token;
        }

        var query = connection.query('SELECT * FROM `keys` where token = ?',[api_key], function (error, results, fields) {
            if (error) throw error;

            var key = results[0].key;

            if(key === null) {
                Logger.error('----API Key DB Error----');
                Logger.error(error.toString());

                ee.emit('errorReceived', error);
                return;
            }

            message = outgoingResponse(message, api_key, key);

            if(message.data !== undefined) {
                console.log('outgoing', message);
            }
            return callback(message);
        });
    }
};

client.addExtension(Extender);
client.disable('WebSocket');

exports.vr = {
    connect: function () {
        client.connect(function () {
            for (var index in channels) {
                client.subscribe(channels[index].response, function (message) {
                    var messageID = message.data[version].messageID;

                    if (message.data[version].successful) {
                        console.log('----Message Received: ' + messageID + '----');
                        ee.emit('messageReceived', message);
                    }
                    else {
                        var error_message = message.data[version].errorDescription;

                        if (error_message === undefined) {
                            error_message = 'No error message defined.';
                        }

                        console.log('----Message Error: ' + error_message + '----');
                        console.log('message:', message);

                        var error = {
                            status: 400,
                            message: {
                                messageID: messageID,
                                successful: false,
                                message: error_message
                            }
                        };

                        Slack.push(error_message);
                        ee.emit('errorReceived', error);
                    }
                })
                    .then(function () {
                        Logger.info('----Subscribed----');
                    })
                    .catch(function (error) {
                        Logger.error('----Subscription error----');
                        Logger.error(error.toString());
                        Slack.push(error.toString());

                        var n_error = {
                            status: 401,
                            message: {
                                successful: false,
                                message: error_message
                            }
                        };

                        ee.emit('errorReceived', n_error);
                    });
            }
        });
    },
    publish: function(message, options, api_key) {
        var api = whichApi(message);
        var location = whichLocation(message, options);

        if(message === msgApiKeyRequest) {
            //options['expires'] = moment().add(1,'hours').format();
        }
        if(message === msgApiKeyRevoke) {
            options['temp_token'] = api_key;
        }

        var json = getRequest(message, options, api_key),
            channel = channels[api].publish + location,
            messageID = json[version].messageID;

        Logger.info('----Publishing \''+ messageID + '\' to: ' + channel + '----');

        Slack.push(JSON.stringify(json));

        client.publish(channel, json)
            .then(function () {
                Logger.info('----Published----');
            })
            .catch(function (error) {
                Logger.error('----Publish Error----');
                Logger.error(error.toString());

                var error = {
                    status: error.code,
                    message: {
                        messageID: messageID,
                        error: '*' + error.toString() + '*  _\'' + message + '\'_ to: ' + channel,
                        successful: false
                    }
                };

                ee.emit('errorReceived', error);
            });

        return messageID;
    }
};