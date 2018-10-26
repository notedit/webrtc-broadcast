export default {
    endpoint: '127.0.0.1',
    capabilities:  {
        audio : {
            codecs		: ["opus"],
            extensions	: [ "urn:ietf:params:rtp-hdrext:ssrc-audio-level", "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"]
        },
        video : {
            codecs		: ["h264;packetization-mode=1"],
            rtx		: true,
            rtcpfbs		: [
                { "id": "transport-cc"},
                { "id": "ccm", "params": ["fir"]},
                { "id": "nack"},
                { "id": "nack", "params": ["pli"]}
            ],
            extensions	: [ "http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01"]
        }
    }
}