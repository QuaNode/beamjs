## Services

Services in BeamJS provide a standardized way to integrate with external systems, APIs, and third-party services. They encapsulate complex integration logic while providing a clean, testable interface.

### Unified Integration Pattern
BeamJS services abstract the complexities of different external APIs into a consistent interface that:
- **Standardizes Authentication**: Common patterns for API keys, OAuth, JWT, and custom authentication
- **Normalizes Request/Response**: Consistent data structures regardless of external API variations
- **Handles Rate Limiting**: Built-in support for API rate limits and retry logic
- **Provides Error Handling**: Comprehensive error management with proper error propagation

### Client Session Management
Services implement sophisticated client session management that:
- **Isolates Requests**: Each client maintains independent session state
- **Optimizes Connections**: Reuses authenticated connections when possible
- **Manages Timeouts**: Automatic cleanup of inactive sessions
- **Prevents Leaks**: Memory-safe session handling with garbage collection

### Security-First Design
Every service integration follows security best practices:
- **Credential Protection**: API keys and secrets never exposed in logs or responses
- **Request Validation**: All input parameters validated before external calls
- **Response Sanitization**: External responses cleaned and validated

## Service Structure and Implementation

### Basic Service Definition
```javascript
var backend = require('beamjs').backend();
var service = backend.service();

module.exports.externalService = service('externalService', 
    function doReq(request, callback) {
        // Request handling logic
    }, 
    function doAuth(request, callback) {
        // Authentication logic
    }, 
    function isAuth(request, callback) {
        // Authentication verification (optional)
    }
);
```

### Service Components

#### Request Handler (doReq)
The primary function that processes service requests:
```javascript
function doReq(request, callback) {
    let catchError = function (er) {
        callback(null, er);                        // Error first callback
    };
    let thenResponse = function (res) {
        callback(res);                             // Success response
    };
    
    // Extract and validate request data
    let { client, parameters } = request.data || {};
    
    // Validate client session
    if (typeof client !== 'string' || !clients[client]) {
        return catchError(new Error('Please authenticate first'));
    }
    
    // Extract method from request options
    let { method } = request.options || {};
    if (typeof method !== 'string' || typeof methods[method] !== 'function') {
        return catchError(new Error('Invalid requested method'));
    }
    
    // Update session activity
    clients[client].time = new Date().getTime();
    
    // Execute requested method
    methods[method](client, ...parameters)
        .then(thenResponse)
        .catch(catchError);
}
```

#### Authentication Handler (doAuth)
Manages client authentication and session creation:
```javascript
function doAuth(request, callback) {
    let catchError = function (er) {
        callback(null, er);
    };
    let thenResponse = function (id) {
        callback(id);
    };
    
    let { client, apiKey, credentials } = request.data || {};
    
    // Validate client ID format
    if (client != undefined && typeof client !== 'string') {
        return catchError(new Error('Invalid client Id'));
    }
    
    // Check existing session validity
    if (typeof client === 'string' && clients[client]?.time) {
        if (new Date().getTime() - clients[client].time < SESSION_TIMEOUT) {
            clients[client].time = new Date().getTime();
            return thenResponse(client);
        }
    }
    
    // Create new authenticated session
    var time = new Date().getTime();
    clients[client = time] = {
        time,
        apiKey,
        externalClient: createExternalClient(credentials)
    };
    
    // Setup session cleanup
    setupSessionCleanup(client);
    
    thenResponse(client + '');
}
```

### Advanced Service Patterns

#### Multi-Method Service Implementation
Services often need to support multiple operations:
```javascript
var methods = {

    createPaymentIntent: function (client, amount, currency, description) {
        var stripeClient = clients[client].stripe;
        
        // Validate amount limits (Stripe: $0.50 minimum, $999,999.99 maximum)
        if (amount < 0.5) {
            throw new Error('Amount must be at least $0.50');
        }
        if (amount > 999999.99) {
            throw new Error('Amount exceeds maximum limit of $999,999.99');
        }
        
        return stripeClient.paymentIntents.create({
            amount: Math.round(amount * 100),          // Convert to cents
            currency: currency.toLowerCase(),
            automatic_payment_methods: { enabled: true },
            description: description,
            metadata: {
                source: 'beamjs_app',
                timestamp: new Date().toISOString()
            }
        }).then(function (paymentIntent) {
            return {
                success: true,
                paymentIntentId: paymentIntent.id,
                clientSecret: paymentIntent.client_secret,
                status: paymentIntent.status
            };
        });
    },

    confirmPayment: function (client, paymentIntentId, paymentMethodId) {
        var stripeClient = clients[client].stripe;
        
        return stripeClient.paymentIntents.confirm(paymentIntentId, {
            payment_method: paymentMethodId
        }).then(function (paymentIntent) {
            return {
                success: paymentIntent.status === 'succeeded',
                status: paymentIntent.status,
                amount: paymentIntent.amount / 100,
                charges: paymentIntent.charges.data
            };
        });
    },

    retrievePayment: function (client, paymentIntentId) {
        var stripeClient = clients[client].stripe;
        
        return stripeClient.paymentIntents.retrieve(paymentIntentId)
            .then(function (paymentIntent) {
                return {
                    id: paymentIntent.id,
                    status: paymentIntent.status,
                    amount: paymentIntent.amount / 100,
                    currency: paymentIntent.currency,
                    created: new Date(paymentIntent.created * 1000)
                };
            });
    }
};
```

#### Comprehensive Error Handling
Services must handle various error scenarios:
```javascript
methods.processTransaction = function (client, transactionData) {
    var paymentClient = clients[client].paymentProcessor;
    
    return paymentClient.processTransaction(transactionData)
        .catch(function (error) {
            // Handle specific payment processor errors
            if (error.type === 'StripeCardError') {
                throw new Error('Card was declined: ' + error.message);
            }
            if (error.type === 'StripeRateLimitError') {
                throw new Error('Rate limit exceeded. Please try again later.');
            }
            if (error.type === 'StripeInvalidRequestError') {
                throw new Error('Invalid payment request: ' + error.message);
            }
            if (error.type === 'StripeAPIError') {
                throw new Error('Payment service temporarily unavailable');
            }
            if (error.type === 'StripeConnectionError') {
                throw new Error('Network error. Please check your connection.');
            }
            if (error.type === 'StripeAuthenticationError') {
                throw new Error('Payment authentication failed');
            }
            
            // Generic error handler
            throw new Error('Payment processing failed: ' + error.message);
        });
};
```

## External Service Integrations

### Payment Processing Services

#### Stripe Integration
```javascript
var stripe = require('stripe');

// https://stripe.com/docs/api/payment_intents
// Rate Limits: 100 requests per second in live mode, 25/sec in test mode
// Token Limits: Payment intents expire after 24 hours
// Cost: 2.9% + 30¢ for card transactions
// Currency Support: 135+ currencies
// Special Considerations:
// - Always use cents for calculations to avoid floating point errors
// - Card data should never be stored on servers (PCI compliance)
// - Use Stripe's test environment for development
// - Payment confirmation is asynchronous via webhooks
// Corner Cases:
// - Declined cards return specific error codes in last_payment_error
// - 3D Secure authentication may require additional customer action
// - Expired payment methods require customer to re-authenticate
// - Network timeouts may leave payments in processing state

var clients = {};

var methods = {
    processPayment: function (client, amount, currency, paymentMethod) {
        var stripeClient = clients[client].stripe;
        
        // Validate currency support
        var supportedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud'];
        if (!supportedCurrencies.includes(currency.toLowerCase())) {
            throw new Error('Unsupported currency: ' + currency);
        }
        
        // Create payment intent with comprehensive metadata
        return stripeClient.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency: currency.toLowerCase(),
            payment_method_types: ['card'],
            payment_method_data: {
                type: 'card',
                card: {
                    number: paymentMethod.cardNumber,
                    exp_month: parseInt(paymentMethod.expiryMonth),
                    exp_year: parseInt(paymentMethod.expiryYear),
                    cvc: paymentMethod.cvv
                },
                billing_details: {
                    name: paymentMethod.cardHolderName,
                    email: paymentMethod.email
                }
            },
            confirm: true,
            return_url: process.env.PAYMENT_RETURN_URL,
            metadata: {
                client_id: client,
                processing_time: new Date().toISOString(),
                api_version: '2023-10-16'
            }
        });
    }
};

module.exports.stripePaymentService = service('stripePaymentService', 
    function doReq(request, callback) {
        // Request handling implementation
    }, 
    function doAuth(request, callback) {
        var time = new Date().getTime();
        clients[time] = {
            time,
            stripe: stripe(process.env.STRIPE_SECRET_KEY),
            metadata: {
                environment: process.env.NODE_ENV,
                version: process.env.STRIPE_API_VERSION
            }
        };
        callback(time + '');
    }
);
```

#### Email Service Integration
```javascript
var nodemailer = require('nodemailer');

// https://nodemailer.com/about/
// Email Service Limitations:
// - Gmail: 500 emails per day for free accounts, 2000 for GSuite
// - SMTP rate limits vary by provider (typically 100-300 per hour)
// - Some providers block suspicious activity automatically
// - HTML emails may be filtered as spam by recipient servers
// Special Considerations:
// - Use app passwords for Gmail (not account password)
// - Verify sender domain for better deliverability
// - Include text version for HTML emails to improve delivery rates
// - Monitor bounce rates and spam complaints
// Corner Cases:
// - Network timeouts may cause delivery delays
// - Invalid email addresses will bounce immediately
// - Large attachments increase spam probability
// - Long subject lines may be truncated by email clients

var methods = {
    sendTransactionalEmail: function (client, emailData) {
        var transporter = clients[client].transporter;
        
        // Validate email data comprehensively
        if (!emailData.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailData.to)) {
            throw new Error('Invalid recipient email address');
        }
        
        if (!emailData.subject || emailData.subject.length > 998) {
            throw new Error('Invalid email subject (max 998 characters)');
        }
        
        if (!emailData.html && !emailData.text) {
            throw new Error('Email must contain either HTML or text content');
        }
        
        var mailOptions = {
            from: `"${process.env.APP_NAME}" <${process.env.EMAIL_FROM}>`,
            to: emailData.to,
            subject: emailData.subject,
            text: emailData.text,
            html: emailData.html,
            messageId: emailData.messageId || generateMessageId(),
            headers: {
                'X-Application': 'BeamJS-App',
                'X-Environment': process.env.NODE_ENV,
                'X-Timestamp': new Date().toISOString()
            }
        };
        
        // Add attachments if provided
        if (emailData.attachments && Array.isArray(emailData.attachments)) {
            mailOptions.attachments = emailData.attachments.map(function (attachment) {
                return {
                    filename: attachment.filename,
                    content: attachment.content,
                    contentType: attachment.contentType || 'application/octet-stream'
                };
            });
        }
        
        return transporter.sendMail(mailOptions).then(function (info) {
            return {
                success: true,
                messageId: info.messageId,
                response: info.response,
                envelope: info.envelope
            };
        });
    },

    verifyEmailAddress: function (client, emailAddress) {
        // Implement email verification logic
        var transporter = clients[client].transporter;
        
        return transporter.verify().then(function (success) {
            if (success) {
                return {
                    valid: true,
                    address: emailAddress,
                    verified: new Date().toISOString()
                };
            } else {
                throw new Error('Email service verification failed');
            }
        });
    }
};
```

### File and Storage Services

#### Cloud Storage Integration
```javascript
var AWS = require('aws-sdk');

// https://docs.aws.amazon.com/s3/
// Storage Limitations:
// - Single object size: 5 TB maximum
// - Bucket name must be globally unique
// - PUT requests: 3,500 per second per prefix
// - GET requests: 5,500 per second per prefix
// Special Considerations:
// - Use multipart upload for files > 100MB
// - Enable versioning for critical data
// - Set appropriate lifecycle policies
// - Configure CORS for web uploads
// Corner Cases:
// - Eventually consistent reads in some regions
// - Bucket names cannot contain uppercase letters
// - Very large files may timeout without multipart upload
// - Cross-region replication has slight delays

var methods = {
    uploadFile: function (client, fileData, options = {}) {
        var s3Client = clients[client].s3;
        
        // Validate file data
        if (!fileData.buffer || !Buffer.isBuffer(fileData.buffer)) {
            throw new Error('Invalid file buffer');
        }
        
        if (fileData.buffer.length > 5 * 1024 * 1024 * 1024) {
            throw new Error('File size exceeds 5GB limit');
        }
        
        var key = options.key || `uploads/${Date.now()}-${fileData.originalName}`;
        var bucket = options.bucket || process.env.AWS_S3_BUCKET;
        
        var uploadParams = {
            Bucket: bucket,
            Key: key,
            Body: fileData.buffer,
            ContentType: fileData.mimeType || 'application/octet-stream',
            ContentLength: fileData.buffer.length,
            Metadata: {
                'original-name': fileData.originalName,
                'upload-timestamp': new Date().toISOString(),
                'client-id': client
            }
        };
        
        // Add server-side encryption
        if (options.encrypted !== false) {
            uploadParams.ServerSideEncryption = 'AES256';
        }
        
        // Use multipart upload for large files
        if (fileData.buffer.length > 100 * 1024 * 1024) {
            return s3Client.upload(uploadParams).promise();
        } else {
            return s3Client.putObject(uploadParams).promise();
        }
    },

    generatePresignedUrl: function (client, key, operation = 'getObject', expires = 3600) {
        var s3Client = clients[client].s3;
        
        var params = {
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
            Expires: Math.min(expires, 86400)  // Max 24 hours
        };
        
        return Promise.resolve({
            url: s3Client.getSignedUrl(operation, params),
            expires: new Date(Date.now() + (expires * 1000))
        });
    }
};
```

## Service Security and Best Practices

### API Key Management
```javascript
// Secure credential handling
function doAuth(request, callback) {
    // Validate API key from environment variables only
    var apiKey = process.env.EXTERNAL_SERVICE_API_KEY;
    if (!apiKey) {
        return callback(null, new Error('Service API key not configured'));
    }
    
    // Create authenticated client with credentials
    var time = new Date().getTime();
    clients[time] = {
        time,
        apiKey: apiKey,
        client: createSecureClient(apiKey),
        rateLimiter: new RateLimiter({
            requests: 100,
            per: 60000  // 100 requests per minute
        })
    };
    
    callback(time + '');
}
```

### Rate Limiting and Retry Logic
```javascript
var methods = {
    apiCall: function (client, endpoint, data) {
        var clientData = clients[client];
        
        // Check rate limit before making request
        if (!clientData.rateLimiter.tryRemoveTokens(1)) {
            throw new Error('Rate limit exceeded. Please try again later.');
        }
        
        return makeRequestWithRetry(clientData.client, endpoint, data, {
            maxRetries: 3,
            retryDelay: 1000,
            backoffFactor: 2
        });
    }
};

function makeRequestWithRetry(client, endpoint, data, options) {
    var attempt = 0;
    
    function tryRequest() {
        return client.request(endpoint, data).catch(function (error) {
            attempt++;
            
            // Retry on specific error types
            if (attempt < options.maxRetries && isRetryableError(error)) {
                var delay = options.retryDelay * Math.pow(options.backoffFactor, attempt - 1);
                return new Promise(function (resolve) {
                    setTimeout(resolve, delay);
                }).then(tryRequest);
            }
            
            throw error;
        });
    }
    
    return tryRequest();
}
```

### Response Validation and Sanitization
```javascript
function validateAndSanitizeResponse(response, schema) {
    // Remove sensitive fields
    var sanitized = JSON.parse(JSON.stringify(response));
    delete sanitized.internal_id;
    delete sanitized.api_key;
    delete sanitized.debug_info;
    
    // Validate response structure
    if (schema) {
        var errors = validateSchema(sanitized, schema);
        if (errors.length > 0) {
            throw new Error('Invalid response format: ' + errors.join(', '));
        }
    }
    
    // Sanitize string fields
    function sanitizeStrings(obj) {
        if (typeof obj === 'string') {
            return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitizeStrings);
        }
        if (obj && typeof obj === 'object') {
            var sanitizedObj = {};
            Object.keys(obj).forEach(function (key) {
                sanitizedObj[key] = sanitizeStrings(obj[key]);
            });
            return sanitizedObj;
        }
        return obj;
    }
    
    return sanitizeStrings(sanitized);
}
```

## Service Usage in Behaviors

### Service Integration Pattern
```javascript
// In behavior implementation
var {
    externalService: ExternalService
} = require('../../../services/external/service');

let serviceClient;

// Authenticate with service
.service(function () {
    var ExternalService_ENDPOINT = new ExternalService();
    return new ExternalService_ENDPOINT();
}).authenticate([
    new ServiceParameter({
        key: 'client',
        value: serviceClient,
        type: DATA
    }),
    new ServiceParameter({
        key: 'apiKey',
        value: process.env.EXTERNAL_API_KEY,
        type: DATA
    })
]).then(function (clientId, er) {
    if (er) {
        error = er;
        return;
    }
    serviceClient = clientId;
})

// Make service request
.next().if(function () {
    return !error && serviceClient;
}).service(function () {
    var ExternalService_ENDPOINT = new ExternalService();
    return new ExternalService_ENDPOINT();
}).request(() => [
    new ServiceParameter({
        key: 'client',
        value: serviceClient,
        type: DATA
    }),
    new ServiceParameter({
        key: 'data',
        value: requestData,
        type: DATA
    }),
    new ServiceParameter({
        key: 'method',
        value: 'processRequest',
        type: OPTION
    })
]).then(function (result, er) {
    if (er) {
        error = er;
        return;
    }
    // Process service result
})
```

### Error Handling in Service Integration
```javascript
.then(function (result, er) {
    if (er) {
        // Handle different types of service errors
        if (er.message.includes('Rate limit exceeded')) {
            error = new Error('Service temporarily unavailable. Please try again later.');
            error.code = 429;
        } else if (er.message.includes('Authentication failed')) {
            error = new Error('Service authentication failed');
            error.code = 401;
        } else if (er.message.includes('Invalid request')) {
            error = new Error('Invalid request parameters');
            error.code = 400;
        } else {
            error = new Error('External service error: ' + er.message);
            error.code = 500;
        }
        return;
    }
    
    // Validate and process successful response
    if (result && result.success) {
        serviceResponse = result;
    } else {
        error = new Error('Service returned invalid response');
        error.code = 500;
    }
})
```

---

### Next Steps

Continue reading the documentation:

- **[Getting Started](../installation/installation.md)**
  - [Installation](../installation/installation.md)
  - [Starter](../installation/starter.md)
  - [Architecture](../architecture.md)
  - [Behaviors](../behaviors.md)
- **[Usage](./backend.md)**
  - [Backend](./backend.md)
  - [Model](./model.md)
  - [Entity](./entity.md)
  - [Query](./query.md)
  - [Service](./service.md)
  - [Data](./data.md)
  - [Behavior](./behavior.md)