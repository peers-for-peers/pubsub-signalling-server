const EventEmitter = require('events')
const WebSocket = require('isomorphic-ws')
const util = require('util')

const MessageType = {
  ACK: 'ACK',
  ERROR: 'ERROR',
  GET_TOPIC_INFO_REQ: 'GET_TOPIC_INFO_REQ',
  GET_TOPIC_INFO_RSP: 'GET_TOPIC_INFO_RSP',
  RELAY: 'RELAY',
  SIGN_IN: 'SIGN_IN',
  SUBSCRIBE: 'SUBSCRIBE'
}

const messageTypeToFormatter = {
  [MessageType.ACK]: (ackMsgId) => ({
    'ackMsgId': ackMsgId
  }),
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

/********/
/* BASE */
/********/

class MessageHandler extends EventEmitter {
  constructor () {
    super()

    this.MESSAGE_HANDLER_PREFIX = '_MESSAGE_HANDLER_'

    this._lastMsgId = 1
    this._msgIdGen = () => this._lastMsgId++

    this._msgIdToCb = {}

    // NOTE that ACKs are supported by default
    this._supportedMessageTypes = new Set([MessageType.ACK])
  }

  _registerHandler (type, handler) {
    this._supportedMessageTypes.add(type)
    this.on(this.MESSAGE_HANDLER_PREFIX + type, handler)
  }

  _handleMessage (msg, cb, ...context) {
    if (!this._supportedMessageTypes.has(msg.type)) {
      cb(util.format('The message type `%s` is not supported', msg.type))
      return
    }

    // TODO should this be handled somewhere else?...
    if (msg.type === MessageType.ACK) {
      if (this._msgIdToCb[msg.payload.ackMsgId]) {
        this._msgIdToCb[msg.payload.ackMsgId]()
        delete this._msgIdToCb[msg.payload.ackMsgId]
      }

      return
    }

    this.emit(this.MESSAGE_HANDLER_PREFIX + msg.type, ...context)
  }

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
  sendMessage (ws, type, cb, ...args) {
    const msgId = this._msgIdGen()
    const data = JSON.stringify({
      'msgId': msgId,
      'type': type,
      'payload': formatPayload(type, args)
    })

    // Register the callback and wait for the ACK
    if (cb) this._msgIdToCb[msgId] = cb

    // If the websocket is not open, queue the message
    if (ws.readyState !== WebSocket.OPEN) {
      // Chain calls to the onopen handler
      const old = ws.onopen
      ws.onopen = () => {
        if (old) old()
        ws.send(data)
      }
    } else {
      ws.send(data)
    }
  }
}

/***********/
/* EXPORTS */
/***********/

module.exports.MessageHandler = MessageHandler
module.exports.MessageType = MessageType
