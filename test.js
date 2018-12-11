var _ = require('underscore')
var fs = require('fs')
// var Paho = require('./mqttws31.js')

var content = fs.readFileSync('test.json')
var topics = JSON.parse(content)
var topicPrefix = 'zwave'

function getTopicFromTitle (devName) {
  return String(devName).replace(/[()]/g, '').toLowerCase().split(/[\s.]/).join('-')
}

_.each(topics, function (device) {
  var topicBody = getTopicFromTitle(device.name)

  // Topics to listen
  if (device.mode === 'in' || device.mode === 'rw') {
    device['subTopic'] = topicPrefix + '/' + device.type + '/' + topicBody + '/set'
  }

  // Topics to publish
  if (device.mode === 'ro' || device.mode === 'rw') {
    device['pubTopic'] = topicPrefix + '/' + device.type + '/' + topicBody
  }
})

// var mqttServer = '192.168.1.51'
// var clientId = 'yamb-' + Math.random().toString(36).substr(2, 10)
// var mqttClient = new Paho.Client(mqttServer, Number(9001), '/', clientId)

// console.log(JSON.stringify(Paho))

// mqttClient.onConnectionLost = function onConnectionLost (message) {
//   console.log('[YAMB] MQTT disconnected', message.errorCode, message.errorMessage)
//   setTimeout(doConnect, 3000)
// }

// function doConnect () {
//   console.log('[YAMB] MQTT connecting to server', mqttServer)
//   if (mqttClient && mqttClient.isConnected()) {
//     return
//   }
//   mqttClient.connect({
//     invocationContext: { foo: 'bar' },
//     onSuccess: function onConnect (invocationContext) {
//       console.log('[YAMB] MQTT connected')
//       _.each(_.sample(topics, 10), function (device) {
//         if (!_.isUndefined(device.pubTopic)) {
//           console.log('publish to ', device.pubTopic, 'value', device.lastLevel)
//           mqttClient.send(device.pubTopic, String(device.lastLevel), 0, false)
//         }
//       })
//     },
//     onFailure: function onFailure (message) {
//       console.log('[YAMB] MQTT connection failed', message.errorCode, message.errorMessage)
//       // TODO: Make it increasing
//       setTimeout(doConnect, 2000)
//     }
//   })
// }

// doConnect()
