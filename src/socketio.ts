import socketio from 'socket.io'

import redis, { RedisAdapter } from 'socket.io-redis'


const MediaServer = require("medooze-media-server")

const SemanticSDP = require('semantic-sdp')

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
import incomingStreams from './streams'

// MediaServer.enableDebug(true)
// MediaServer.enableUltraDebug(true)




const socketioServer = socketio({
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket'] 
})


socketioServer.adapter(redis({ host: 'localhost', port: 6379 }))


const redisAdapter = socketioServer.of('/').adapter as RedisAdapter


redisAdapter.customHook = (data:any, cb:Function) => {

    const streamId = data.streamId
    const sdp = data.sdp

    if (!incomingStreams.get(streamId)) {
        cb({error: 'does not exist'})
        return
    }

    // now we have the stream 
    const incomingStream = incomingStreams.get(streamId)
    const offer = SDPInfo.process(sdp)

    const endpoint = MediaServer.createEndpoint(config.endpoint)
    const transport = endpoint.createTransport(offer)

    transport.setRemoteProperties(offer)

    const answer = offer.answer({
        dtls		: transport.getLocalDTLSInfo(),
        ice		    : transport.getLocalICEInfo(),
        candidates	: endpoint.getLocalCandidates(),
        capabilities: config.capabilities
    })
    
    transport.setLocalProperties(answer)

    const outgoingStream = transport.createOutgoingStream(incomingStream.getStreamInfo())

    outgoingStream.attachTo(incomingStream)

    answer.addStream(outgoingStream.getStreamInfo())

    cb({
        streamId: streamId,
        streamId2: outgoingStream.getId(),
        sdp: answer.toString()
    })
}


socketioServer.on('connection', async (socket: SocketIO.Socket) => {


    const endpoint = MediaServer.createEndpoint(config.endpoint)

    
    socket.on('publish', async (data:any, callback:Function) => {

        const sdp = SDPInfo.process(data.sdp)
        const streamId = data.streamId

        const transport = endpoint.createTransport(sdp)

        transport.setRemoteProperties(sdp)

        const answer = sdp.answer({
            dtls    : transport.getLocalDTLSInfo(),
            ice		: transport.getLocalICEInfo(),
            candidates: endpoint.getLocalCandidates(),
            capabilities: config.capabilities
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

        // const outgoingStream  = transport.createOutgoingStream({
        //     audio: true,
        //     video: true
        // })

        // outgoingStream.attachTo(incomingStream)

        // answer.addStream(outgoingStream.getStreamInfo())

        callback({streamId:streamId, sdp: answer.toString()})
    })

    // this is a relay  
    socket.on('watch', async (data:any, callback?:Function) => {

        // streamId 
        const streamId = data.streamId
        const sdp = data.sdp

        const offer = SDPInfo.process(sdp)
        const transport = endpoint.createTransport(offer)
        transport.setRemoteProperties(offer)

        const answer = offer.answer({
            dtls        : transport.getLocalDTLSInfo(),
            ice		    : transport.getLocalICEInfo(),
            candidates	: endpoint.getLocalCandidates(),
            capabilities:  config.capabilities
        })

        transport.setLocalProperties(answer)

        let incomingStream

        // if localstream 
        if (incomingStreams.get(streamId)) {
            incomingStream = incomingStreams.get(streamId)

            const outgoingStream = transport.publish(incomingStream)
            answer.addStream(outgoingStream.getStreamInfo())
            callback({sdp: answer.toString()})

        } else {
            // we need remote stream 
            const remoteOffer = endpoint.createOffer(config.capabilities)

            const adapter = socketioServer.of('/').adapter as RedisAdapter

            adapter.customRequest({
                streamId: streamId,
                sdp : remoteOffer.toString()
            }, (err:any, replies: any[]) => {

                console.log(replies)
                console.log('customRequest',err, replies)


                for (let reply of replies) {
                    if (reply && reply.streamId === streamId) {

                        
                        const remoteAnswer = SDPInfo.process(reply.sdp)

                        const remoteTransport = endpoint.createTransport(remoteAnswer, remoteOffer, {disableSTUNKeepAlive: true})
                        remoteTransport.setLocalProperties(remoteOffer)
                        remoteTransport.setRemoteProperties(remoteAnswer)
                        const remoteIncomingStreamInfo = remoteAnswer.getStream(reply.streamId)

                        console.log(streamId)
                        console.dir(remoteAnswer.getStreams())

                        console.dir(remoteIncomingStreamInfo)

                        incomingStream = remoteTransport.createIncomingStream(remoteIncomingStreamInfo)
                        incomingStreams.set(incomingStream.getId(), incomingStream)

                        console.dir(incomingStream)

                        incomingStream.on('stopped', () => {
                            incomingStreams.delete(incomingStream.getId())
                        })



                        if (incomingStream) {
                            const outgoingStream = transport.publish(incomingStream)
                            answer.addStream(outgoingStream.getStreamInfo())
                            console.dir(answer)
                            callback({sdp: answer.toString()})
                        } else {
                
                            callback({error: 'can not find the stream'})
                        }

                        // todo some clean
                        // if the viewer count is 0  we should clean 
                        // if remoteStream closed, we should closed the stream too 
                    }
                }
            })
        }



    })
 
})

export = socketioServer
