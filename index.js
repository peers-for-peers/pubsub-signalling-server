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

        // TODO : don't store these in memory...
        this._idToClient = {}
        this._clientToListenerIDs = {}

        // Initialize websocket server
        this._wss = new WebSocket.Server({
            clientTracking: true,
            port: 8080,
        })

        const MESSAGE_HANDLER_PREFIX = 'MESSAGE_HANDLER_'

        this._supportedMessageTypes = new Set()
        this._registerHandler = (type, handler) => { 
            self._supportedMessageTypes.add(type)
            self.on(MESSAGE_HANDLER_PREFIX + type, handler) 
        }

        // Register handlers for every message type
        this._registerHandler(MessageType.SIGNAL, this.handleSignal)
        this._registerHandler(MessageType.SIGN_IN, this.handleSignIn)
        this._registerHandler(MessageType.REGISTER_CLIENT_STATUS, this.handleRegisterClientStatus)

        self._wss.on('connection', (ws) => {
            // Triage messages to designated event handlers
            ws.on('message', (data) => {
                data = JSON.parse(data)

                if (!self._supportedMessageTypes.has(data.type)) {
                    self._sendError(ws, util.format("The message type `%s` is not supported", data.type))
                    return
                }

                self.emit(MESSAGE_HANDLER_PREFIX + data.type, ws, data.id, data.payload)
            })

            // Notify listeners when a client connection is closed
            ws.on('close', () => {
                // The client never logged in
                if (!ws.id) return

                (self._clientToListenerIDs[ws.id] || new Set()).forEach((l) => {
                    this._idToClient[l].send(JSON.stringify({
                        'type': MessageType.UPDATE_CLIENT_STATUS,
                        'payload': {
                            'id': ws.id,
                            'status': ClientStatus.OFFLINE,
                        }
                    }))
                })
            })
        })
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

        let listeners = self._clientToListenerIDs[payload.id] || new Set()
        listeners.forEach((l) => {
            self._idToClient[l].send(JSON.stringify({
                'type': MessageType.UPDATE_CLIENT_STATUS,
                'payload': {
                    'id': payload.id,
                    'status': ClientStatus.ONLINE
                }
            }))
        })
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
        if (!this._clientToListenerIDs[payload.toId]) this._clientToListenerIDs[payload.toId] = new Set()

        // TODO : send the clients status if they are online

        this._clientToListenerIDs[payload.toId].add(payload.fromId)
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
