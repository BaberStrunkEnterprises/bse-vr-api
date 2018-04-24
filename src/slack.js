const axios = require('axios');

exports.slack =  {
    test: function () {
        console.log('test');
    },
    push: function (message) {
        //var url = 'https://hooks.slack.com/services/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';
        var url = 'https://chat.bse.solutions/hooks/4CBdoQkEdnDpKSyjF/LcSobGWhM5eAaghvTDtJFT3h5MNWazgKJyB9BizWrHAjoJAY';

        if(typeof message !== 'string') {
            message = JSON.stringify(message);
        }

        axios({
            method: 'post',
            url: url,
            headers: {
                'Content-type': 'application/json'
            },
            data: {
                text: message
            }
        });
    }
};