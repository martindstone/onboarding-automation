import express from 'express'
import session from 'express-session'
import passport from 'passport'
import morgan from 'morgan'
import axios from 'axios'
import GoogleStrategy from 'passport-google-oauth20'
import { PrismaClient } from '@prisma/client'
import { PrismaSessionStore } from '@quixo3/prisma-session-store'

import google from 'googleapis'

const clientID = process.env.GOOGLE_CLIENT_ID || 'set your client id'
const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'set your client secret'
const callbackURL = process.env.CALLBACK_URL || 'set your callback url'

const prisma = new PrismaClient({
  log: ['query']
})

const SessionSettings = session({
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000 // ms
  },
  secret: process.env.SECRET || 'meeps in the peeps, beeps in the sheeps',
  store: new PrismaSessionStore(
    prisma,
    {
      checkPeriod: 2 * 60 * 1000,  //ms
      dbRecordIdIsSessionId: true,
      dbRecordIdFunction: undefined,
    }
  ),
})

const app = express();

app.use(morgan('combined'))
app.use(SessionSettings)
app.use(passport.initialize())
app.use(passport.session())

passport.serializeUser(function(user, done) {
  console.log('===serialize user', JSON.stringify(user, null, 2))
  done(null, user)
})

passport.deserializeUser(function(user: Express.User, done) {
  console.log('===deserialize user')
  done(null, user)
})

passport.use(new GoogleStrategy.Strategy({
  clientID,
  clientSecret,
  callbackURL,
},
async function(accessToken, refreshToken, profile, cb) {
  console.log(`got ${accessToken}, email is ${profile._json.email}, the name is ${profile.displayName}`)
  const token = accessToken
  const email = profile._json.email
  const name = profile.displayName
  const user = await prisma.user.upsert({
    create: {
      name,
      email,
      token,
    },
    update: {
      token
    },
    where: {
      email: email
    }
  })
  return cb(null, profile)
}
));

app.get('/', async (req: any, res) => {
  const email = req.user._json.email
  const user = await prisma.user.findUnique({
    where: { email }
  })
  const token = user?.token

  try {
    const r = await axios.get(`https://www.googleapis.com/admin/directory/v1/groups?userKey=${email}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
    console.log ('r is ', r)
    res.send(JSON.stringify(r.data))  
  } catch (error) {
    console.log(error)
  }
  // admin({version: 'directory_v1', auth});


  // .then(user => {
  //   res.send(JSON.stringify(user))
  // })
  // res.end('')
})

app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email', 'https://www.googleapis.com/auth/admin.directory.group'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    req.session.save(() => {
      console.log('===save session')
      res.redirect('/')
    })
  });

app.listen(process.env.PORT || 3000, () => {
  console.log("⚡️[server]: Server is running");
})
