import jwt  from 'jsonwebtoken';

const SECRET_KEY = process.env.tokenWordSecret;

if (!SECRET_KEY) {
    throw new Error('TOKEN_SECRET is not defined in environment variables.');
  }
  
  const AuthenticateJWT = (req, res, next) => {
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
  
  export default AuthenticateJWT;
