import socketio from 'socket.io'
import redis, { RedisAdapter } from 'socket.io-redis'

const getPort = require('get-port')

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
import streams from './streams'

MediaServer.enableDebug(true)
MediaServer.enableUltraDebug(true)

const endpoint = MediaServer.createEndpoint(config.endpoint)


const socketioServer = socketio({
    pingInterval: 10000,
    pingTimeout: 5000,
    transports: ['websocket'] 
})


socketioServer.adapter(redis({ host: 'localhost', port: 6379 }))


const redisAdapter = socketioServer.of('/').adapter as RedisAdapter



const getMediaPort = async () =>
{
    let port
    while(true)
    {
        port = await getPort()
        if(port%2 == 0){
            break
        }
    }
    return port
}


redisAdapter.customHook = (data:any, cb:Function) => {

    const streamId = data.streamId
    const sdp = data.sdp

    if (!streams.incomingStreams.get(streamId)) {
        cb({error: 'does not exist'})
        return
    }

    // now we have the stream 
    const incomingStream = streams.incomingStreams.get(streamId)
    const offer = SDPInfo.process(sdp)

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

        const videoMedia = answer.getMedia('video')

        if (videoMedia) {
            videoMedia.setBitrate(500)
        }

        transport.setLocalProperties(answer)

        const offerStream = sdp.getStream(streamId)

        const incomingStream = transport.createIncomingStream(offerStream)

        streams.incomingStreams.set(incomingStream.getId(), incomingStream)

        // add refresher
        const refresher = MediaServer.createRefresher(1000)

        refresher.add(incomingStream)

        const streamer = MediaServer.createStreamer()

        incomingStream.on('stopped', () => {
            streams.incomingStreams.delete(incomingStream.getId())
            refresher.stop()
            streamer.stop()
        })

        socket.on('disconnect', async () => {
            transport.stop()
        })

        incomingStream.streamer = streamer
        console.dir(videoMedia)
        console.dir(videoMedia.getCodec('h264'))
        incomingStream.videoCodec = videoMedia.getCodec('h264')

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

        if (!streams.incomingStreams.get(streamId)) {

            callback({error: 'stream does not exist'})
            return
        }

        const incomingStream = streams.incomingStreams.get(streamId)

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


        const video = new MediaInfo('video','video')

        console.dir(incomingStream.videoCodec)

        video.addCodec(incomingStream.videoCodec)


        console.dir('============')
        console.dir(video)


        const videoPort = await getMediaPort()

        const outgoingVideoSession = incomingStream.streamer.createSession(video, {
	        remote : {
                ip : '127.0.0.1',
                port: videoPort
	        }
        })

        outgoingVideoSession.getOutgoingStreamTrack().attachTo(incomingStream.getVideoTracks()[0])


        const incomingVideoSession = incomingStream.streamer.createSession(video, {
            local : {
                ip : '127.0.0.1',
                port: videoPort
            }
        })

        const outgoingStream = transport.createOutgoingStream({
            video: true,
            audio: false
        })

        outgoingStream.getVideoTracks()[0].attachTo(incomingVideoSession.getIncomingStreamTrack())

        answer.addStream(outgoingStream.getStreamInfo())

        callback({sdp: answer.toString()})



        // let incomingStream
        // if localstream 
        // if (incomingStreams.get(streamId)) {
        //     incomingStream = incomingStreams.get(streamId)

        //     const outgoingStream = transport.publish(incomingStream)
        //     answer.addStream(outgoingStream.getStreamInfo())
        //     callback({sdp: answer.toString()})

        // } else {
        //     // we need remote stream 
        //     const remoteOffer = endpoint.createOffer(config.capabilities)

        //     const adapter = socketioServer.of('/').adapter as RedisAdapter

        //     adapter.customRequest({
        //         streamId: streamId,
        //         sdp : remoteOffer.toString()
        //     }, (err:any, replies: any[]) => {

        //         console.log(replies)
        //         console.log('customRequest',err, replies)


        //         for (let reply of replies) {
        //             if (reply && reply.streamId === streamId) {
                        
        //                 const remoteAnswer = SDPInfo.process(reply.sdp)

        //                 const remoteTransport = endpoint.createTransport(remoteAnswer, remoteOffer, {disableSTUNKeepAlive: true})
        //                 remoteTransport.setLocalProperties(remoteOffer)
        //                 remoteTransport.setRemoteProperties(remoteAnswer)
        //                 const remoteIncomingStreamInfo = remoteAnswer.getStream(reply.streamId)

        //                 console.log(streamId)
        //                 console.dir(remoteAnswer.getStreams())

        //                 console.dir(remoteIncomingStreamInfo)

        //                 incomingStream = remoteTransport.createIncomingStream(remoteIncomingStreamInfo)
        //                 incomingStreams.set(incomingStream.getId(), incomingStream)

        //                 console.dir(incomingStream)

        //                 incomingStream.on('stopped', () => {
        //                     incomingStreams.delete(incomingStream.getId())
        //                 })



        //                 if (incomingStream) {
        //                     const outgoingStream = transport.publish(incomingStream)
        //                     answer.addStream(outgoingStream.getStreamInfo())
        //                     console.dir(answer)
        //                     callback({sdp: answer.toString()})
        //                 } else {
                
        //                     callback({error: 'can not find the stream'})
        //                 }

        //                 // todo some clean
        //                 // if the viewer count is 0  we should clean 
        //                 // if remoteStream closed, we should closed the stream too 
        //             }
        //         }
        //     })
        // }



    })
 
})

export = socketioServer
