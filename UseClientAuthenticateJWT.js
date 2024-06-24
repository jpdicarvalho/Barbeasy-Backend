import jwt  from 'jsonwebtoken';

import 'dotenv/config'

const SECRET_KEY = process.env.TOKEN_SECRET_WORD_OF_USER_CLIENT;

if (!SECRET_KEY) {
    throw new Error('TOKEN_SECRET is not defined in environment variables.');
  }
  
  const UseClientAuthenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
  
    if (authHeader) {
      const token = authHeader.split(' ')[1];
  
      jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) {
          return res.status(403).json({ message: 'Forbidden: Invalid token' });
        }
  
        req.user = user;
        next();
      });
    } else {
      res.status(401).json({ message: 'Unauthorized: No token provided' });
    }
  };
  
  export default UseClientAuthenticateJWT;
