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
    group = process.env.VR_GROUP;

var mysql      = require('mysql');
var connection = mysql.createConnection({
    host     : process.env.DB_HOST,
    user     : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_DATABASE
});

var client = new Faye.Client(process.env.VR_URL);



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









client.addExtension(Extender);
client.disable('WebSocket');

exports.vr = {
    extender: null,
    connect: function (version, api_name, extender) {
        this.extender = extender;

        client.connect(function () {
            client.subscribe(channels[api_name].response, function (message) {
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