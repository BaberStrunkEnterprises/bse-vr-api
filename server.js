require('dotenv').config();

let express = require('express'),
    cors = require('cors'),
    logger = require('./src/logger').logger,
    vr = require('./src/vr').vr;

let app = express(),
    bodyParser = require('body-parser');

app.set('view engine', 'pug');
app.set('views', './views');

app.on('uncaughtException', function (request, response, route, error) {});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.options('*', cors());

app.post('/:version/:message', vr.httpResponse);
app.get('/', function(req, res, next){
    res.render('index', { title: 'BSE VRI API', message: 'BSE VRI API' })
});

app.listen({
        port: 3030,
    },
    function () {
        logger.info('---- Server Started ----');
    }
);
