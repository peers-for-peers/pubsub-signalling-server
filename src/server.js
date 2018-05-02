const WebSocket = require('isomorphic-ws')
const assert = require('assert')
const util = require('util')

const MessageHandler = require('./base').MessageHandler
const MessageType = require('./base').MessageType
const sendMessage = require('./base').sendMessage

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
    this._registerHandler(MessageType.RELAY, this._handleRelay)
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

        // Clean up the client from subscribed topics
        if (self._idToTopics[ws.id]) {
          self._idToTopics[ws.id].forEach((topic) => self._topicsToIds[topic].remove(ws.id))
          delete self._idToTopics[ws.id]
        }
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
    if (!this._topicsToIds[payload.topic]) {
      this._topicsToIds[payload.topic] = new Set()
    }

    this._topicsToIds[payload.topic].add(payload.id)
  }
}

/***********/
/* EXPORTS */
/***********/

module.exports.Server = Server
