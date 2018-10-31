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
import { Janus } from './janus'

import {Gateway,Session,Handle} from 'janus-ts'

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


const gateway = new Gateway(config.janusurl)


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

    const session = await gateway.create()
    const handle = await session.attach('janus.plugin.streaming')

    handle.on('event', async (data) => {
        console.log('event from handle', data)
    })

    socket.on('disconnect', async () => {

        await session.destroy()
    })

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


        if (answer.getMedia('video')) {
            answer.getMedia('video').setBitrate(500)
        }

        transport.setLocalProperties(answer)

        const offerStream = sdp.getStream(streamId)

        const incomingStream = transport.createIncomingStream(offerStream)

        streams.incomingStreams.set(incomingStream.getId(), incomingStream)

        // add refresher
        const refresher = MediaServer.createRefresher(2000)

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

        const videoMedia = answer.getMedia('video')

        if (videoMedia) {
            incomingStream.videoCodec = videoMedia.getCodec('h264')
        }

        const audioMedia = answer.getMedia('audio')

        if (audioMedia) {
            incomingStream.audioCodec = audioMedia.getCodec('opus')
        }


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

        if (!streams.incomingStreams.get(streamId)) {
            callback({error: 'stream does not exist'})
            return
        }

        const incomingStream = streams.incomingStreams.get(streamId)

        if (!incomingStream.janusStreamId) {

            let params:any = {}
            const audioport = await getMediaPort()
            const videoport = await getMediaPort()

            if (incomingStream.audioCodec) {   
                params = Object.assign({},{
                    audio:true,
                    audioport: audioport,
                    audiopt: incomingStream.audioCodec.getType(),
                    audiortpmap: 'opus/48000/2'  // hard code for now
                })
            }
            
            if (incomingStream.videoCodec) {
                params = Object.assign(params, {
                    video:true,
                    videoport: videoport,
                    videopt: incomingStream.videoCodec.getType(),
                    videortpmap: 'H264/9000',  // hard code for now 
                    videobufferkf:true
                })
            }

            params = Object.assign(params,{
                    request: 'create',
                    type: 'rtp'
                })

            let create = await handle.request(params)
            const janusstream = create.plugindata.data.stream

            console.dir('after createStream', janusstream)

            incomingStream.janusStreamId = janusstream.id 


            if (incomingStream.videoCodec) {

                const video = new MediaInfo('video','video')
                video.addCodec(incomingStream.videoCodec)

                const outgoingVideoSession = incomingStream.streamer.createSession(video, {
                    remote : {
                        ip : '127.0.0.1',
                        port: videoport
                    }
                })

                outgoingVideoSession.getOutgoingStreamTrack().attachTo(incomingStream.getVideoTracks()[0])
            }

            if (incomingStream.audioCodec) {
                // todo 
            }
            
            let watch  = await handle.request({
                request: 'watch',
                id: janusstream.id,
                offer_audio:true,
                offer_video:true 
            })

            console.dir(watch)

            socket.emit('offer', watch.jsep, async (data) => {
                await handle.message({
                    request: 'start'
                }, data.jsep)
            })

        } else {

            let watch  = await handle.request({
                request: 'watch',
                id: incomingStream.janusStreamId,
                offer_audio:true,
                offer_video:true 
            })

            console.dir(watch)

            socket.emit('offer', watch.jsep, async (data) => {
                await handle.message({
                    request: 'start'
                }, data.jsep)
            })
        }
        
    })
 
})

export = socketioServer
