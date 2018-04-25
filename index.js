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

const messageTypeToFormatter = {
  [MessageType.ERROR]: (message) => ({
    'message': message,
  }),
  [MessageType.RELAY]: (from, to, payload) => ({
    'from': from,
    'to': to,
    'payload': payload,
  }),
  [MessageType.SIGN_IN]: (id) => ({ 'id': id }),
  [MessageType.GET_TOPIC_INFO_REQ]: (id) => ({
    'id': id
  }),
  [MessageType.GET_TOPIC_INFO_RSP]: (peers) => ({
    'peers': peers
  }),
}

const formatPayload = (type, args) => messageTypeToFormatter[type](...args)

/**
 * Sends a message on the given websocket channel
 *
 * This will send the message even if the channel is not open yet
 *
 * @param {WebSocket} ws
 * @param {String} type : of `MessageType`
 * @param {Object} payload
 * @param {Function} cb
 */
function sendMessage(ws, type, cb, ...args) {
  const data = JSON.stringify({
    'type': type,
    'payload': formatPayload(type, args),
  })

  // If the websocket is not open, queue the message
  if (ws.readyState != WebSocket.OPEN) {
    ws.once('open', () => {
      ws.send(data)
      if (cb) cb(null)
    })
  } else {
    ws.send(data)
    if (cb) cb(null)
  }
}

/********/
/* BASE */
/********/

class MessageHandler extends EventEmitter {
  constructor() {
    super()

    this.MESSAGE_HANDLER_PREFIX = '_MESSAGE_HANDLER_'
    this._supportedMessageTypes = new Set()
  }

  _registerHandler(type, handler) {
    this._supportedMessageTypes.add(type)
    this.on(this.MESSAGE_HANDLER_PREFIX + type, handler)
  }

  _handleMessage(type, cb, ...context) {
    if (!this._supportedMessageTypes.has(type)) {
      cb(util.format("The message type `%s` is not supported", data.type))
      return
    }

    this.emit(this.MESSAGE_HANDLER_PREFIX + type, ...context)
  }

}

/**********/
/* PUBLIC */
/**********/

class Server extends MessageHandler {
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

    // Register handlers for every message type
    this._registerHandler(MessageType.SIGNAL, this.handleSignal)
    this._registerHandler(MessageType.SIGN_IN, this.handleSignIn)
    this._registerHandler(MessageType.REGISTER_CLIENT_STATUS, this.handleRegisterClientStatus)

    self._wss.on('connection', (ws) => {
      // Triage messages to designated event handlers
      ws.on('message', (data) => {
        data = JSON.parse(data)

        self._handleMessage(
          data.type,
          (err) => { if (err) sendMessage(ws, MessageType.ERROR, null, err) },
          ws,
          data.payload
        )
      })

      // Notify listeners when a client connection is closed
      ws.on('close', () => {
        // The client never logged in
        if (!ws.id) return

        self._notifyListeners(ws.id, ClientStatus.OFFLINE)

        // Clean up client state
        delete self._idToClient[ws.id]
      })
    })
  }

  /***********/
  /* PRIVATE */
  /***********/

  _notifyListeners(id, clientStatus) {
    let self = this

    let listeners = this._clientToListenerIDs[id] || new Set()
    listeners.forEach((l) => {
      // Lazily clean up the id to client mapping
      if (!self._idToClient[l]) listeners.delete(l)

      sendMessage(self._idToClient[l], MessageType.UPDATE_CLIENT_STATUS, null, id, clientStatus)
    })
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
    handleSignIn(ws, payload) {
        let self = this

        if (self._idToClient[payload.id]) {
            sendMessage(ws, MessageType.ERROR, null, util.format('A client is already registered with ID: %s', payload.id))
            return
        }

  // Update data structures
        self._idToClient[payload.id] = ws
        assert(!ws.id)
        ws.id = payload.id

        self._notifyListeners(ws.id, ClientStatus.ONLINE)
    }

  /**
   * Initiate signaling with another client
   *
   * @param {WebSocket} ws
   * @param {String} clientId
   * @param {Object} payload
   */
    handleSignal(ws, payload) {
        if (!this._idToClient[payload.toId]) {
            this.emit(ws, util.format('Client `%s` is not online', payload.toId))
            return
        }

        sendMessage(this._idToClient[payload.toId], MessageType.SIGNAL, null, payload.fromId, payload.toId, payload.signal)
    }

    handleRegisterClientStatus(ws, payload) {
        if (!this._clientToListenerIDs[payload.toId]) this._clientToListenerIDs[payload.toId] = new Set()

  // Send the clients status if they are online
        if (this._idToClient[payload.id]) {
            sendMessage(ws.id, MessageType.UPDATE_CLIENT_STATUS, null, payload.id, ClientStatus.ONLINE)
        }

        this._clientToListenerIDs[payload.toId].add(payload.fromId)
    }
}

const ClientEvents = {
    ONLINE: 'ONLINE',
    OFFLINE: 'OFFLINE',
    SIGNAL: 'SIGNAL',
}

class Client extends MessageHandler {
  /**
   * @param {String} id - The public key of the client being created
   */
    constructor(id) {
        super()

        let self = this

        self.id = id
        self._ws = new WebSocket('ws://localhost::8080')

  // Register handlers for every message type
        this._registerHandler(
            MessageType.ERROR,
            (payload) => console.log(util.format('SERVER ERROR: %s', payload.message))
        )
        this._registerHandler(
            MessageType.SIGNAL,
            (payload) => self.emit(ClientEvents.SIGNAL, payload.fromId, payload.signal)
        )
        this._registerHandler(
            MessageType.UPDATE_CLIENT_STATUS,
            (payload) => self.emit(
                (payload.status === ClientStatus.ONLINE) ? ClientEvents.ONLINE : ClientEvents.OFFLINE,
                payload.id
            )
        )

  // Triage messages to designated event handlers
        self._ws.on('message', (data) => {
            data = JSON.parse(data)

            self._handleMessage(
                data.type,
                (err) => { if (err) self.emit('error', err) },
                data.payload
            )
        })

    }

    close() {
        this._ws.close()
    }

    signal(toId, signal, cb) {
        sendMessage(this._ws, MessageType.SIGNAL, cb, this.id, toId, signal)
    }

    signIn(cb) {
        sendMessage(this._ws, MessageType.SIGN_IN, cb, this.id)
    }

    registerForUpdates(toId, cb) {
        sendMessage(this._ws, MessageType.REGISTER_CLIENT_STATUS, cb, this.id, toId)
    }
}

  /***********/
  /* EXPORTS */
  /***********/

  module.exports.Server = Server
  module.exports.Client = Client
  module.exports.ClientEvents = ClientEvents
