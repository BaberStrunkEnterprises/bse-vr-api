var Slack = require('./slack').slack,
    Logger = require('./logger').logger;

exports.response = {
    request: null,
    response: null,
    next: null,
    message: null,
    error_message: null,
    status: null,

    init: function(req, res, next) {
        this.request = req;
        this.response = res;
        this.next = next;
    },
    success: function (message) {
        this.message = message;
        this.error_message = null;
        this.status = 200;
        this.next();
    },
    error: function (id, status, message) {
        Logger.error(message);
        var error = {
            status: status,
            message: {
                messageID: id,
                error: message,
                successful: false
            }
        };
        this.error_message = error;
        this.status = status;
        this.message = null;
        this.next();
    }

};