const EventEmitter = require('events')
const WebSocket = require('ws')

const util = require('util')
const assert = require('assert')

/***********/
/* PRIVATE */
/***********/

const MessageType = {
    ERROR: 'ERROR',
    SIGNAL: 'SIGNAL',
    SIGN_IN: 'SIGN_IN',
    REGISTER_CLIENT_STATUS: 'REGISTER_CLIENT_STATUS',
    UPDATE_CLIENT_STATUS: 'UPDATE_CLIENT_STATUS',
}

const ClientStatus = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
}

/**********/
/* PUBLIC */
/**********/

class Server extends EventEmitter {
    constructor() {
        super()

        let self = this

        // TODO : don't store this in memory...
        self._idToClient = {}
        self._clientsToListeners = {}

        // Initialize websocket server
        self._wss = new WebSocket.Server({
            clientTracking: true,
            port: 8080,
        })

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

            ws.on('close', () => {
                if (!ws.id) return

                (self._clientsToListeners[ws.id] || new Set()).forEach((listener) => {
                    this._idToClient[listener].send(JSON.stringify({
                        'type': MessageType.UPDATE_CLIENT_STATUS,
                        'payload': {
                            'id': ws.id,
                            'status': ClientStatus.OFFLINE,
                        }
                    }))
                })
            })
        })

        // Register handlers for every message type
        self.on(MessageType.SIGNAL, self.handleSignal)
        self.on(MessageType.SIGN_IN, self.handleSignIn)
        self.on(MessageType.REGISTER_CLIENT_STATUS, self.handleRegisterClientStatus)
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
     * Sign in to the service by registering a public key
     *
     * @param {WebSocket} ws
     * @param {String} clientId
     * @param {Object} payload
     */
    handleSignIn(ws, clientId, payload) {
        let self = this

        if (self._idToClient[payload.id]) {
            self._sendError(ws, util.format('A client is already registered with ID: %s', payload.id))
            return
        }

        self._idToClient[payload.id] = ws
        assert(!ws.id)
        ws.id = payload.id

        // TODO : register id for a websocket

        // TODO : make this async
        if (self._clientsToListeners[payload.id]) {
            self._clientsToListeners[payload.id].forEach((listener) => {
                self._idToClient[listener].send(JSON.stringify({
                    'type': MessageType.UPDATE_CLIENT_STATUS,
                    'payload': {
                        'id': payload.id,
                        'status': ClientStatus.ONLINE
                    }
                }))
            })
        }
    }

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

    handleRegisterClientStatus(ws, _, payload) {
        if (!this._clientsToListeners[payload.toId]) this._clientsToListeners[payload.toId] = new Set()

        this._clientsToListeners[payload.toId].add(payload.fromId)
    }
}

class Client extends EventEmitter {
    /**
     * @param {String} id - The public key of the client being created
     */
    constructor(id) {
        super()

        let self = this

        self.id = id

        self._ws = new WebSocket('ws://localhost::8080')

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
        self.on(
            MessageType.UPDATE_CLIENT_STATUS,
            (payload) => { console.log(util.format('UPDATE_CLIENT_STATUS -> %d, %s', payload.id, payload.status)) }
        )
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

    close() {
        this._ws.close()
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

    signIn(cb) {
        this._queueSend(
            MessageType.SIGN_IN,
            { 'id': this.id },
            cb
        )
    }

    registerForClientStatusUpdates(toId, cb) {
        this._queueSend(
            MessageType.REGISTER_CLIENT_STATUS,
            { 
                'fromId': this.id,
                'toId': toId,
            },
            cb
        )
    }
}

/***********/
/* EXPORTS */
/***********/

module.exports.Server = Server
module.exports.Client = Client
module.exports.ClientStatus = ClientStatus
