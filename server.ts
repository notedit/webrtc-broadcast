import Server from './src/server'


const server = new Server({})


server.listen(6555, '0.0.0.0', () => {

    console.log('listen on port ', 6555)
})