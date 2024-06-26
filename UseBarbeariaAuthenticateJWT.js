import jwt  from 'jsonwebtoken';

import 'dotenv/config'

const SECRET_TOKEN_BARBEARIA = process.env.TOKEN_SECRET_WORD_OF_USER_BARBEARIA;
const SECRET_TOKEN_USER_CLIENT = process.env.TOKEN_SECRET_WORD_OF_USER_CLIENT;


if (!SECRET_TOKEN_BARBEARIA) {
    throw new Error('TOKEN_SECRET is not defined in environment variables.');
  }
  
  const UseBarbeariaAuthenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
  
    if (authHeader) {
      const token = authHeader.split(' ')[1];
  
      jwt.verify(token, SECRET_TOKEN_BARBEARIA, (err, user) => {
        if (err) {
          jwt.verify(token, SECRET_TOKEN_USER_CLIENT, (erro, userClient) => {
            if(erro){
              return res.status(403).json({ message: 'Forbidden: Invalid token' });
            }
          req.userClient = userClient;
          next();
          })
          
        }
          
        req.user = user;
        next();
      });
    } else {
      res.status(401).json({ message: 'Unauthorized: No token provided' });
    }
  };
  
  export default UseBarbeariaAuthenticateJWT;
