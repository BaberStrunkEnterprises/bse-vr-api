# Mostly RESTful VersiRent API

This API is an interface that hooks into the existing VersiRent API.

App is written with node.js to integrate with the faye server but provide an approximate restful solution.

All API calls are identical to the VersiRent API documentation and are versioned. 

```http://127.0.0.1:300/v1/site_information```

All calls are POST requests as of 0.1.0

All calls except the api_temporary token requests (request and revoke) require an x-api-key header to be sent.

