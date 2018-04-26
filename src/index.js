const EventEmitter = require('events')
const WebSocket = require('ws')

const util = require('util')
const assert = require('assert')

/***********/
/* PRIVATE */
/***********/

const MessageType = {
  ERROR: 'ERROR',
  GET_TOPIC_INFO_REQ: 'GET_TOPIC_INFO_REQ',
  GET_TOPIC_INFO_RSP: 'GET_TOPIC_INFO_REQ',
  RELAY: 'RELAY',
  SIGN_IN: 'SIGN_IN',
  SUBSCRIBE: 'SIGN_IN'
}

const messageTypeToFormatter = {
  [MessageType.ERROR]: (message) => ({
    'message': message
  }),
  [MessageType.GET_TOPIC_INFO_REQ]: (topic) => ({
    'topic': topic
  }),
  [MessageType.GET_TOPIC_INFO_RSP]: (topic, peers) => ({
    'topic': topic,
    'peers': peers
  }),
  [MessageType.RELAY]: (from, to, relay) => ({
    'from': from,
    'to': to,
    'relay': relay
  }),
  [MessageType.SIGN_IN]: (id) => ({ 'id': id }),
  [MessageType.SUBSCRIBE]: (id, topic) => ({
    'id': id,
    'topic': topic
  })
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
function sendMessage (ws, type, cb, ...args) {
  const data = JSON.stringify({
    'type': type,
    'payload': formatPayload(type, args)
  })

  // If the websocket is not open, queue the message
  if (ws.readyState !== WebSocket.OPEN) {
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
  constructor () {
    super()

    this.MESSAGE_HANDLER_PREFIX = '_MESSAGE_HANDLER_'
    this._supportedMessageTypes = new Set()
  }

  _registerHandler (type, handler) {
    this._supportedMessageTypes.add(type)
    this.on(this.MESSAGE_HANDLER_PREFIX + type, handler)
  }

  _handleMessage (type, cb, ...context) {
    if (!this._supportedMessageTypes.has(type)) {
      cb(util.format('The message type `%s` is not supported', type))
      return
    }

    this.emit(this.MESSAGE_HANDLER_PREFIX + type, ...context)
  }
}

/**********/
/* PUBLIC */
/**********/

class Server extends MessageHandler {
  constructor () {
    super()

    let self = this

    // TODO : don't store these in memory...
    this._idToClient = {}
    this._topicsToIds = {}
    // Stores the reverse mapping for garbage collection
    this._idToTopics = {}

    // Initialize websocket server
    this._wss = new WebSocket.Server({
      clientTracking: true,
      port: 8080
    })

    // Register handlers for every message type
    this._registerHandler(MessageType.GET_TOPIC_INFO_REQ, this._handleGetTopicInfoReq)
    this._registerHandler(MessageType.RELAY, this._handleSignal)
    this._registerHandler(MessageType.SIGN_IN, this._handleSignIn)
    this._registerHandler(MessageType.SUBSCRIBE, this._handleSubscribe)

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

      ws.on('close', () => {
        // The client never logged in
        if (!ws.id) return

        // Clean up client state
        delete self._idToClient[ws.id]

        // Clean up the client from subscribed topics
        self._idToTopics.forEach((topic) => self._topicsToIds[topic].remove(ws.id))
        delete self._idToTopics[ws.id]
      })
    })
  }

  /************/
  /* HANDLERS */
  /************/

  _handleGetTopicInfoReq (ws, payload) {
    const ids = this._topicsToIds[payload.topic]

    if (!ids) {
      sendMessage(ws, MessageType.ERROR, null, util.format('Topic `%s` does not exist', payload.topic))
      return
    }

    sendMessage(ws, MessageType.GET_TOPIC_INFO_RSP, null, payload.topic, ids)
  }

  _handleRelay (ws, payload) {
    if (!this._idToClient[payload.toId]) {
      sendMessage(ws, MessageType.ERROR, null, util.format('Client `%s` is not online', payload.toId))
      return
    }

    sendMessage(this._idToClient[payload.toId], MessageType.RELAY, null, payload.fromId, payload.toId, payload.relay)
  }

  _handleSignIn (ws, payload) {
    if (this._idToClient[payload.id]) {
      sendMessage(ws, MessageType.ERROR, null, util.format('A client is already registered with ID: %s', payload.id))
      return
    }

    // Update data structures
    this._idToClient[payload.id] = ws
    assert(!ws.id)
    ws.id = payload.id
  }

  _handleSubscribe (ws, payload) {
    let ids = this._topicsToIds[payload.topic]

    if (!ids) {
      sendMessage(ws, MessageType.ERROR, null, util.format('Topic `%s` does not exist', payload.topic))
      return
    }

    ids.push(payload.id)
  }
}

const ClientEvents = {
  ERROR: 'ERROR',
  RELAY: 'RELAY',
  TOPIC_INFO: 'TOPIC_INFO'
}

class Client extends MessageHandler {
  /**
   * @param {String} id - The public key of the client being created
   */
  constructor (id) {
    super()

    let self = this

    self.id = id
    self._ws = new WebSocket('ws://localhost::8080')

    // Register handlers
    this._registerHandler(
      MessageType.ERROR,
      (payload) => {
        console.log(util.format('SERVER ERROR: %s', payload.message))
        self.emit(ClientEvents.ERROR, payload.message)
      }
    )
    this._registerHandler(
      MessageType.GET_TOPIC_INFO_RSP,
      (payload) => self.emit(ClientEvents.TOPIC_INFO, payload.topic, payload.peers)
    )
    this._registerHandler(
      MessageType.RELAY,
      (payload) => self.emit(ClientEvents.RELAY, payload.fromId, payload.relay)
    )

    // Triage messages to designated event handlers
    self._ws.on('message', (data) => {
      data = JSON.parse(data)

      self._handleMessage(
        data.type,
        (err) => { if (err) self.emit(ClientEvents.ERROR, err) },
        data.payload
      )
    })
  }

  close () {
    this._ws.close()
  }

  /**********************/
  /* CORE FUNCTIONALITY */
  /**********************/

  getTopicInfo (topic, cb) {
    sendMessage(this._ws, MessageType.GET_TOPIC_INFO_REQ, cb, topic)
  }

  relay (toId, relay, cb) {
    sendMessage(this._ws, MessageType.RELAY, cb, this.id, toId, relay)
  }

  signIn (cb) {
    sendMessage(this._ws, MessageType.SIGN_IN, cb, this.id)
  }

  subscribe (topic, cb) {
    sendMessage(this._ws, MessageType.SUBSCRIBE, cb, topic)
  }
}

/***********/
/* EXPORTS */
/***********/

module.exports.Server = Server
module.exports.Client = Client
module.exports.ClientEvents = ClientEvents
