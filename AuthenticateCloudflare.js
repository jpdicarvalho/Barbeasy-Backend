import axios from 'axios';
import 'dotenv/config';

// This is the demo secret key. In production, we recommend
// you store your secret key(s) safely.

const AuthenticateCloudflare = (req, res, next) => {
  const token_cloudflare_from_client_server = req.headers.authorization;

  if(token_cloudflare_from_client_server) {
    const token = token_cloudflare_from_client_server.split(' ')[1];

    // Validate the token by calling the
    // "/siteverify" API endpoint.
    const values = {
        secret: process.env.CLOUDFLARE_SECRET_KEY,
        response: token,
    }
    const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    axios.post(url, values)
    .then(res =>{
        console.log(res.data)
        if(res.data.success === true){
            next();
        }
    })
    .catch(err =>{
        console.log(err)
        return res.status(403).json({ message: 'Cloudflare: Invalid token' });
    })
  }
}
export default AuthenticateCloudflare;  