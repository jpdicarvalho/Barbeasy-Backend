// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from "body-parser";

import mysql from "mysql2";

import jwt  from 'jsonwebtoken';
import AuthenticateJWT from './AuthenticateJWT.js'
import MercadoPago from "mercadopago";

import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import morgan from 'morgan';
import winston from 'winston';
import UAParser from 'ua-parser-js';
import rateLimit from 'express-rate-limit';

//import { serveSwaggerUI, setupSwaggerUI } from './swaggerConfig.js';

import 'dotenv/config'

const app = express();
// Configurar a confiança no proxy
app.set('trust proxy', 1);

//===================== MIDDLEWARE TO CREATE LOGS =====================

morgan.token('remote-addr', function(req) {// Defina o formato personalizado para o Morgan
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
});

morgan.token('user-agent', function(req) {
  const parser = new UAParser();
  const ua = parser.setUA(req.headers['user-agent']).getResult();
  return `${ua.browser.name} ${ua.browser.version}`;
});


morgan.token('body', function(req) {// Adicione um token personalizado para o corpo da requisição
  return JSON.stringify(req.body);
});

morgan.token('params', function(req) {// Adicione um token personalizado para os parâmetros da rota
  return JSON.stringify(req.params);
});

// Use o Morgan com o formato personalizado
const logFormat = ':remote-addr - [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":user-agent" Body: :body Params: :params';
app.use(morgan(logFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

const logger = winston.createLogger({// Configuração do Winston para registrar logs em um arquivo e no console
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(), // Log no console
    new winston.transports.File({ filename: 'combined.log' }) // Log no arquivo
  ]
});

//===================== MIDDLEWARE TO RATE LIMIT =====================
const limiter = rateLimit({// Configurar limitação de taxa
  windowMs: 10 * 60 * 1000, // 15 minutos
  max: 2500, // Limite de 100 requisições por IP
  message: 'Error in request'
});

const port = process.env.PORT || 3000;

//CORS Settings to Only Allow Frontend Deployment to Netlify
const corsOptions = { origin: 'http://localhost:5173', optionsSuccessStatus: 200, // Some browser versions may need this code
};

app.use(cors(corsOptions));
app.use(limiter);// Aplicar limitação de taxa a todas as requisições
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

// Create the connection to the database mysql on PlanetScale
const db = mysql.createConnection(process.env.DATABASE_URL)

// Verify connection to the database
db.connect((error) => {
  if (error) {
    console.error('Erro ao conectar ao banco de dados:', error.message);
  } else {
    console.log('Conexão bem-sucedida ao banco de dados!');
  }
});
//regex to valided values of input
const isNameValided = (input) => /^[a-zA-Z]+$/.test(input);
const isOnlyNumberValided = (input) => /^[0-9]*$/.test(input);
const isEmailValided = (input) => /^[a-z0-9.@]+$/i.test(input);
const isPasswordValided = (input) => /^[a-zA-Z0-9@.#%]+$/.test(input);
const isSignUpBarbeariaValid = (input) => /^[a-zA-Z\sçéúíóáõãèòìàêôâ]*$/.test(input);


/* Inicializando o Swagger
app.use('/api-docs', serveSwaggerUI, setupSwaggerUI);*/

//Set multer
const storage = multer.memoryStorage()
const upload = multer({storage: storage})

//Set AWS S3
const awsBucketName = process.env.AWS_S3_BUCKET_NAME
const awsRegion = process.env.AWS_REGION
const awsAccessKey = process.env.AWS_ACCESS_KEY_ID
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

const s3 = new S3Client({
  credentials:{
    accessKeyId: awsAccessKey,
    secretAccessKey: awsSecretAccessKey,
  },
  region: awsRegion
});

//=-=-=-=-= ROTAS USER-CLIENT-BARBEARIA =-=-=-=-=

// Cadastro de usuário com senha criptografada
app.post("/api/v1/Sign-Up", async (req, res) => {
  const { name, email, senha, celular } = req.body;

  // Verificação se o e-mail ou o número de celular já estão cadastrado
  db.query('SELECT * FROM user WHERE email = ? OR celular = ?', [email, celular], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro ao verificar o e-mail ou o número de celular');
    }

    // Se houver resultados, significa que o e-mail ou o número de celular já estão cadastrado
    if (results.length > 0) {
      const existingUser = results[0];
      if (existingUser.email === email) {
        return res.status(400).send('E-mail já cadastrado. Por favor, escolha outro e-mail.');
      } else if (existingUser.celular === celular) {
        return res.status(400).send('Número de celular já cadastrado. Por favor, escolha outro número.');
      }
    }
   
    const user = {
      name,
      email,
      senha,
      celular
    };

    db.query('INSERT INTO user SET ?', user, (error, results) => {
      if (results) {
        res.status(201).send('Usuário registrado com sucesso');
      } else {
        console.error(error);
        res.status(500).send('Erro ao registrar usuário');
      }
    });
  });
});

//Realizando Login e Gerando Token de autenticação
app.post('/api/v1/SignIn', async (req, res) => {
  const {email, senha} = req.body;

  // Buscar usuário pelo email
  db.query('SELECT * FROM user WHERE email = ? AND senha = ?', [email, senha],
  (err, result) => {
    if(err){
      res.send({err: err});
    }
    if (result.length > 0) {
      const user = result[0];
      // Criação do token
      const token = jwt.sign({ userId: user.id, userEmail: user.email }, process.env.TOKEN_SECRET_WORD, { expiresIn: "3h" });
      // Envie o token no corpo da resposta
      res.status(200).json({ success: true, token: token, user: result });
      
    } else {
      // Usuário não encontrado
      res.status(404).json({success: false, message: 'Usuário não encontrado'});
    }
  });
});

//Route to get all barbearias
app.get('/api/v1/getAllBarbearias', AuthenticateJWT, async (req, res) => {
  try {
    const sql="SELECT id, name, status, banner_main, banners, rua, N, bairro, cidade FROM barbearia";
    db.query(sql, (err, rows) => {
      if (err){
        console.error("Erro ao buscar barbearias:", err);
        return res.status(500).json({ Success: "Error", Message: "Erro ao buscar barbearias" });
      }
      if(rows.length > 0){
        const sqlService="SELECT name, barbearia_id FROM servico";
        db.query(sqlService, (error, result) =>{
          if(error){
            console.error("Erro ao buscar serviços:", err);
            return res.status(500).json({ Success: "Error", Message: "Erro ao buscar serviços" });
          }else{
            res.json({barbearias: rows, services: result});
          }
        })
      }
      
    });
  } catch (error) {
    console.error('Erro ao obter os registros:', error);
    res.status(500).json({ success: false, message: 'Erro ao obter os registros' });
  }
});

/*listando os Serviços cadastrados pelas barbearias*/
app.get('/api/v1/getAllServices', AuthenticateJWT, async (req, res)=>{
  try {
    db.query('SELECT * FROM servico', (err, rows) => {
      if (err) throw err;
      res.json(rows);
    });
    } catch (error) {
      console.error('Erro ao obter os registros:', error);
    }
});

//Cadastrando a avaliação do usuário
app.post("/api/v1/avaliacao", (req, res) => {
  const sql = "INSERT INTO avaliacoes (`user_name`,`barbearia_id`, `estrelas`, `comentarios`, `data_avaliacao`) VALUES (?)";
  const values = [
    req.body.userName, //String
    req.body.barbeariaId, //interge
    req.body.avaliacao, //interge
    req.body.comentario, //String
    req.body.data_avaliacao //String
  ]
  db.query(sql, [values], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ success: false, message: 'Erro ao registrar avaliação' });
    } else {
      res.status(201).json({ success: true, message: 'Avaliação registrada com sucesso' });
    }
  });
});

//Buscando a avaliação da barbearia em especifico
app.get('/api/v1/SearchAvaliation', AuthenticateJWT, async(req, res)=>{
  try {
    db.query('SELECT * FROM avaliacoes', (err, rows) => {
      if (err) throw err;
      res.json(rows);
    });
    } catch (error) {
      console.error('Erro ao obter os registros:', error);
    }
});

//Salvando o agendamento feito pelo cliente
app.post('/api/v1/agendamento', (req, res) => {
  const { selectedDate, selectedTime, selectedService, barbeariaId, userId} = req.body;
  db.query('INSERT INTO agendamentos (dia_agendamento, horario, user_id, barbearia_id, servico_id) VALUES (?, ?, ?, ?, ?)', 
    [selectedDate, selectedTime, userId, barbeariaId, selectedService], 
    (err, results) => {
      if (err) {
        console.error('Erro ao inserir os dados:', err);
        res.status(500).json({ message: 'Erro ao inserir os dados' });
        return;
      }
      res.json({ message: 'Agendamento criado com sucesso' });
  });
});

//RoutesPayment
app.post('/api/Checkout', async (req, res) => {
  //set API Mercago Pago
  const client = new MercadoPago.MercadoPagoConfig({
    accessToken: process.env.accessTokenMercadoPago,
  });
  
  const preference = new MercadoPago.Preference(client);

  //create preferences
  let body = {
    items:[{
          title: req.body.nameServico,
          quantity: 1,
          currency_id: 'BRL',
          description: req.body.DescricaoServico,
          unit_price: parseFloat(req.body.preco)
    }],
    payer:{
      email: "demo@gmail.com"
    },
    payment_methods:{
      installments:3
    },
    "back_urls": {
      "success": "http://localhost:5173/",
      "failure": "http://localhost:5173/failure",
      "pending": "http://localhost:5173/pending"
  },
  "auto_return": "approved",
  };
  preference.create({ body }).then(function (data) {
    res.send(JSON.stringify(data.init_point));
    //console.log(data);
   }).catch(function (error){
     console.log(error);
   });
});

//======================================= ROTAS USER-BARBEARIA ====================================

//Cadastro de ususário Barbearia   #VERIFIED
app.post("/api/v1/SignUpBarbearia", async (req, res) => {
  const { name, street, number, neighborhood, city, usuario, email, senha } = req.body;

  // Verifica se name contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(name) && name.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se street contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(street) && street.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (!isOnlyNumberValided(number) && number.length <= 5) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se neighborhood contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(neighborhood) && neighborhood.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se city contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(city) && city.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se usuario contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(usuario) && usuario.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se email contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(email) && email.length <= 50) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(senha) && senha.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verificação se o e-mail já está cadastrado
  db.query('SELECT email, rua, N, bairro, cidade FROM barbearia WHERE email = ? OR rua = ? AND N = ? AND bairro = ? AND cidade = ?', [email, street, number, neighborhood, city], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro ao verificar o e-mail');
    }

    // Se já houver resultados, significa que o e-mail já está cadastrado
    if (results.length > 0) {
      return res.status(401).send('E-mail ou endereço já cadastrado.');
    }

    const barbearia = {
      name,
      email,
      usuario,
      senha,
      status: 'Fechado',
      user_image: 'user_image',
      banner_main: 'banner_main',
      banners: 'banners',
      rua: street,
      N: number,
      bairro: neighborhood,
      cidade: city
    };

    db.query('INSERT INTO barbearia SET ?', barbearia, (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).send('Erro ao registrar usuário');
      }else{
        if(results){
          res.status(201).send('Usuário registrado com sucesso');
        }
      }
    });
  });
});

//Realizando Login e Gerando Token de autenticação para a barbearia  #VERIFIED
app.get('/api/v1/SignInBarbearia/:email/:senha', async (req, res) => {
  const email = req.params.email;
  const senha = req.params.senha;

  // Verifica se newEmail contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(email) && email.length <= 50) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se newSenha contém apenas letras maiúsculas, minúsculas e @#%$ como caracteres especiais
  if (!isPasswordValided(senha) && senha.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Buscar usuário pelo email
  db.query('SELECT id, name, usuario, status, user_image, banner_main, banners, rua, N, bairro, cidade FROM barbearia WHERE email = ? AND senha = ?', [email, senha],
  (err, result) => {
    if(err){
      return res.send({err: err});
    }
    if (result.length > 0) {
      const barbearia = result[0];
      // Criação do token
      const token = jwt.sign({ barbeariaId: barbearia.id, barbeariaEmail: barbearia.email }, process.env.TOKEN_SECRET_WORD, { expiresIn: "3h" });
      // Envie o token no corpo da resposta
      return res.status(200).json({ Success: 'Success', token: token, barbearia: result });
      
    } else {
      // Usuário não encontrado
      return res.status(404).json({Success: 'Falied', message: 'Usuário não encontrado'});
    }
  });
});

//Realizando Login e Gerando Token de autenticação para a barbearia  #VERIFIED
app.get('/api/v1/SignInProfessional/:email/:senha', async (req, res) => {
  const email = req.params.email;
  const senha = req.params.senha;

  // Verifica se newEmail contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(email) && email.length <= 50) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se newSenha contém apenas letras maiúsculas, minúsculas e @#%$ como caracteres especiais
  if (!isPasswordValided(senha) && senha.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Buscar usuário pelo email
  db.query('SELECT id, name, user_image FROM professional WHERE email = ? AND password = ?', [email, senha],
  (err, result) => {
    if(err){
      return res.send({err: err});
    }
    if (result.length > 0) {
      const professional = result[0];
      // Criação do token
      const token = jwt.sign({ professionalId: professional.id, professionalEmail: professional.email }, process.env.TOKEN_SECRET_WORD, { expiresIn: "3h" });
      // Envie o token no corpo da resposta
      return res.status(200).json({Success: 'Success', token: token, professional: result });
      
    } else {
      // Usuário não encontrado
      return res.status(404).json({Success: 'Falied', message: 'Usuário não encontrado'});
    }
  });
});

//Route to Auth action change data of user barbearia #VERIFIED
app.get('/api/v1/AuthToUpdateData/', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.query.barbeariaId;
  const password = req.query.password;

  // Verifica se newSenha contém apenas letras maiúsculas, minúsculas e @#%$ como caracteres especiais
  if (!isPasswordValided(password)) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql='SELECT senha FROM barbearia WHERE id = ? AND senha = ?';
  db.query(sql, [barbeariaId, password], (err, result) =>{
    if (err) {
      console.error('Erro ao verificar senha:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }

    if(result.length > 0){
      res.status(200).json({Success: 'true'})
    }else{
      res.status(200).json({Success: 'false'})
    }
  })
});

//Upload de Imagem do Usuário Barbearia, na AWS S3  #VERIFIED
app.put('/api/v1/updateUserImageBarbearia', AuthenticateJWT, upload.single('image'), (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const newImageUser = req.file.originalname;

  const allowedExtensions = ['jpg', 'jpeg', 'png'];

  // Obtém a extensão do arquivo original
  const fileExtension = newImageUser ? newImageUser.split('.').pop() : '';//operador ternário para garantir que name não seja vazio
  if(fileExtension.length > 0){
    // Verifica se a extensão é permitida
    if (!allowedExtensions.includes(fileExtension)) {
      console.error('Error on Update Image');
      return res.status(400).json({ Error: 'extension not allowed' });
    }
  }

  //Buscando imagem atual salva no BD MySQL
  const currentImg = "SELECT user_image FROM barbearia WHERE id = ?";
  db.query(currentImg, [barbeariaId], (err, result) => {
    if(err){
      console.error('Error on Update Image:', err);
      return res.status(500).json({ error: 'Current Image - Internal Server Error' });
    }
    //Verificando se há imagem salva
    if(result.length > 0){
      const currentImageName = result[0].user_image; //Nome da imagem salva no BD MySQL

      //Configurando os parâmetros para apagar a imagem salva no bucket da AWS S3
      const params = {
        Bucket: awsBucketName,
        Key: currentImageName
      }
      const command = new DeleteObjectCommand(params)//Instânciando o comando que irá apagar a imagem

      //Enviando o comando para apagar a imagem
      s3.send(command, (sendErr, sendResult) =>{
        if(sendErr){
          console.error('Send Error:', sendErr);
        }else{
          //Atualizando a coluna 'user_image' com a nova imagem do usuário
          const sql = "UPDATE barbearia SET user_image=? WHERE id=?";
          db.query(sql, [newImageUser, barbeariaId], (updateErr, updateResult) => {
            if (updateErr) {
              //Mensagem de erro caso não seja possuível realizar a atualização da imagem no Banco de Dados
              console.error('Error on Update Image:', updateErr);
              return res.status(500).json({ error: 'Update Image - Internal Server Error' });
            }else{
                // Cria os parâmetros para enviar a imagem para o bucket da AWS S3
                const updateParams = {
                Bucket: awsBucketName,
                Key: newImageUser,
                Body: req.file.buffer,
                ContentType: req.file.mimetype,
              }
              const updateCommand = new PutObjectCommand(updateParams)// Instânciando o comando que irá salvar a imagem
              s3.send(updateCommand)// Envia o comando para o Amazon S3 usando a instância do serviço S3
              return res.status(200).json({ Status: "Success" });
            }
          });
        }
      })
    }
  });
});

//Rota para obter a imagem de usuário #VERIFIED
app.get('/api/v1/userImageBarbearia', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.query.barbeariaId; 

  const sql = "SELECT user_image from barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], async (err, result) => {
    if(err){
      console.error('Erro ao buscar imagem no banco de dados:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }else{
      if(result.length > 0) {
        const url = "https://d15o6h0uxpz56g.cloudfront.net/" + result[0].user_image;
        return res.json({url});
        }
    }
  })
});

// Rota para lidar com o upload de imagens de banners #VERIFIED
app.put('/api/v1/updateBannersImages', AuthenticateJWT, upload.array('images'), (req, res) => {
  const barbeariaId = req.body.barbeariaId;

    //Array with allowed extensions
    const allowedExtensions = ['jpg', 'jpeg', 'png'];

    //array with names images
    const imagesBanners = req.files.map((file) => {
      return {
        originalname: file.originalname
      };
    });
    // Itera sobre os arquivos enviados
    for (let i = 0; i < imagesBanners.length; i++) {
      const file = imagesBanners[i].originalname;

      // Obtém a extensão do arquivo original
      const fileExtension = file ? file.split('.').pop() : '';

      // Verifica se a extensão é permitida
      if (!allowedExtensions.includes(fileExtension)) {
        console.error('Error to update image')
        return res.status(400).json({ error: 'extensions are not allowed'});
      }
    }

  const currentBannerImg = "SELECT banners FROM barbearia WHERE id IN (?)";
  db.query(currentBannerImg, [barbeariaId], (currentErr, currentResult) =>{
    if(currentErr){
      console.error('Erro ao buscar o nome das imagens banners no banco de dados:', currentErr);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if(currentResult.length > 0) {
      const bannerImagesName = currentResult[0].banners;
      const bannerImagesArray = bannerImagesName.split(',');

      for(let i = 0; i < bannerImagesArray.length; i++){
        //Configurando os parâmetros para apagar a imagem salva no bucket da AWS S3
        const deleteParams = {
          Bucket: awsBucketName,
          Key: bannerImagesArray[i]
        }
        const deleteCommand = new DeleteObjectCommand(deleteParams)//Instânciando o comando que irá apagar a imagem
        //Enviando o comando para apagar a imagem
        s3.send(deleteCommand, (uploadBannerErr, uploadBannerResult) => {
          if(uploadBannerErr){
            console.error('Erro ao apagar as imagens banners no bucket aws-s3:', uploadBannerErr);
            return res.status(500).json({ error: 'Internal Server Error' });
          }else{
            //obtendo o nome e o buffer para salvar no BD e na AWS-S3, respectivamente, das imagens enviadas
            const bannerImages = req.files.map((file) => {
              return {
                originalname: file.originalname,
                buffer: file.buffer,
              };
            });
            //Enviando imagem por imagem para o bucket aws-s3
            for (let i = 0; i < bannerImages.length; i++) {
              const params = {
                Bucket: awsBucketName,
                Key: bannerImages[i].originalname,
                Body: bannerImages[i].buffer,
                ContentType: bannerImages[i].mimetype,
              }
              // Cria um comando PutObject para enviar o arquivo para o AWS S3
              const command = new PutObjectCommand(params)
              // Envia o comando para o Amazon S3 usando a instância do serviço S3
              s3.send(command)
            }
            //Array com os nomes das imagens enviadas
            const bannerImagesName = [];
            //Salvando os nomes das imagens no array acima
            for (let i = 0; i < bannerImages.length; i++) {
              bannerImagesName.push(bannerImages[i].originalname);
            }
            //Obtém o nome da primeira imagem para defini-lá como principal
            const bannerMain = bannerImagesName[0];

            // Converte o array de nomes em uma string separada por vírgulas
            const bannerImagesNameString = bannerImagesName.join(','); 

            //Atualizando o nome das imagens banner no BD MySQL
            const sql = "UPDATE barbearia SET banner_main = ?, banners = ? WHERE id IN (?)";
            db.query(sql, [bannerMain, bannerImagesNameString, barbeariaId], (err, result) => {
              if (err) {
                console.error('Erro ao atualizar o nome das imagens no banco de dados:', err);
                return res.status(500).json({ error: 'Internal Server Error' });
              }
            });
          }
          // Retorna um JSON indicando sucesso após a atualização do banco de dados
          res.status(200).json({ Status: 'Success' });
        })
      }
    }
  })
});

//Rota para obter as imagens para o banner #VERIFIED
app.get('/api/v1/bannerImages', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.query.barbeariaId;

  const sql = "SELECT banners FROM barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], async (err, result) => {
    if (err) {
      console.error('Erro ao buscar imagens banner no banco de dados:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if (result.length > 0) {
      const bannerImagesName = result[0].banners;
      const bannerImagesArray = bannerImagesName.split(',');
      const urls = [];

      for (let i = 0; i < bannerImagesArray.length; i++) {
        const imageName = bannerImagesArray[i];//Pegando o nome de cada imagem salva no array anterior
        const url = "https://d15o6h0uxpz56g.cloudfront.net/" + imageName;// Salvando a URL da imagem obtida pelo Cloud Front AWS-S3
        urls.push(url);//Adicionando a nova imagem no Array de URLs
      }      
      return res.json({ urls });
    }
  });
});

//Rota para atualizar o status da barbearia 'Aberta' ou 'Fechada' #VERIFIED
app.put('/api/v1/updateStatus/:barbeariaId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const status = req.body.Status === 'Aberta' ? 'Fechada': 'Aberta';

  const sql = "UPDATE barbearia SET status = ? WHERE id = ?";
  db.query(sql, [status, barbeariaId], (err, result) => {
    if(err){
      console.error("Erro ao atualizar o status da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result){
        return res.status(200).json({Success: "Success"});
      }
    }
  })
});

//Rota para obter o status da barbearia #VERIFIED
app.get('/api/v1/statusBarbearia/:barbeariaId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  
  const sql = "SELECT status FROM barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar o status da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0){
        const statusBarbearia = result[0].status;
        return res.status(200).json({ StatusBarbearia: statusBarbearia});
      }
    }
  })
});

//Rota para atualizar o nome da barbearia #VERIFIED
app.put('/api/v1/updateBarbeariaName/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const newNameBarbearia = req.body.novoNome;

  // Verifica se name contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(newNameBarbearia) && newNameBarbearia.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql = "UPDATE barbearia SET name = ? WHERE id = ?";
  db.query(sql, [newNameBarbearia, barbeariaId], (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o nome da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result) {
        return res.status(200).json({Success: "Success"});
      }
    }
  })
});

//Rota para obter o nome da barbearia #VERIFIED
app.get('/api/v1/nameBarbearia/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;

  const sql = "SELECT name FROM barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar o nome da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        const nomeBarbearia = result[0].name;
        return res.status(200).json({ NomeBarbearia: nomeBarbearia});
      }
    }
  })
});

// Rota para obter atualizar o endereço da barbearia #VERIFIED
app.put('/api/v1/updateAddress/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const street = req.body.street;
  const number = req.body.number;
  const neighborhood = req.body.neighborhood;
  const city = req.body.city;

  // Verifica se street contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(street) && street.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (!isOnlyNumberValided(number) && number.length <= 5) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se neighborhood contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(neighborhood) && neighborhood.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se city contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(city) && city.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }

  let query = `UPDATE barbearia SET`
  const values = [];

  if(street){
    query += ` rua = ?,`;
    values.push(street);
  }
  if(number){
    query += ` N = ?,`;
    values.push(number);
  }
  if(neighborhood){
    query += ` bairro = ?,`;
    values.push(neighborhood);
  }
  if(city){
    query += ` cidade = ?,`;
    values.push(city);
  }
  // Remova a última vírgula da query
  query = query.slice(0, -1);

  query += ` WHERE id = ?`;
  values.push(barbeariaId)

  db.query(query, values, (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o endereço da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    } else {
      if(result) {
        return res.status(200).json({ Success: "Success" });
      }
    }
  });
});

//Rota para obter o endereço da barbearia #VERIFIED
app.get('/api/v1/address/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;

  const sql = "SELECT rua, N, bairro, cidade FROM barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar o nome da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        return res.status(200).json({ Endereco: result});
      }
    }
  })
});

//Route to update user name barbearia #VERIFIED
app.put('/api/v1/updateUserNameBarbearia/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const newUserName = req.body.newUserName;

  // Verifica se usuario contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(newUserName) && newUserName.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql = "UPDATE barbearia SET usuario = ? WHERE id = ?";
  db.query(sql, [newUserName, barbeariaId], (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o nome de usuário da barbearia", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    } else {
      if(result) {
        return res.status(200).json({ Success: "Success" });
      }
    }
  })
});

//Rota para obter o nome de usuário da barbearia #VERIFIED
app.get('/api/v1/userNameBarbearia/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  
  const sql = "SELECT usuario FROM barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar o nome da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        const userNameBarbearia = result[0].usuario;
        return res.status(200).json({ UserNameBarbearia: userNameBarbearia});
      }
    }
  })
});

//Rota para atualizar o email de usuário da barbearia #VERIFIED
app.put('/api/v1/updateEmailBarbearia/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const newEmail = req.body.NewEmail;

  // Verifica se newEmail contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(newEmail) && newEmail.length <= 50) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql = "UPDATE barbearia SET email = ? WHERE id = ?";
  db.query(sql, [newEmail, barbeariaId], (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o email de usuário barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result){
        return res.status(200).json({Success: "Success"});
      }
    }
  })
});

//Rota para obter o email de usuário da barbearia #VERIFIED
app.get('/api/v1/emailBarbearia/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;

  const sql = "SELECT email FROM barbearia WHERE id = ?";
  db.query(sql, [barbeariaId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar o email de usuário da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        const emailBarbearia = result[0].email;
        return res.status(200).json({ EmailBarbearia: emailBarbearia});
      }
    }
  })
});

//Rota para atualizar a senha de usuário da barbearia
app.get('/api/v1/updatePasswordBarbearia', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.query.barbeariaId;
  const passwordConfirm = req.query.passwordConfirm;
  const newPassword = req.query.newPassword;

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(passwordConfirm) && passwordConfirm.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(newPassword) && newPassword.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }
  
  const sql = "SELECT senha FROM barbearia WHERE id = ? AND senha = ?";
  db.query(sql, [barbeariaId, passwordConfirm], (err, result) => {
    if(err) {
      console.error("Erro ao comparar senha de usuário da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    if(result.length > 0) {
      const sql = "UPDATE barbearia SET senha = ? WHERE id = ?";
      db.query(sql, [newPassword, barbeariaId], (err, result) =>{
        if(err){
          console.error("Erro ao atualizar a senha de usuário barbearia", err);
          return res.status(500).json({Error: "Internal Server Error"});
        }
      })
      return res.status(200).json({ Success: "Success"});
    }else{
      return res.status(404).json({ Success: "Falied"});
    }
  })
});

//Route to update the 'agenda' of professional
app.put('/api/v1/updateAgenda/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  //Obtendo as variáveis enviadas
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const daysWeekSelected = req.body.daysWeek;
  const QntDaysSelected = req.body.qntDays;

  //Concatenando os nomes dos dias da semana selecionado
  const daysWeekName = daysWeekSelected.join(',');

  //Verificando se há registro na agenda referente a barbearia informada
  const sql = "SELECT * FROM agenda WHERE barbearia_id = ? AND professional_id = ?";
  db.query(sql, [barbeariaId, professionalId], (err, result) => {
    if(err){
      console.error("Erro ao encontrar registro na agenda", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0){
        const HP = 'Não há horários definidos.';
        const sqlUpdate = "UPDATE agenda SET dias = ?, qnt_dias = ?, dom = ?, seg = ?, ter = ?, qua = ?, qui = ?, sex = ?, sab = ? WHERE barbearia_id = ? AND professional_id = ?";
        db.query(sqlUpdate, [daysWeekName, QntDaysSelected, HP, HP, HP, HP, HP, HP, HP, barbeariaId, professionalId], (err, result) =>{
          if(err){
            console.error("Erro ao cadastrar agenda da barbearia", err);

            return res.status(500).json({Error: "Internal Server Error"});
          }else{
            if(result){
              return res.status(200).json({Success: "Success"});
            }
          }
        })
      }else{
        const HP = 'Não há horários definidos.';
        const sqlInsert = "INSERT INTO agenda (barbearia_id, professional_id, dias, qnt_dias, dom, seg, ter, qua, qui, sex, sab) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(sqlInsert, [barbeariaId, professionalId, daysWeekName, QntDaysSelected, HP, HP, HP, HP, HP, HP, HP], (err, result) =>{
          if(err){
            console.error("Erro ao cadastrar agenda da barbearia", err);
            return res.status(500).json({Error: "Internal Server Error"});
          }else{
            if(result){
              return res.status(200).json({Success: "Success"});
            }
          }
        })
      }
    }
  })
});

//Route to get professional 'agenda' of especific barbearia
app.get('/api/v1/agenda/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const sql = "SELECT dias, qnt_dias FROM agenda WHERE barbearia_id = ? AND professional_id = ?";
  db.query(sql, [barbeariaId, professionalId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar as informações da agenda da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        const agenda = [];

        agenda.push(result[0].dias);
        agenda.push(result[0].qnt_dias);

        return res.status(200).json({ Agenda: agenda});
      }
    }
  })
});

//Route to get all professional's agenda
app.get('/api/v1/allProfessionalAgenda/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const sql = `SELECT agenda.*, barbearia.name
                FROM agenda
                INNER JOIN barbearia ON barbearia.id = agenda.barbearia_id
                WHERE agenda.barbearia_id != ? AND agenda.professional_id = ?`;
                
  db.query(sql, [barbeariaId, professionalId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar as informações da agenda do professional", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        const filterDaysWithTimes = (result) => {
          // Array para armazenar a agenda filtrada
          const filteredAgenda = result.map(item => {
              // Criar um novo objeto para armazenar os dias com horários disponíveis
              const newItem = { ...item };
      
              // Lista de chaves dos dias da semana
              const daysOfWeek = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
      
              // Iterar sobre os dias da semana e remover aqueles que não têm horários disponíveis
              daysOfWeek.forEach(day => {
                  if (newItem[day] === "Não há horários disponíveis para esse dia") {
                      delete newItem[day];
                  }
              });
      
              return newItem;
          });
      
          return filteredAgenda;
        };
        const filteredFullAgenda = filterDaysWithTimes(result);
        return res.status(200).json({ Agenda: filteredFullAgenda});
      }
    }
  })
});

// Routa to save times of day selected of professional
app.put('/api/v1/updateAgendaDiaSelecionado/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const agendaDiaSelecionado = req.body.StrAgenda;

  // Objeto para mapear os dias da semana para abreviações
  const diasDaSemana = {
      'm': 'dom',
      'g': 'seg',
      'r': 'ter',
      'a': 'qua',
      'i': 'qui',
      'x': 'sex',
      'b': 'sab'
  };

  // Verifica se a entrada é válida
  if (typeof agendaDiaSelecionado !== 'string' || agendaDiaSelecionado.length < 3) {
      return res.status(400).json({ error: 'Entrada inválida' });
  }

  const diaAbreviado = diasDaSemana[agendaDiaSelecionado[2]];

  if (diaAbreviado) {
    // Construir a consulta SQL dinamicamente
    const sql = `UPDATE agenda SET ${diaAbreviado} = ? WHERE barbearia_id = ? AND professional_id = ?`;
    let strFormated = agendaDiaSelecionado.substring(4);
    db.query(sql, [strFormated, barbeariaId, professionalId], (err, result) => {
        if (err) {
            console.error("Erro ao cadastrar agenda do dia selecionado da barbearia", err);
            return res.status(500).json({ Error: "Internal Server Error" });
        } else {
            if (result) {
                return res.status(200).json({ Success: "Success" });
            }
        }
    });
} else {
    return res.status(404).json({ Error: "Dia da semana desconhecido" });
}
});

//Rota para obter os horarios definidos para cada dia em específico
app.get('/api/v1/agendaDiaSelecionado/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;


  //Consultando as colunas que possuem os horários de trabalho da barbearia
  const sql = "SELECT dom, seg, ter, qua, qui, sex, sab FROM agenda WHERE barbearia_id = ? AND professional_id = ?";
  db.query(sql, [barbeariaId, professionalId], (err, result) => {
    //Verifição de erro na consulta
    if(err){
      console.error("Erro ao buscar os horários da agenda da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    //Verificação de Sucesso na consulta
    if(result.length > 0){
      const timesDays = {
        Dom: result[0].dom,
        Seg: result[0].seg,
        Ter: result[0].ter,
        Qua: result[0].qua,
        Qui: result[0].qui,
        Sex: result[0].sex,
        Sáb: result[0].sab
      }
      return res.status(200).json({ Success: "Success", TimesDays: timesDays});
    }
  })
});

//Rota para salvar a genda de horários para todos os dias definidos
app.put('/api/v1/updateHorariosTodosOsDias/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const strAllTimes = req.body.StrAgenda;
  const namesDaysFormated = req.body.NamesDaysFormated;

  let query = "UPDATE agenda SET";
  const values = [];
  
  const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];

  days.forEach((day) => {
    if (namesDaysFormated.includes(day)) {
      query += ` ${day} = ?,`;
      values.push(strAllTimes);
    } else {
      query += ` ${day} = ?,`;
      values.push('Não há horários disponíveis para esse dia');
    }
  });

  // Removendo a última vírgula da query
  query = query.slice(0, -1);

  // Adicionando as condições WHERE na query
  query += ` WHERE barbearia_id = ? AND professional_id = ?`;
  values.push(barbeariaId, professionalId);

  db.query(query, [...values, barbeariaId, professionalId], (error, result) => {
    if (error) {
      console.error("Erro ao padronizar os horários de trabalho da barbearia", error);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    return res.status(200).json({ Success: "Success" });
  });

});

app.put('/api/v1/clearTimes/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const daySelected = req.body.daySelected;
  const defautlText = 'Não há horários definidos.'

  let query = "UPDATE agenda SET";

  if(daySelected){
    query += ` ${daySelected} = ?`;
  }

  // Adicionando as condições WHERE na query
  query += ` WHERE barbearia_id = ? AND professional_id = ?`;
  db.query(query, [defautlText, barbeariaId, professionalId], (err, resul) =>{
    if (err) {
      console.error("Erro ao remover horário de trabalho", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }else{
      if(resul){
        return res.status(200).json({ Success: "Success" });
      }
    }
  })
});

//Rota para cadastrar um novo serviço
app.post('/api/v1/addService/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbearia_id = req.params.barbeariaId;
  const professional_id = req.params.professionalId;

  const name = req.body.newNameService; 
  const preco = req.body.newPriceService;
  const commission_fee = req.body.newCommissionFee;
  const duracao = req.body.newDuration;

  // Verifica se number contém apenas números
  if (!isSignUpBarbeariaValid(name) && name.length <= 100) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (preco.length > 10) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (commission_fee.length > 10) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (duracao.length > 5) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const service = {
    name,
    preco,
    duracao,
    commission_fee,
    barbearia_id,
    professional_id
  };

  db.query('INSERT INTO servico SET ?', service, (err, result) =>{
    if(err){
      console.error("Erro ao cadastrar o serviço da barbearia", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }else{
      if(result){
        return res.status(201).json({ Success: "Success" });
      }
    }
  })

})

//Rota obter os serviços cadastrados
app.get('/api/v1/getService/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;


  const sql="SELECT * FROM servico WHERE barbearia_id = ? AND professional_id = ?"
  db.query(sql, [barbeariaId, professionalId], (err, result) =>{
    if(err){
      console.error("Erro ao obter os serviços da barbearia", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }else{
      if(result.length > 0){
        return res.status(200).json({ Success: "Success", result});//Enviando o array com os horários
      }
    }
  })
});

// Rota para atualizar informações de um serviço cadastrado
app.put('/api/v1/updateService/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const { editedServiceName, editedServicePrice, editedCommissionFee, editedDuration, servico_Id } = req.body;

  // Construa a query base para atualização dos dados
  let query = `UPDATE servico SET`;

  // Array para armazenar os valores a serem atualizados
  const values = [];

  // Verifique se os campos estão preenchidos e adicione à query
  if (editedServiceName) {
    query += ` name = ?,`;
    values.push(editedServiceName);
  }
  if (editedServicePrice) {
    query += ` preco = ?,`;
    values.push(editedServicePrice);
  }
  if (editedCommissionFee) {
    query += ` commission_fee = ?,`;
    values.push(editedCommissionFee);
  }
  if (editedDuration) {
    query += ` duracao = ?,`;
    values.push(editedDuration);
  }

  // Remova a última vírgula da query
  query = query.slice(0, -1);

  // Adicione as condições WHERE na query
  query += ` WHERE id = ? AND barbearia_id = ? AND professional_id = ?`;
  values.push(servico_Id, barbeariaId, professionalId);

  // Execute a query para atualizar os dados do serviço
  db.query(query, values, (err, result) => {
    if (err) {
      console.error("Erro ao atualizar informações do serviço:", err);
      res.status(500).json({ Success: "Error", Message: "Erro ao atualizar informações do serviço" });
    } if(result) {
      res.status(200).json({ Success: "Success"});
    }
  });
});

// Rota para deletar um serviço específico
app.delete('/api/v1/deleteService/:barbeariaId/:professionalId/:servicoId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const servicoId = req.params.servicoId;

  const sql="DELETE FROM servico WHERE id = ? AND barbearia_id = ? AND professional_id = ?";
  db.query(sql, [servicoId, barbeariaId, professionalId], (err, result) => {
    if(err){
      console.error('Erro ao excluir o serviço:', err);
      return res.status(500).json({ Error: "Error" });
    }
    if(result){
      res.status(200).json({ Success: "Success"});
    }
  })
});

//Route to create link between barbearia and professional
app.post('/api/v1/sendNotificationToProfe', AuthenticateJWT, (req, res) =>{
  
  //get all params send from front-end
  const barbeariaId = req.body.barbeariaId;
  const professionalId = req.body.professionalId;

  const sql="INSERT INTO notificationProfessional (barbearia_id, professional_id) VALUES (?, ?)";
  db.query(sql, [barbeariaId, professionalId], (err, result) =>{
    if(err){
      console.error('Erro ao salvar solicitação de vinculo:', err);
      return res.status(500).json({ Error: "Error" });
    }else{
      if(result){
        return res.status(200).json({ Message: "True"});
      }
    }
  })
});

//Route to get all link requests for a specific barbershop
app.get('/api/v1/notificationToBarb/:barbeariaId/:professional_id', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professional_id;

  const sql="SELECT * FROM notificationProfessional WHERE barbearia_id = ? AND professional_id = ?";
  db.query(sql, [barbeariaId, professionalId], (err, result) =>{
    if(err){
      console.error('Erro ao buscar solicitação de vinculo:', err);
      return res.status(500).json({ Error: "Error" });
    }else{
      if(result.length > 0){
        return res.status(200).json({ Success: "true"});
      }else{
        return res.status(200).json({ Success: "false"});
      }
    }
  })
})

//Route to get all link requests for a specific professional  
app.get('/api/v1/notificationToProfe/:professional_id', AuthenticateJWT, (req, res) =>{
  const professionalId = req.params.professional_id;

  const sql=`SELECT notificationProfessional.barbearia_id AS barbeariaId,
                    barbearia.name AS nameBarbearia,
                    barbearia.banner_main AS bannerBarbearia,
                    barbearia.rua AS ruaBarbearia,
                    barbearia.N AS nRuaBarbearia,
                    barbearia.bairro AS bairroBarbearia,
                    barbearia.cidade AS cidadeBarbearia
              FROM notificationProfessional
              INNER JOIN barbearia ON barbearia.id = notificationProfessional.barbearia_id
              WHERE professional_id = ?`;

  db.query(sql, [professionalId], (err, result) =>{
    if(err){
      console.error('Erro ao buscar solicitação de vinculo:', err);
      return res.status(500).json({ Error: "Error" });
    }else{
      if(result.length > 0){
        return res.status(200).json({ Success: "true", AllNotification: result});
      }else{
        return res.status(200).json({ Success: "false"});
      }
    }
  })
})

//Route to create a new professional
app.post('/api/v1/createProfessional', AuthenticateJWT, (req, res) => {
  
  const barbeariaId = req.body.barbeariaId;
  const newNameProfessional = req.body.newNameProfessional;
  const newPhoneProfessional = req.body.newPhoneProfessional;
  const newEmailProfessional = req.body.newEmailProfessional;
  const newPasswordProfessional = req.body.newPasswordProfessional;
  const fakeNameUserImage = 'default.png';

  // Verifica se newNameProfessional contém apenas letras maiúsculas e minúsculas
  if (!isNameValided(newNameProfessional)) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se newPhoneProfessional contém apenas letras maiúsculas e minúsculas
  if (!isOnlyNumberValided(newPhoneProfessional)) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se newEmailProfessional contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(newEmailProfessional)) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se newPasswordProfessional contém apenas letras maiúsculas e minúsculas
  if (!isPasswordValided(newPasswordProfessional)) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql="SELECT name, email, cell_phone FROM professional WHERE name = ? OR email = ? OR cell_phone = ?";
  db.query(sql, [newNameProfessional, newEmailProfessional, newPasswordProfessional], (err, resul) =>{
    if(err){
      console.error('Erro ao verificar token do profissional:', err);
      return res.status(500).json({ Error: "Error" });
    }
    if(resul.length > 0){
      return res.status(401).json({ Unauthorized: "Unauthorized"});
    }else{
      const sqlInsertOnProfessional="INSERT INTO professional (name, email, password, cell_phone, user_image) VALUES (?, ?, ?, ?, ?);"
      db.query(sqlInsertOnProfessional, [newNameProfessional, newEmailProfessional, newPasswordProfessional, newPhoneProfessional, fakeNameUserImage], (erro, result) =>{
        if(erro){
          console.error('Erro ao criar profissional:', erro);
          return res.status(500).json({ Error: "Error" });
        }else{
          if(result){
            const sqlGetProfessionalId="SELECT id FROM professional WHERE email = ?";
            db.query(sqlGetProfessionalId, [newEmailProfessional], (error, resulta) =>{
              if(error){
                console.error('Erro ao buscar id do profissional:', error);
                return res.status(500).json({ Error: "Error" });
              }else{
                if(resulta.length > 0){
                  const professionalId = resulta[0].id;
                  const sqlInsertOnBarbProfessional="INSERT INTO Barb_Professional (barbearia_id, professional_id) VALUES (?, ?);"
                  db.query(sqlInsertOnBarbProfessional, [barbeariaId, professionalId], (problem, resultado) =>{
                    if(problem){
                      console.error('Erro ao criar vinculo do profissional com a barbearia:', error);
                      return res.status(500).json({ Error: "Error" });
                    }
                    if(resultado){
                      return res.status(200).json({ Success: "Success"});
                    }
                  })
                }
              }
            })
          }
        }
      })
    }
  })
});

//Route to accept notification
app.post('/api/v1/acceptNotification', AuthenticateJWT, (req, res) => {
    const barbeariaId = req.body.barbeariaId;
    const professionalId = req.body.professionalId;
    const sql="INSERT INTO Barb_Professional (barbearia_id, professional_id) VALUES (?, ?)"
    db.query(sql, [barbeariaId, professionalId], (err, resul) =>{
      if(err){
        console.error('Erro ao criar vinculo do profissional com a barbearia:', err);
        return res.status(500).json({ Error: "Error" });
      }
      if(resul){
        const sqlDelete = "DELETE FROM notificationProfessional WHERE barbearia_id = ? AND professional_id = ?"
        db.query(sqlDelete, [barbeariaId, professionalId], (erro, result) =>{
          if(erro){
            console.error('Erro ao apagar notificação:', erro);
            return res.status(500).json({ Error: "Error" });
          }else{
            if(result){
              return res.status(200).json({ Success: "Success"});
            }
          }
        })
      }
    })
})

//Rota para obter os profissionais da barbearia em específico
app.get('/api/v1/listProfessionalToBarbearia/:barbeariaId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;

  const sql=`SELECT professional.id,
                    professional.name,
                    professional.cell_phone,
                    professional.user_image
              FROM professional
              INNER JOIN Barb_Professional
              ON barbearia_id = ? AND professional.id = professional_id`

  db.query(sql, [barbeariaId], (err, result) =>{
    if(err){
      console.error('Erro ao buscar profissionais da barbearia:', err);
      return res.status(500).json({ Error: 'Erro ao buscar profissionais da barbearia:' });
    }
    if(result){
      //console.log(result)
      return res.status(200).json({ Success: "Success", Professional: result});//Enviando o array com os profissionais
    }
  })
});

//Route to gell especific barbshop to professional
app.get('/api/v1/listBarbeariaToProfessional/:professionalId', AuthenticateJWT, (req, res) => {
  const professionalId = req.params.professionalId;

  const sql=`SELECT barbearia_id AS barbeariaId,
                barbearia.name AS nameBarbearia,
                barbearia.status AS statusBarbearia
             FROM Barb_Professional
             INNER JOIN barbearia ON barbearia.id = Barb_Professional.barbearia_id
             WHERE professional_id = ?`

  db.query(sql, [professionalId], (err, result) =>{
    if(err){
      console.error('Erro ao buscar barbearias do profissional:', err);
      return res.status(500).json({ Error: 'Erro ao buscar barbearias do profissional:' });
    }
    if(result.length > 0){
      return res.status(200).json({ Success: "Success", Barbearias: result});//Enviando o array com os profissionais
    }
  })
});

//Route to get all professional
app.get('/api/v1/listProfessional/:searchProfessional', AuthenticateJWT, (req, res) => {
  const searchProfessional = req.params.searchProfessional;

  const sql = "SELECT id, name, user_image, cell_phone, email FROM professional WHERE name = ?";
  db.query(sql, [searchProfessional], (err, result) =>{
    if(err){
      console.error('Erro ao buscar profissionais:', err);
      return res.status(500).json({ Error: 'Erro ao buscar profissionais.' });
    }else{
      if(result.length > 0){
        return res.status(200).json({ Message: "True", Professional: result});//Enviando o array com os profissionais
      }else{
        return res.status(200).json({ Message: "false", Professional: result});//Enviando o array com os profissionais
      }
    }
  })
});

//Rota obter os serviços cadastrados
app.get('/api/v1/listService/:barbeariaId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;

  const sql="SELECT * FROM servico WHERE barbearia_id = ?"
  db.query(sql, [barbeariaId], (err, result) =>{
    if(err){
      console.error("Erro ao obter os serviços da barbearia", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }else{
      if(result.length > 0){
        return res.status(200).json({ Success: "Success", result});//Enviando o array com os horários
      }
    }
  })
});

//Rota para realizar o agendamento
app.post('/api/v1/createBooking/', AuthenticateJWT, (req, res) => {
  //Create object to make a toke for booking
  const values = [
    req.body.userId,
    req.body.barbeariaId,
    req.body.professionalId,
    req.body.serviceId,
    req.body.selectedDay,
    req.body.timeSelected];
    const formatDate = req.body.formattedDate;

  const token = values.join('-')

  
  const sqlSelect="SELECT token FROM booking WHERE token = ?";
  db.query(sqlSelect, [token], (err, resut) =>{
    if(err){
      console.error('Erro ao verificar disponibilidade da barbearia:', err);
      return res.status(500).json({ Error: 'Erro ao verificar disponibilidade da barbearia.' });
    }
    if(resut.length > 0){
      return res.status(401).json({ Unauthorized: 'Unauthorized' });
    }else{
      const sqlInsert = "INSERT INTO booking (user_id, barbearia_id, professional_id, service_id, booking_date, booking_time, date, token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)";
      db.query(sqlInsert, [...values, formatDate, token], (erro, results) => {
        if(erro){
          console.error('Erro ao realizar agendamento:', erro);
          return res.status(500).json({ Error: ' Internal Server Error' });
        }if(results){
          return res.status(200).json({ Success: "Success"});
        }
      })
    }
  })
});

// Rota para buscar todos os agendamentos de uma barbearia específica
app.get('/api/v1/bookingsTimes/:barbeariaId/:professionalId/:selectedDate', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const selectedDate = req.params.selectedDate;

  const sql = `
        SELECT COALESCE(booking.booking_time, 0) AS timesLocked
        FROM booking
        WHERE booking.barbearia_id = ? 
          AND booking.professional_id = ? 
          AND booking.booking_date = ?
        UNION ALL
        SELECT COALESCE(days_off.times, 0)
        FROM days_off
        WHERE days_off.barbearia_id = ? 
          AND days_off.professional_id = ? 
          AND days_off.day = ?`;

  db.query(sql, [barbeariaId, professionalId, selectedDate, barbeariaId, professionalId, selectedDate], (err, result) => {
    if (err) {
      console.error('Erro ao buscar agendamentos da barbearia:', err);
      return res.status(500).json({ Error: 'Internal Server Error.' }); 
    }else{
      if (result.length > 0) {
        return res.status(200).json({ Message: "true", timesLocked: result });
      }else{
        return res.status(200).json({ Message: "false"});
      }
    }
  });
});

//Route to save days-off
app.put('/api/v1/updateDayOff/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const selectedDay = req.body.selectedDay;
  const timesLockedByProfessional = req.body.timesLocked;

  const sql="SELECT * FROM days_off WHERE barbearia_id = ? AND professional_id = ? AND day = ?";
  db.query(sql, [barbeariaId, professionalId, selectedDay], (err, resu) =>{
    if(err){
      console.error("Erro ao obter folgas do professional", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    if(resu.length > 0){
      const sqlUpdate="UPDATE days_off SET times = ? WHERE barbearia_id = ? AND professional_id = ? AND day = ?";
        db.query(sqlUpdate, [timesLockedByProfessional, barbeariaId, professionalId, selectedDay], (erro, resul) =>{
          if(erro){
            console.error("Erro ao atualizar folgas do professional", err);
            return res.status(500).json({ Error: "Internal Server Error" });
          }else{
            return res.status(200).json({ Success: "Success", resul});//Enviando o array com os horários
          }
        })
    }else{
      const sqlInsert="INSERT INTO days_off SET barbearia_id = ?, professional_id = ?, day = ?, times = ?";
      db.query(sqlInsert, [barbeariaId, professionalId, selectedDay, timesLockedByProfessional], (error, result) =>{
        if(error){
          console.error("Erro ao salvar folga do professional", error);
          return res.status(500).json({ Error: "Internal Server Error" });
        }else{
          if(result){
            return res.status(200).json({ Success: "Success", result});//Enviando o array com os horários
          }
        }
      })
    }
  })
});

//Route to get bookings of barbearia
app.get('/api/v1/bookings/:barbeariaId/:selectedDate', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const selectedDate = req.params.selectedDate;

  const sql=`
        SELECT
          user.id AS user_id,
          user.name user_name,
          user.celular AS user_phone,
          booking.id AS booking_id,
          booking.booking_time AS booking_time,
          professional.id AS professional_id,
          professional.name AS professional_name,
          servico.id AS service_id,
          servico.name AS service_name,
          servico.preco AS service_price,
          servico.duracao AS service_duration,
          servico.commission_fee AS service_commission_fee
      FROM user
      INNER JOIN booking ON user.id = booking.user_id AND booking.barbearia_id = ? AND booking.booking_date = ?
      INNER JOIN professional ON professional.id = booking.professional_id
      INNER JOIN servico ON servico.id = booking.service_id`;
      db.query(sql, [barbeariaId, selectedDate], (err, result) =>{
        if(err){
          console.error("Erro ao obter agendamentos", err);
          return res.status(500).json({ Error: "Internal Server Error" });
        }else{
          if(result.length > 0){
            return res.status(200).json({ Message: "true", bookings: result });
          }else{
            return res.status(200).json({ Message: "false"});
          }
        }
      })
})

//Route to get bookings of professional
app.get('/api/v1/professionalBookings/:barbeariaId/:professionalId/:selectedDate', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const selectedDate = req.params.selectedDate;

  const sql=`
        SELECT
          user.id AS user_id,
          user.name user_name,
          user.celular AS user_phone,
          booking.id AS booking_id,
          booking.booking_time AS booking_time,
          professional.id AS professional_id,
          professional.name AS professional_name,
          servico.id AS service_id,
          servico.name AS service_name,
          servico.preco AS service_price,
          servico.duracao AS service_duration,
          servico.commission_fee AS service_commission_fee
      FROM user
      INNER JOIN booking ON user.id = booking.user_id AND booking.barbearia_id = ? AND booking.booking_date = ?
      INNER JOIN professional ON professional.id = ?
      INNER JOIN servico ON servico.id = booking.service_id`;
      db.query(sql, [barbeariaId, selectedDate, professionalId], (err, result) =>{
        if(err){
          console.error("Erro ao obter agendamentos", err);
          return res.status(500).json({ Error: "Internal Server Error" });
        }else{
          if(result.length > 0){
            return res.status(200).json({ Message: "true", bookings: result });
          }else{
            return res.status(200).json({ Message: "false"});
          }
        }
      })
})

// Inicia o servidor na porta especificada
app.listen(port, () => {
    console.log("Servidor rodando");
  });
