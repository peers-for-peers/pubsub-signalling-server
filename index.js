const EventEmitter = require('events');
const WebSocket = require('ws');

const util = require('util')

/***********/
/* PRIVATE */
/***********/

const MessageType = {
    ERROR: 'ERROR',
    SIGNAL: 'SIGNAL',
    SIGN_UP: 'SIGN_UP',
}

/**********/
/* PUBLIC */
/**********/

class Server extends EventEmitter {
    constructor() {
        super()

        let self = this

        // TODO : don't store this in memory...
        self._idToClient = {};

        // Initialize websocket server
        self._wss = new WebSocket.Server({
            clientTracking: true,
            port: 8080,
        })

        // TODO : update this to broadcast to friends only
        // TODO : make a member function of `Server` of websocket server
        self._wss.broadcast = (data) => {
          self._wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(data);
            }
          })
        }

        // Triage messages to designated event handlers
        self._wss.on('connection', (ws) => {
            ws.on('message', (data) => {
                data = JSON.parse(data)

                if (!Object.keys(MessageType).map((k) => MessageType[k]).includes(data.type)) {
                    self._sendError(ws, util.format("The message type `%s` is not supported", data.type))
                    return
                }

                self.emit(data.type, ws, data.id, data.payload)
            })
        })

        // Register handlers for every message type
        self.on(MessageType.SIGNAL, self.handleSignal);
        self.on(MessageType.SIGN_UP, self.handleSignUp);
    }

    /***********/
    /* PRIVATE */
    /***********/

    _sendError(ws, errorMsg) {
        ws.send(JSON.stringify({
            'type' : MessageType.ERROR,
            'payload' : {
                'message' : errorMsg,
            }
        }))
    }

    /************/
    /* HANDLERS */
    /************/

    /**
     * Initiate signaling with another client
     *
     * @param {WebSocket} ws
     * @param {String} clientId
     * @param {Object} payload
     */
    handleSignal(ws, clientId, payload) {
        if (!this._idToClient[payload.toId]) {
            this._sendError(ws, util.format('Client `%s` is not online', payload.toId))
            return
        }

        this._idToClient[payload.toId].send(JSON.stringify({
            'type': MessageType.SIGNAL,
            'payload' : payload,
        }))
    }

    /**
     * Sign up for the service by registering a newly generated public key
     *
     * @param {WebSocket} ws
     * @param {String} clientId
     * @param {Object} payload
     */
    handleSignUp(ws, _, payload) {
        if (this._idToClient[payload.id]) {
            this._sendError(ws, util.format('A client is already registered with ID: %s', payload.id))
            return
        }

        this._idToClient[payload.id] = ws;
    }

    // TODO : notify clients when new clients have connected
}

class Client extends EventEmitter {
    /**
     * @param {String} id - The public key of the client being created
     */
    constructor(id) {
        super()

        let self = this

        self.id = id

        self._ws = new WebSocket('ws://localhost::8080');

        // Triage messages to designated event handlers
        self._ws.on('message', (data) => {
            data = JSON.parse(data)

            if (!Object.keys(MessageType).map((k) => MessageType[k]).includes(data.type)) {
                self.emit(MessageType.ERROR, util.format('Received an unsupported message type from the server: %s', data.type))
                return
            }

            self.emit(data.type, data.payload)
        })

        self.on(MessageType.ERROR, (payload) => { console.log(util.format('SERVER ERROR: %s', payload.message)) })
        self.on(MessageType.SIGNAL, (payload) => { console.log(util.format('Received signal from `%s`', payload.fromId)) })
    }

    _queueSend(type, payload, cb) {
        let self = this

        const data = JSON.stringify({
            'type': type,
            'id': self.id,
            'payload': payload,
        })

        // If the websocket is not open, queue the message
        if (self._ws.readyState != WebSocket.OPEN) {
            self._ws.once('open', () => {
                self._ws.send(data)
                if (cb) cb(null)
            })
        } else {
            self._ws.send(data)
            if (cb) cb(null)
        }
    }

    signal(toId, cb) {
        this._queueSend(
            MessageType.SIGNAL,
            {
                'fromId': this.id,
                'toId': toId,
            },
            cb
        )
    }

    signUp(cb) {
        this._queueSend(
            MessageType.SIGN_UP,
            { 'id': this.id },
            cb
        )
    }
}

/***********/
/* EXPORTS */
/***********/

module.exports.Server = Server
module.exports.Client = Client
