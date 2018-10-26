import socketio from 'socket.io'
import SocketRedis from 'socket.io-redis'

const MediaServer = require("medooze-media-server")

const SemanticSDP	= require('semantic-sdp')

const SDPInfo		= SemanticSDP.SDPInfo
const MediaInfo		= SemanticSDP.MediaInfo
const CandidateInfo	= SemanticSDP.CandidateInfo
const DTLSInfo		= SemanticSDP.DTLSInfo
const ICEInfo		= SemanticSDP.ICEInfo
const StreamInfo	= SemanticSDP.StreamInfo
const TrackInfo		= SemanticSDP.TrackInfo
const Direction		= SemanticSDP.Direction
const CodecInfo		= SemanticSDP.CodecInfo


declare module 'socket.io-redis' {
    interface RedisAdapter {
        customHook?: (data:any, cb:Function) => void
    }
}

import config from './config'

const endpoint = MediaServer.createEndpoint(config.endpoint)

const incomingStreams = new Map<string, any>()

const socketioServer = socketio({
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket'] 
})

const adapter = SocketRedis({ host: 'localhost', port: 6379 })

socketioServer.adapter(adapter)

adapter.customHook = (data: any, cb:Function) => {

    console.log('customHook', data)

    const streamId = data.streamId

    if (!incomingStreams.get(streamId)) {
        cb('')
        return
    }

    // now we have the stream 

    const incomingStream = incomingStreams.get(streamId)
    const sdp = SDPInfo.process(data.sdp)

    const transport = endpoint.createTransport(sdp)

    transport.setRemoteProperties(sdp)

    const answer = sdp.answer({
        dtls		: transport.getLocalDTLSInfo(),
        ice		: transport.getLocalICEInfo(),
        candidates	: endpoint.getLocalCandidates(),
        capabilities	: config.capabilities
    })
    
    transport.setLocalProperties(answer)

    const outgoingStream = transport.publish(incomingStream)

    answer.addStream(outgoingStream.getStreamInfo())

    cb({
        streamId:streamId,
        sdp: answer.toString()
    })

    console.dir('customHook', answer.plain())
}

socketioServer.on('connection', async (socket: SocketIO.Socket) => {

    socket.on('publish', async (data:any, callback:Function) => {

        const sdp = SDPInfo.process(data.sdp)
        const streamId = data.streamId

        const transport = endpoint.createTransport(sdp)

        transport.setRemoteProperties(sdp)

        const answer = sdp.answer({
            dtls		: transport.getLocalDTLSInfo(),
            ice		: transport.getLocalICEInfo(),
            candidates	: endpoint.getLocalCandidates(),
            capabilities	: config.capabilities
        })

        transport.setLocalProperties(answer)

        const offerStream = sdp.getStream(streamId)

        const incomingStream = transport.createIncomingStream(offerStream)

        incomingStreams.set(incomingStream.getId(), incomingStream)

        incomingStream.on('stopped', () => {
            incomingStreams.delete(incomingStream.getId())
        })

        socket.on('disconnect', async () => {
            transport.stop()
        })

        callback({streamId:streamId, sdp: answer.toString()})
    })

    // this is a relay  
    socket.on('watch', async (data:any, callback?:Function) => {

        // streamId 
        const streamId = data.streamId
        const sdp = data.sdp

        const offer = SDPInfo.process()
        const transport = endpoint.createTransport(offer)
        transport.setRemoteProperties(offer)

        const answer = offer.answer({
            dtls		: transport.getLocalDTLSInfo(),
            ice		: transport.getLocalICEInfo(),
            candidates	: endpoint.getLocalCandidates(),
            capabilities	:  config.capabilities
        })

        transport.setLocalProperties(answer)

        const outgoingStream  = transport.createOutgoingStream({
            audio: true,
            video: true
        })

        //Set RTP local  properties
        transport.setLocalProperties(answer);

        let incomingStream

        // if localstream 
        if (incomingStreams.get(streamId)) {
            incomingStream = incomingStreams.get(streamId)
        } else {
            // we need remote stream 
            const remoteOffer = endpoint.createOffer(config.capabilities)

            adapter.customRequest({
                streamId: streamId,
                sdp : remoteOffer.toString()
            }, (err:any, replies: any[]) => {

                console.log(replies)

                for (let reply of replies) {

                    if (reply && reply.streamId === streamId) {
                        const remoteAnswer = SDPInfo.expand(reply.sdp)
                        const remoteTransport = endpoint.createTransport(remoteAnswer, remoteOffer, {disableSTUNKeepAlive: true})
                        remoteTransport.setLocalProperties(remoteOffer)
                        remoteTransport.setRemoteProperties(remoteAnswer)
                        const remoteIncomingStreamInfo = remoteAnswer.getStream(streamId)
                        incomingStream = remoteTransport.createIncomingStream(remoteIncomingStreamInfo)
                        incomingStreams.set(incomingStream.getId(), incomingStream)

                        incomingStream.on('stopped', () => {
                            incomingStreams.delete(incomingStream.getId())
                        })

                        // todo some clean
                        // if the viewer count is 0  we should clean 
                        // if remoteStream closed, we should closed the stream too 
                    }
                }
            })
        }

        if (incomingStream) {

            outgoingStream.attachTo(incomingStream)
            answer.addStream(outgoingStream.getStreamInfo())

            callback({sdp: answer.toString()})
        } else {

            callback({error: 'can not find the stream'})
        }

    })
 
})

export = socketioServer
