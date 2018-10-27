import { Response, Request, Router } from 'express'

import cors from 'cors'
import jwt from 'jwt-simple'
import RateLimit from 'express-rate-limit'


import config from './config'


const apiRouter = Router()

const rateLimit = new RateLimit({

    windowMs: 1 * 60 * 1000,  // 1 minuts
    max: 10,
    message: 'Too many request from this user'
    // keyGenerator : (req: Request, res: Response): string => {
    //     let room = req.body.room
    //     let user = req.body.user
    //     let key = room + '-' + user
    //     return key
    // }
})

apiRouter.get('/test', async (req: Request, res: Response) => {
    res.send('hello world')
})


apiRouter.get('/', async (req: Request, res: Response) => {
    res.sendFile('publish.html', { root: __dirname + '/../public'})
})

apiRouter.get('/watch/:streamId', async (req: Request, res: Response) => {
    res.sendFile('watch.html', { root: __dirname + '/../public'})
})


export default apiRouter