const EventEmitter = require('events')
const WebSocket = require('isomorphic-ws')
const util = require('util')

const MessageType = {
  ERROR: 'ERROR',
  GET_TOPIC_INFO_REQ: 'GET_TOPIC_INFO_REQ',
  GET_TOPIC_INFO_RSP: 'GET_TOPIC_INFO_RSP',
  RELAY: 'RELAY',
  SIGN_IN: 'SIGN_IN',
  SUBSCRIBE: 'SUBSCRIBE'
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
    'peers': Array.from(peers)
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
    // Chain calls to the onopen handler
    const old = ws.onopen
    ws.onopen = () => {
      if (old) old()
      ws.send(data)
      if (cb) cb(null)
    }
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

/***********/
/* EXPORTS */
/***********/

module.exports.MessageHandler = MessageHandler
module.exports.MessageType = MessageType
module.exports.sendMessage = sendMessage
