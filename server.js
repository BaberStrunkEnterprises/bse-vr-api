require('dotenv').config();
let response = require('./src/response').response,
    logger = require('./src/logger').logger;

let express = require('express'),
    cors = require('cors');

let app = express(),
    bodyParser = require('body-parser');

app.on('uncaughtException', function (request, response, route, error) {});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.options('*', cors());

let api = require('./src/api').api;

app.post('/:version/:message', api.responseApi, api.sendResponse);
app.get('/', api.responseHome);

app.listen({
        port: 3030,
        //hostname: 'api.bse.solutions',
    },
    function () {
        logger.info('---- Server Started ----');
    }
);