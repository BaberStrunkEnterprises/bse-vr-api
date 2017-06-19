#!/usr/bin/env node
var http = require('http');
var faye = require('faye');

var server = http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Hello World\n');
});
var bayeux = new faye.NodeAdapter({mount: '/faye', timeout: 45});

var client = new faye.Client('http://faye.bse.solutions/faye');

bayeux.getClient().publish('/foo', {text: 'Output'});

bayeux.attach(server);

server.listen(3000, 'localhost');
console.log('Server running at http://localhost:3000/');