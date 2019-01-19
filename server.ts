import Server from './src/server'

const pubServer = new Server({})


pubServer.listen(5000, '0.0.0.0', () => {
    console.log('listen on port ', 5000)
})

const subServer = new Server({})


subServer.listen(4999, '0.0.0.0', () => {
    console.log('listen on port ', 4999)
})
