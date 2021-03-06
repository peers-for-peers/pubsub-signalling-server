const WebSocket = require('isomorphic-ws')
const util = require('util')

const MessageHandler = require('./base.js').MessageHandler
const MessageType = require('./base.js').MessageType

/**********/
/* PUBLIC */
/**********/

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

    self.id = id.toString()
    self._ws = new WebSocket('ws://localhost:8080')

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
      (payload) => self.emit(ClientEvents.TOPIC_INFO, payload.topic, new Set(payload.peers))
    )
    this._registerHandler(
      MessageType.RELAY,
      (payload) => self.emit(ClientEvents.RELAY, payload.from, payload.relay)
    )

    // Triage messages to designated event handlers
    self._ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      self._handleMessage(
        data,
        (err) => { if (err) self.emit(ClientEvents.ERROR, err) },
        data.payload
      )
    }
  }

  close () {
    this._ws.close()
  }

  /**********************/
  /* CORE FUNCTIONALITY */
  /**********************/

  getTopicInfo (topic, cb) {
    this.sendMessage(this._ws, MessageType.GET_TOPIC_INFO_REQ, cb, topic)
  }

  relay (to, relay, cb) {
    this.sendMessage(this._ws, MessageType.RELAY, cb, this.id, to, relay)
  }

  signIn (cb) {
    this.sendMessage(this._ws, MessageType.SIGN_IN, cb, this.id)
  }

  subscribe (topic, cb) {
    this.sendMessage(this._ws, MessageType.SUBSCRIBE, cb, this.id, topic)
  }
}

/***********/
/* EXPORTS */
/***********/

module.exports.Client = Client
module.exports.ClientEvents = ClientEvents
