import axios from 'axios';
import 'dotenv/config';

// This is the demo secret key. In production, we recommend
// you store your secret key(s) safely.

const AuthenticateCloudflare = (req, res, next) => {
  //const authHeader = req.headers;
  console.log(req.headers)
  console.log(req)


  const body = request.formData();
  console.log(body)
  /* Turnstile injects a token in "cf-turnstile-response".
  const token = body.get("cf-turnstile-response");
  const ip = request.headers.get("CF-Connecting-IP");

  // Validate the token by calling the
  // "/siteverify" API endpoint.
  const values = {
    secret: CLOUDFLARE_SECRET_KEY,
    response: token,
    remoteip: ip
  }
  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  axios.post(url, values)
  .then(res =>{
    console.log(res)
  })
  .catch(err =>{
    console.log(err)
  })*/
}
export default AuthenticateCloudflare;