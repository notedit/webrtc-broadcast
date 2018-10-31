import events from 'events'
import { Gateway,Session, Handle } from 'janus-ts'
import config from './config'

export class Janus extends events.EventEmitter {

    private gateway:Gateway
    private adminSession:Session
    private adminHandle:Handle

    private streams:Map<string,number>
    private sessions:Map<number,Session> 


    constructor(){
        super()
    }
    // async init() {

    //     return new Promise((resolve,reject) => {
    //         this.gateway = new Gateway(config.janusurl)

    //         this.gateway.on('open', async () => {
    //             this.adminSession = await this.gateway.create()
    //             this.adminHandle = await this.adminSession.attach()
    //             resolve()
    //         })
    //     })
    // }

    // async createSession

    // async getStreams() {

    //     const req:any = {
    //         request: 'list'
    //     }

    //     let ret = await this.infoHandle.request(req)

    //     return ret.plugindata.data.list
    // }
    // /**
    //  * 
    //  * @param streamId number
    //  */
    // async getStream(streamId:number) {

    //     const req:any = {
    //         request: 'info',
    //         id:streamId,
    //     }
        
    //     let ret = await this.infoHandle.request(req)

    //     return ret.plugindata.data.info
    // }
    // /**
    //  * params:
    //  * 
    //  * audio:bool
    //  * audioport:number
    //  * audiopt:number
    //  * audiortpmap:string
    //  * video:bool
    //  * videoport:number
    //  * videopt:number
    //  * videortpmap:string
    //  * videofmtp:string
    //  * videobufferkf:bool
    //  *
    //  * return: 
    //  * 
    //  * id: 4035127640671564,
    //  * description: '4035127640671564',
    //  * type: 'live',
    //  * is_private: false,
    //  * audio_port: 10009,
    //  * video_port: 10010 
    //  */
    // async createStream(params) {

    //     const req = Object.assign({
    //         request: 'create',
    //         type: 'rtp'
    //     }, params)

    //     const handle = await this.session.attach('janus.plugin.streaming')

    //     let ret = await handle.request(req)
    //     let stream = ret.plugindata.data.stream
    //     let streamId:number = stream.id

    //     this.streamMap.set(streamId,handle)

    //     handle.on('detached', () => {
    //         this.streamMap.delete(streamId)    
    //     })

    //     return stream
    // }
    // /**
    //  * 
    //  * @param streamId number
    //  */
    // async destroyStream(streamId:number) {

    //     const handle = this.streamMap.get(streamId)
    //     if (!handle) {
    //         return
    //     }

    //     const req:any = {
    //         request: 'destroy',
    //         id: streamId
    //     }

    //     let ret = await handle.request(req)

    //     return ret.plugindata.data
    // }
    // /**
    //  * 
    //  * @param streamId  number
    //  * @param audio  bool
    //  * @param video  bool
    //  * 
    //  * @return jsep string
    //  */
    // async watchStream(streamId:number,audio=true,video=true) {

    //     const handle = this.streamMap.get(streamId)
    //     if (!handle) {
    //         return
    //     }

    //     const req:any = {
    //         request: 'watch',
    //         id:streamId,
    //         offer_audio:audio,
    //         offer_video:video
    //     }

    //     let ret = await handle.message(req)
    //     return ret.jsep
    // }

    // async startStream(streamId:number, jsep:any) {

    //     const handle = this.streamMap.get(streamId)
    //     if (!handle) {
    //         return
    //     }

    //     const req:any = {
    //         request: 'start'
    //     }

    //     let ret = await handle.message(req, jsep)

    //     console.dir(ret)

    //     return ret
    // }
}




