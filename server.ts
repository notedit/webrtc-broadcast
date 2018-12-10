import Server from './src/server'

const server = new Server({})

const port = 5000

server.listen(port, '0.0.0.0', () => {
    console.log('listen on port ', port)
})