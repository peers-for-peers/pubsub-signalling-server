/* eslint-env mocha, browser */

const Client = require('./src/').Client
const ClientEvents = require('./src/').ClientEvents
const Server = require('./src/').Server

const assert = require('assert')

const server = Server() // eslint-disable-line

describe('basic', function () {
  this.timeout(3000)

  it('topic-info.simple', function (done) {
    const TOPIC = 'foo'
    const CLIENT_ID = 1

    let client = Client(CLIENT_ID)

    client.on(ClientEvents.TOPIC_INFO, (topic, peers) => {
      assert.eq(topic, TOPIC)
      assert.eq(peers, [client.id])

      done()
    })

    client.signIn()
    client.subscribe(TOPIC)
    client.getTopicInfo(TOPIC, null)
  })
})
