require('dotenv').config();
var logger = require('./logger').logger,
    sha256 = require('js-sha256'),
    utf8 = require('utf8');

var mysql      = require('mysql');
var connection = mysql.createConnection({
    host     : process.env.DB_HOST,
    user     : process.env.DB_USER,
    password : process.env.DB_PASSWORD,
    database : process.env.DB_DATABASE
});

var msgHandshake = '/meta/handshake',
    msgConnect = '/meta/connect',
    msgSubscribe = '/meta/subscribe',
    msgApiKeyRequest = 'api_authorize_temporary_key',
    msgApiKeyRevoke = 'api_revoke_temporary_key';

const token = process.env.VR_TOKEN;
const group = process.env.VR_GROUP;
const version = process.env.VR_VERSION;

var response_channel = null,
    api_key = null;

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

function convertToBase64(string) {
    var output = '';
    output = new Buffer(string).toString('base64');

    return output;
}

function changeOutgoing(data)  {
    let message = data.message;

    if (message.channel === msgHandshake || message.channel === msgConnect) {
        return message;
    }

    let api_key = data.api_key,
        api_name = data.api_name,
        key = data.key,
        salt = generateSalt(),
        type = '',
        jsonString = JSON.stringify(message);

    if (message.channel === msgSubscribe) {
        type = msgSubscribe;
    }
    else {
        type = message.data.message;
    }

    message.ext = {
        "api": api_name,
        "token": api_key,
        "salt": convertToBase64(salt),
        "signature": createSignature(salt, jsonString, key),
        "message": type,
        "data": convertToBase64(jsonString)
    };

    if(process.env.DEBUG) {
        logger.info('---- Outgoing Message ----');
        logger.info(JSON.stringify(message));
    }

    return message;
}

function whichApi (message) {
    switch(message) {
        case 'new_opportunity':
            return 'crm_orders';
        default:
            return 'vr_store';
    }
}

let extender = {
    api_name: 'vr_store',
    location: group,
    response_channel: null,
    init: function(data) {
        this.api_name = data['api_name'];

        switch(this.api_name){
            case 'vr_store':
                this.location = group;
                break;
            case 'crm_orders':
                this.location = 'crmChannel';
                break;
        }
    },
    get_channel: function() {
        return this.response_channel;
    },
    get_group: function() {
        return group;
    },
    get_api_key: function() {
        return api_key;
    },
    get_version: function() {
        return version;
    },
    incoming: function (message, callback) {
        if (message.channel === msgHandshake && message.successful) {
            var obj = JSON.parse(JSON.stringify(message)),
                client_id = (obj.clientId);

                this.response_channel = "/" + this.api_name + "/" + process.env.VR_GROUP + "/" + client_id + "/response";
                logger.info('response channel: ' + this.response_channel);
        }

        return callback(message);
    },
    outgoing: function (message, callback) {
        api_key = token;
        if(message.data !== undefined && message.data.api_key !== undefined) {
            api_key = message.data.api_key;
            delete message.data.api_key;
        }
        else if(message.data !== undefined) {
            delete message.data.api_key;
        }

        var query = connection.query('SELECT * FROM `keys` where token = ?',[api_key], function (error, results, fields) {
            //logger.info('---- API KEY grabbed and processing outgoing request ----');
            if (error) throw error;


            var key = results[0].key,
                api_name = whichApi(message.channel);

            if(key === null) {
                logger.error('----API Key DB Error----');
                logger.error(error.toString());

                ee.emit('errorReceived', error);
                return;
            }

            let data = {
                message,
                api_key,
                key,
                api_name,
            };

            message = changeOutgoing(data);

            if(message.data !== undefined) {
                //console.log('outgoing', message);
            }
            return callback(message);
        });
    },
};

exports.extender = extender;