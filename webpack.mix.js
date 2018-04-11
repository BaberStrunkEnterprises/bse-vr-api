const mix = require('laravel-mix');
const Dotenv = require('dotenv-webpack');

mix.js(['src/app.js'], '/');

mix.webpackConfig({
    plugins: [
        new Dotenv()
    ],
    target: 'node',
    node: {
        fs: 'empty'
    },
    externals: {
        'electron': 'require("electron")',
        'net': 'require("net")',
        'remote': 'require("remote")',
        'shell': 'require("shell")',
        'app': 'require("app")',
        'ipc': 'require("ipc")',
        'fs': 'require("fs")',
        'buffer': 'require("buffer")',
        'winston': 'require("winston")',
        'system': '{}',
        'file': '{}'
    },
});
