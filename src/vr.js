require('dotenv').config();
let logger = require('./logger').logger;

const time_lapse = .5 * 60 * 1000;

function typeSetOptions(options) {
    let output = {};
    for(let index in options) {

        if(options[index] === '') {
            return typeSetOptions(JSON.parse(index));
        }

        console.log(index);
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
            case 'person':
            case 'cardInfo':
                // json object
                output[index] = {};
                for(let i in options[index]) {
                    output[index][i] = options[index][i];
                }
                break;
            case 'items':
                // array of objects
                    console.log(options[index]);
                    for(let i = 0; i < options[index].length; i++) {
                        for(let j in options[index][i]) {
                            output[index] = [];
                            let temp = {};
                            switch(j) {
                                case 'term':
                                case 'dailyRate':
                                case 'weeklyRate':
                                case 'semiRate':
                                case 'monthlyRate':
                                case 'price':
                                    temp[j] = parseFloat(options[index][i][j]);
                                    break;
                                default:
                                    temp[j] = options[index][i][j];
                                    break;
                            }
                            output[index].push(temp);
                        }
                    }
                break;
            default:
                let regex = /[\[\{]/,
                    found = options[index].match(regex);

                if(found === null) {
                    output[index] = options[index];
                }
                else {
                    output[index] = JSON.parse(options[index]);
                }
                /*let re = /([a-zA-Z0-9_]+)\[[a-zA-Z0-9]+\]\[([a-zA-Z0-9_]+)\]/,
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
                    output[index] = JSON.parse(options[index]);
                }*/
                break;
        }
    }
    return output;
}

function whichApi(message) {
    switch(message) {
        case 'new_opportunity':
            return 'crm_orders';
        default:
            return 'vr_store';
    }
}

function VrResponse() {
    this.req = null;
    this.res = null;
    this.next = null;
    this.timeout = null;
    this.client = null;
    this.extender = null;

    this.publish_messageID = null;

    this.sendError = function (data) {
        let error = {
            status: data.status,
            message: {
                messageID: data.id,
                error: data.message,
                successful: false
            }
        };

        clearTimeout(this.timeout);

        return this.res.status(error.status).type('json').send(error);

    };

    this.setUpVrApi = function (message) {
        let Faye = require('faye'),
            api_name = whichApi(message);

        this.client = new Faye.Client(process.env.VR_URL);
        this.extender = require('./extender').extender;


        this.client.addExtension(this.extender);
        this.client.disable('WebSocket');

        this.extender.init({
            api_name: api_name
        });
    };

    this.getRequest = function (message, options, api_key) {
        logger.info('---- Getting Request ----');
        let json = {
            message: message,
            api_key: api_key
        };

        let date = new Date(),
            time = date.getTime(),
            ver = '',
            version = this.extender.get_version();

        if (options.siteID !== undefined) {
            ver = options.siteID;
        }

        ver += message.replace(/^\//, '') + time.toString();

        json[version] = options;
        json[version].returnChannel = this.extender.get_channel();
        json[version].messageID = ver;
        json[version].currentTimeStamp = new Date().toISOString();

        return json;
    };

    this.publish = function (message, options) {
        logger.info('---- Subscribed ----');

        let api = this.extender.api_name,
            location = options.siteID,
            group = this.extender.get_group(),
            version = this.extender.get_version(),
            api_key = this.extender.get_api_key();

        if(location === undefined && api === 'crm_orders') {
            location = 'crmChannel';
        }

        let json = this.getRequest(message, options, api_key),
            channel = '/' + api + '/' + group + '/' + location,
            messageID = json[version].messageID;

        this.publish_messageID = messageID;

        logger.info('---- Publishing to: ' + channel + ' ----');

        this.client.publish(channel, json)
            .then(function () {
                logger.info('---- Published ----');
            })
            .catch(function (error) {
                logger.error('---- Publish Error ----');
                return this.sendError({
                    id: messageID,
                    status: 500,
                    message: 'Publish Error'
                });
            });

    };

    this.publish_error = function (error) {
        logger.error('---- Caught an Error----');
        logger.error(JSON.stringify(error));

        clearTimeout(this.timeout);
        return this.sendError({
            id: 'general',
            status: 400,
            message: error,
        });
    }
}

let vr = {
    httpResponse: function(req, res, next) {
        // creating a new VersiRent Response
        let vr = new VrResponse();

        // saving to object for later use if necessary
        vr.req = req;
        vr.res = res;
        vr.next = next;

        // variable set up
        let message = req.params.message,
            version = req.params.version,
            store_number = req.headers['x-store-number'],
            uri = '/' + version + '/' + message,
            options = typeSetOptions(req.body);

        // notify logger of receipt
        logger.info('---- HTTP Request Received: '+ uri + ' at '+ store_number +' ----');

        // set up VersiRent API clients
        vr.setUpVrApi(message);

        // connect to the api
        vr.client.connect(function () {
            //logger.info('---- Connected to VR API ----');

            // subscription channel for response
            let channel = vr.extender.get_channel();

            vr.client.subscribe(channel,function(message) {
                logger.info('---- Message Received ----');

                clearTimeout(vr.timeout);

                let version = vr.extender.get_version(),
                    messageID = message.data[version].messageID;

                console.log(message);

                if (message.data[version].successful) {
                    //logger.info('---- Successful ----');

                    console.log(message);
                    try {
                        return vr.res.status(200).type('json').send(message);
                    }
                    catch(e) {
                        logger.error(e.message);
                    }
                }
                else {
                    return vr.sendError({
                        id: messageID,
                        status: 400,
                        message: message
                    });
                }
            }).then(vr.publish(message, options))
                .catch(vr.publish_error);

        });

        // set timeout so we don't wait forever
        vr.timeout = setTimeout(function() {
            logger.error('---- Request Timed Out: '+ uri + ' at '+ store_number + ' ----');

            return vr.sendError({
                id: 'general',
                status: 500,
                message: 'Request Timed Out'
            });
        }, time_lapse);

        //return res.status(200).send('BSE VR API');
    }
};

exports.vr = vr;