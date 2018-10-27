import Server from './src/server'


const server = new Server({})


const port:number = parseInt(process.argv[2])

server.listen(port, '0.0.0.0', () => {
    
    console.log('listen on port ', port)
})