// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from "body-parser";

import mysql from "mysql2";

import jwt  from 'jsonwebtoken';
import AuthenticateJWT from './AuthenticateJWT.js'

import { MercadoPagoConfig, Payment } from 'mercadopago';
import { v4 as uuidv4 } from 'uuid';

import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

import morgan from 'morgan';
import winston from 'winston';
import UAParser from 'ua-parser-js';
import rateLimit from 'express-rate-limit';

import axios from 'axios';
//import { serveSwaggerUI, setupSwaggerUI } from './swaggerConfig.js';

import 'dotenv/config'

const app = express();
// Configurar a confiança no proxy
app.set('trust proxy', 1);

const currentDateTime = new Date();
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
  windowMs: 3 * 60 * 1000, // 15 minutos
  max: 100000, // Limite de 100 requisições por IP
  message: 'Error in request'
});

const port = process.env.PORT || 3000;

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.LOCALHOST_URL,
];

const corsOptions = {
  origin: function (origin, callback) {
    // Verifica se a origem está na lista de URLs permitidas
    if (allowedOrigins.includes(origin) || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  optionsSuccessStatus: 200 // Algumas versões de navegador podem precisar desse código
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
const isNameValided = (input) => /^[a-zA-Z\sçéúíóáõãèòìàêôâ]+$/.test(input);
const isOnlyNumberValided = (input) => /^[0-9]*$/.test(input);
const isEmailValided = (input) => /^[a-z0-9.@]+$/i.test(input);
const isPasswordValided = (input) => /^[a-zA-Z0-9@.#%]+$/.test(input);
const isSignUpBarbeariaValid = (input) => /^[a-zA-Z\sçéúíóáõãèòìàêôâ.!?+]*$/.test(input);


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
app.post("/api/v1/SignUp", (req, res) => {
  const { name, email, senha, celular } = req.body;

  // Verifica se name contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(name) && name.length > 30) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se email é válido
  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if(isValidEmail){
    if (!isEmailValided(email)) {
      return res.status(400).json({ error: 'Error in values' });
    }
  }
  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(senha) && senha.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }
  if (!isOnlyNumberValided(celular) && celular.length > 11 || celular.length < 10 ) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verificação se o e-mail ou o número de celular já estão cadastrado
  db.query('SELECT id, name, email, celular, user_image FROM user WHERE email = ? OR celular = ?', [email, celular], (error, results) => {
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
      celular,
      user_image: 'default.jpg'
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
app.post('/api/v1/SignIn', (req, res) => {
  const {email, senha} = req.body;

  // Buscar usuário pelo email
  db.query('SELECT id, name, email, celular, user_image FROM user WHERE email = ? AND senha = ?', [email, senha],
  (err, result) => {
    if(err){
      res.send({err: err});
    }
    if (result.length > 0) {
      const user = result[0];
      // Criação do token
      const token = jwt.sign({ userId: user.id, userEmail: user.email }, process.env.TOKEN_SECRET_WORD_OF_USER_CLIENT, { expiresIn: "3h" });
      // Envie o token no corpo da resposta
      res.status(200).json({ success: true, token: token, user: result });
      
    } else {
      // Usuário não encontrado
      res.status(404).json({success: false, message: 'Usuário não encontrado'});
    }
  });
});

//Route to get user image #VERIFIED
app.get('/api/v1/userImage', AuthenticateJWT, (req, res) =>{
  const userId = req.query.userId; 

  const sql = "SELECT user_image FROM user WHERE id = ?";
  db.query(sql, [userId], async (err, result) => {
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

//update user image on AWS S3  #VERIFIED
app.put('/api/v1/updateUserImage', AuthenticateJWT, upload.single('image'), (req, res) => {
  const userId = req.body.userId;
  const newImageUser = req.file.originalname;
  const password = req.body.password;


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

  //formating the name of image sent
  const nameImgaSubstring = newImageUser.substring(0, 22)
  const formatNameImage = `userClient_${userId}_${currentDateTime.getFullYear()}${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}${currentDateTime.getDate().toString().padStart(2, '0')}_`;

  //verify if pre-fix name is valided
  if(nameImgaSubstring != formatNameImage){
    console.error('Error to update image')
    return res.status(400).json({ error: 'name are not allowed'});
  }

  //Buscando imagem atual salva no BD MySQL
  const currentImg = "SELECT user_image FROM user WHERE id = ? AND senha = ?";
  db.query(currentImg, [userId, password], (err, result) => {
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
          return res.status(500).json({ error: 'Send Update Image - Internal Server Error' });
        }
        if(sendResult){
          //Atualizando a coluna 'user_image' com a nova imagem do usuário
          const sql = "UPDATE user SET user_image = ? WHERE id = ? AND senha = ?";
          db.query(sql, [newImageUser, userId, password], (updateErr, updateResult) => {
            if (updateErr) {
              //Mensagem de erro caso não seja possuível realizar a atualização da imagem no Banco de Dados
              console.error('Error on Update Image:', updateErr);
              return res.status(500).json({ error: 'Update Image - Internal Server Error' });
            }
            if(updateResult){
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

//Route to get user data #VERIFIED
app.get('/api/v1/getUserData/:userId', AuthenticateJWT, (req, res) => {
  const userId = req.params.userId;
  
  const sql = "SELECT name, email, celular FROM user WHERE id = ?";
  db.query(sql, [userId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar os dados dos do usuário", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        return res.status(200).json({ User: result});
      }
    }
  })
})

// Route to update information of professional #VERIFIED
app.put('/api/v1/updateUserData', AuthenticateJWT, (req, res) => {
  const userId = req.body.userId;
  const confirmPassword = req.body.confirmPassword;
  const newName = req.body.newName;
  const newEmail = req.body.newEmail;
  const newPhoneNumber = req.body.newPhoneNumber;

  
  if (!isPasswordValided(confirmPassword) && confirmPassword.length < 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  let query = `UPDATE user SET`
  const values = [];

  if(newName){
    if (!isSignUpBarbeariaValid(newName) && newName.length > 30) {
      return res.status(400).json({ error: 'Error in values' });
    }
    query += ` name = ?,`;
    values.push(newName);
  }
  if(newEmail){
    if (!isEmailValided(newEmail)) {
      return res.status(400).json({ error: 'Error in values' });
    }
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
    if(isValidEmail){
      query += ` email = ?,`;
      values.push(newEmail);
    }
  }
  if(newPhoneNumber){
    if (!isOnlyNumberValided(newPhoneNumber) && newPhoneNumber.length > 11 || newPhoneNumber.length < 10) {
      return res.status(400).json({ error: 'Error in values' });
    }
    query += ` celular = ?,`;
    values.push(newPhoneNumber);
  }
  
  // Remova a última vírgula da query
  query = query.slice(0, -1);

  query += ` WHERE id = ? AND senha = ?`;
  values.push(userId, confirmPassword)

  db.query(query, values, (err, result) =>{
    if(err){
      console.error("Erro ao atualizar informações do profissional", err);
      return res.status(500).json({Error: "Internal Server Error"});
    } else {
      if(result.changedRows === 1) {
        return res.status(200).json({ Success: "Success" });
      }else{
        return res.status(200).json({ Success: "Falied" });
      }
    }
  });
});

//Rota para atualizar a senha de usuário da barbearia
app.put('/api/v1/updateUserPassword', AuthenticateJWT, (req, res) => {
  const userId = req.body.userId;
  const passwordConfirm = req.body.passwordConfirm;
  const newPassword = req.body.newPassword;

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(passwordConfirm) && passwordConfirm.length < 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(newPassword) && newPassword.length < 8) {
    return res.status(400).json({ error: 'Error in values' });
  }
  
  const sql = "SELECT senha FROM user WHERE id = ? AND senha = ?";
  db.query(sql, [userId, passwordConfirm], (err, result) => {
    if(err) {
      console.error("Erro ao comparar senha de usuário", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    if(result.length > 0) {
      const sql = "UPDATE user SET senha = ? WHERE id = ?";
      db.query(sql, [newPassword, userId], (err, result) =>{
        if(err){
          console.error("Erro ao atualizar a senha de usuário", err);
          return res.status(500).json({Error: "Internal Server Error"});
        }
        if(result){
          return res.status(201).json({ Success: "Success"});
        }
      })
    }else{
      return res.status(200).json({ Success: "Falied"});
    }
  })
});

//Route to get all barbearias
app.get('/api/v1/getAllBarbearias', AuthenticateJWT, async (req, res) => {
  try {
    const sql=`SELECT barbearia.id AS barbearia_id,
                      barbearia.name AS nameBarbearia,
                      barbearia.status AS statusBarbearia,
                      barbearia.banner_main AS bannerBarbearia,
                      barbearia.rua AS ruaBarbearia,
                      barbearia.N AS NruaBarbearia,
                      barbearia.bairro AS bairroBarbearia,
                      barbearia.cidade AS cidadeBarbearia,
                      averageAvaliations.totalAvaliations AS totalAvaliationsBarbearia,
                      averageAvaliations.average AS averageAvaliationsBarbearia
                  FROM barbearia
                  LEFT JOIN averageAvaliations ON averageAvaliations.barbearia_id = barbearia.id`;
    db.query(sql, (err, resul) => {
      if (err){
        console.error("Erro ao buscar barbearias:", err);
        return res.status(500).json({ Success: "Error", Message: "Erro ao buscar barbearias" });
      }
      if(resul.length > 0){
        db.query('SELECT name, barbearia_id FROM servico', (erro, result) => {
          if(erro) {
            console.error("Erro ao buscar nome dos serviços", erro);
            return res.status(500).json({Error: "Internal Server Error"});
          }
          if(result.length > 0){
            const combineData = (barbearias, servicos) => {
              return barbearias.map(barbearia => {
                // Filtra os serviços que pertencem à barbearia atual
                const servicosDaBarbearia = servicos.filter(servico => servico.barbearia_id === barbearia.barbearia_id);
                // Adiciona os serviços ao objeto da barbearia
                return { ...barbearia, servicos: servicosDaBarbearia };
              });
            };
            
            const barbeariasComServicos = combineData(resul, result);
            return res.status(200).json({barbearias: barbeariasComServicos});
          }
        })
      }
      
    });
  } catch (error) {
    console.error('Erro ao obter os registros:', error);
    res.status(500).json({ success: false, message: 'Erro ao obter os registros' });
  }
});

//Route to get a specific barbearia
app.get('/api/v1/barbeariaDetails/:barbeariaId', (req, res) =>{
  const barbeariaId = req.params.barbeariaId;

  const sql=`SELECT barbearia.id AS barbearia_id,
                    barbearia.name AS nameBarbearia,
                    barbearia.status AS statusBarbearia,
                    barbearia.banners AS bannersBarbearia,
                    barbearia.rua AS ruaBarbearia,
                    barbearia.N AS NruaBarbearia,
                    barbearia.bairro AS bairroBarbearia,
                    barbearia.cidade AS cidadeBarbearia,
                    averageAvaliations.totalAvaliations AS totalAvaliationsBarbearia,
                    averageAvaliations.average AS averageAvaliationsBarbearia
                FROM barbearia
                LEFT JOIN averageAvaliations ON averageAvaliations.barbearia_id = barbearia.id
                WHERE barbearia.id = ?`;
  db.query(sql, [barbeariaId], (err, resul) =>{
    if (err){
      console.error("Erro ao buscar barbearia:", err);
      return res.status(500).json({ Success: "Error", Message: "Erro ao buscar barbearia" });
    }
    if(resul.length > 0){
      return res.status(200).json({barbearia: resul});
    }
  })

})
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
app.post("/api/v1/saveAvaliation", AuthenticateJWT, (req, res) => {
  const comment = req.body.comment;
  const barbeariaId = req.body.barbeariaId
  const averageAvaliatio = req.body.avaliation; //this for the first avaliation

  if (!isSignUpBarbeariaValid(comment) && comment.length > 200) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const values = [
    req.body.user_id, 
    req.body.barbeariaId, 
    req.body.avaliation, 
    comment,
    req.body.currentDate
  ]
  
  const sql = "INSERT INTO avaliations (`user_id`,`barbearia_id`, `estrelas`, `comentarios`, `data_avaliacao`) VALUES (?)";
  db.query(sql, [values], (err, resul) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ success: false, message: 'Erro ao registrar avaliação' });
    }
    if(resul){
      const sqlVerifyFirstAvaliation = 'SELECT * FROM averageAvaliations WHERE barbearia_id = ?';
      db.query(sqlVerifyFirstAvaliation, [barbeariaId], (erro, result) =>{
        if(erro){
          console.error(erro);
          return res.status(500).json({ success: false, message: 'Erro ao verificar primeira avaliação' });
        }
        if(result.length < 1){
          const totalAvaliations = 1;
          
          const sqlInsertFirstAverageAvaliation = "INSERT INTO averageAvaliations (`barbearia_id`,`totalAvaliations`, `average`) VALUES (?, ?, ?)";
          db.query(sqlInsertFirstAverageAvaliation, [barbeariaId, totalAvaliations, averageAvaliatio], (error, resultFinal) =>{
            if(error){
              console.error(erro);
              return res.status(500).json({ success: false, message: 'Erro ao inserir primeira média de avaliação' });
            }
            if(resultFinal){
              return res.status(201).json({ Success: 'true', message: 'Avaliação registrada com sucesso' });
            }
          })
        }else{
          return res.status(201).json({ Success: 'true', message: 'Avaliação registrada com sucesso' });
        }
      })
    }
  });
});

//Buscando a avaliação da barbearia em especifico
app.get('/api/v1/allAvaliation/:barbeariaId', (req, res)=>{
  const barbeariaId = req.params.barbeariaId;

  const sql=`SELECT avaliations.id,
                    avaliations.user_id,
                    avaliations.barbearia_id,
                    avaliations.estrelas,
                    avaliations.comentarios,
                    avaliations.data_avaliacao,
                    user.name AS userName,
                    user.user_image AS userImage
              FROM avaliations
              INNER JOIN user ON user.id = avaliations.user_id
              WHERE barbearia_id = ?`;

    db.query(sql, [barbeariaId], (err, resultAllAvaliations) => {
      if (err){
        console.error("Erro ao buscar avaliações:", err);
        return res.status(500).json({ Success: "Error", Message: "Erro ao buscar avaliações" });
      }
      if(resultAllAvaliations.length > 0) {
          const totalAvaliation = resultAllAvaliations.length;//get the number of avaliations
          const valuesOfAllavaliations = resultAllAvaliations.map(star =>  Number (star.estrelas))//get the values of all avaliations
          const sumAllavaliation = valuesOfAllavaliations.reduce((sum, avaliation) => { //adding all values of avaliations
            return sum + avaliation;
          }, 0);

          const averageAvaliation = sumAllavaliation / totalAvaliation;

          if(averageAvaliation){
            const sqlUpdateAvaliation = 'UPDATE averageAvaliations SET totalAvaliations = ?, average = ? WHERE barbearia_id = ?';
            db.query(sqlUpdateAvaliation, [totalAvaliation, averageAvaliation.toFixed(1), barbeariaId], (erro, result) => {
              if (erro){
                console.error("Erro ao atualizar a média de avaliações:", erro);
                return res.status(500).json({ Success: "Error", Message: "Erro ao buscar avaliações" });
              }
              if(result){
                //function to order AllAvaliation by date
                function orderAllAvaliations(AllAvaliation) {
                  AllAvaliation.sort((a, b) =>{
                      //Date and time of A
                      const fullDateOfAvaliationA = a.data_avaliacao;
                      const onlyNumberofDateA = fullDateOfAvaliationA.replace(/[^0-9]/g, '');

                      //Date and time of B
                      const fullDateOfAvaliationB = b.data_avaliacao;
                      const onlyNumberofDateB = fullDateOfAvaliationB.replace(/[^0-9]/g, '');

                      //Transforming dates in Numbers
                      const valuesDateAllAvaliationsA = Number (onlyNumberofDateA);
                      const valuesDateAllAvaliationsB = Number (onlyNumberofDateB);

                      //Verication of dates
                      if(valuesDateAllAvaliationsA < valuesDateAllAvaliationsB){
                          return 1;
                      }else if(valuesDateAllAvaliationsA > valuesDateAllAvaliationsB){
                          return -1;
                      }else{
                          0;
                      }
                  }) 
                }
                orderAllAvaliations(resultAllAvaliations)
                return res.status(200).json({ AllAvaliation: resultAllAvaliations, AverageAvaliation: averageAvaliation});
              }
            })
          }
      }
    });    
});

app.get('/api/v1/bookingsOfUser/:userId', AuthenticateJWT, (req, res) =>{
  const userId = req.params.userId;

  const sql=`SELECT bookings.booking_date AS bookingDate,
                    bookings.booking_time AS bookingTime,
                    bookings.date_created AS dateMakedBooking,
                    bookings.payment_id AS payment_id,
                    barbearia.name AS barbeariaName,
                    barbearia.banner_main AS bannerBarbearia,
                    barbearia.rua AS ruaBarbearia,
                    barbearia.N AS NruaBarbearia,
                    barbearia.bairro AS bairroBarbearia,
                    barbearia.cidade AS cidadeBarbearia,
                    professional.name AS professionalName,
                    professional.cell_phone AS professionalPhone,
                    professional.user_image AS userImageProfessional,
                    servico.name AS serviceName,
                    servico.preco AS servicePrice
              FROM bookings
              INNER JOIN barbearia ON barbearia.id = bookings.barbearia_id
              INNER JOIN professional ON professional.id = bookings.professional_id
              INNER JOIN servico ON servico.id = bookings.service_id
              LEFT JOIN payments ON payments.id = bookings.payment_id
              WHERE bookings.user_id = ?
                AND (payments.status = 'approved' OR bookings.payment_id = 0);`;

  db.query(sql, [userId], (err, result) =>{
    if(err){
      console.error("Error in search bookings of user", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    if(result.length > 0){
      //list of month with your values
      const numbersMonth = {
        Jan: 1,
        Fev: 2,
        Mar: 3,
        Abr: 4,
        Maio: 5,
        Jun: 6,
        Jul: 7,
        Ago: 8,
        Set: 9,
        Out: 10,
        Nov: 11,
        Dez: 12
    }
      //function to order bookings
      function orderBookings(booking) {
        booking.sort((a, b) =>{
            //========== Elemento A ==========
            //obtendo o mês e o ano do agandamento
            const yearBookingA = Number (a.bookingDate.substring(17).replace(/[^0-9]/g, ''));
            const monthBookingA = a.bookingDate.match(/(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)/g, '');
            const monthAndYearBookingsA = Number (`${numbersMonth[monthBookingA]}` + `${yearBookingA}`);
            //obtendo o dia do agendamento
            const bookingDayA = Number (a.bookingDate.split(', ')[1].split(' ')[0]);
            //Obtendo o horário inicial do agendamento
            const bookingTimesA = Number (a.bookingTime.split(',')[a.bookingTime.split(',').length-1].replace(/[^0-9]/g, ''));
            
            //========== Elemento B ==========
            //obtendo o mês e o ano do agandamento
            const yearBookingB = Number (b.bookingDate.substring(17).replace(/[^0-9]/g, ''));
            const monthBookingB = b.bookingDate.match(/(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)/g, '');
            const monthAndYearBookingsB = Number (`${numbersMonth[monthBookingB]}` + `${yearBookingB}`);
            //obtendo o dia do agendamento
            const bookingDayB = Number (b.bookingDate.split(', ')[1].split(' ')[0]);
            //Obtendo o horário inicial do agendamento
            const bookingTimesB = Number (b.bookingTime.split(',')[b.bookingTime.split(',').length-1].replace(/[^0-9]/g, ''));

            
            if(monthAndYearBookingsA === monthAndYearBookingsB){
                if(bookingDayA === bookingDayB){
                    if(bookingTimesA < bookingTimesB){
                        return 1
                    }else{
                        return -1
                    }
                }else if(bookingDayA < bookingDayB){
                        return 1
                    }else{
                        return -1
                    }
            }else if(monthAndYearBookingsA < monthAndYearBookingsB){
                    return 1
            }else{
                    return -1
            }
        }) 
    }
      orderBookings(result);
      return res.status(200).json({Success: "Success", Bookings: result});
    }
    if(result.length === 0){
      return res.status(200).json({Success: "Success", Bookings: 0});
    }
  })
})

//====================================== Routes about Payments ======================================
//Route to save access token
app.put('/api/v1/saveCredentials', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const access_token = req.body.access_token;
  const refresh_token = req.body.refresh_token;
  const data_renovation = req.body.data_renovation;

  const sqlSelect = 'SELECT date_renovation FROM BarbeariaCredentials WHERE barbearia_id = ?'
  db.query(sqlSelect, [barbeariaId], (err, resu) =>{
    if(err){
      console.error('Error on verify credentials:', err);
      return res.status(500).json({ error: 'on verify credentials - Internal Server Error' });
    }
    if(resu.length > 0){//if the barbershop has the credentials
      const sqlUpdate='UPDATE BarbeariaCredentials SET access_token = ?, refresh_token = ?, date_renovation = ? WHERE barbearia_id = ?';
      db.query(sqlUpdate, [access_token, refresh_token, data_renovation, barbeariaId], (erro, resul) =>{
        if(erro){
          console.error('Error on update credentials:', erro);
          return res.status(500).json({ error: 'update credentials - Internal Server Error' });
        }
        if(resul){
          return res.status(200).json({Success: 'Success'})
        }
      })
    }else{//if the barbershop don't have the credentials
      const sqlInsert = 'INSERT INTO BarbeariaCredentials (barbearia_id, access_token, refresh_token, date_renovation) VALUES (?, ?, ?, ?)';
      db.query(sqlInsert, [barbeariaId, access_token, refresh_token, data_renovation], (error, result) =>{
        if(error){
          console.error('Error on save credentials:', error);
          return res.status(500).json({ error: 'save credentials - Internal Server Error' });
        }
        if(result){
          return res.status(200).json({Success: 'Success'})
        }
      })
    }
  })
})

//Route to get access token of barbearia
app.get('/api/v1/barbeariaCredentials/:barbeariaId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;

  const sql = 'SELECT access_token, refresh_token, date_renovation FROM BarbeariaCredentials WHERE barbearia_id = ?';
  db.query(sql, [barbeariaId], (err, resul) =>{
    if(err){
      console.error("Error in search access token of user", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    if(resul.length > 0){
      return res.status(200).json({Success: true, credentials: resul});
    }else{
      return res.status(200).json({Success: false, Message: 'barbeaia não está habilitada para receber pagamentos'});
    }
  })
})

//Route to Create payment
app.post('/api/v1/payment', AuthenticateJWT, (req, res) =>{
const accessTokenBarbearia = req.body.accessTokenBarbearia;

const { transaction_amount, description, paymentMethodId, email, identificationType, number } = req.body;//To create payment
const { userId, barbeariaId, professionalId, serviceId } = req.body;//To save payment

const client = new MercadoPagoConfig({
  accessToken: accessTokenBarbearia,
  options: {
    timeout: 5000,
    idempotencyKey: 'abc'
  }
});

const payment = new Payment(client);

const expirationDate = new Date();
expirationDate.setMinutes(expirationDate.getMinutes() + 7); // Adiciona 7 minutos à data atual

const pad = (num) => String(num).padStart(2, '0');

// Formatar data no padrão ISO 8601 com fuso horário
const year = expirationDate.getFullYear();
const month = pad(expirationDate.getMonth() + 1);
const day = pad(expirationDate.getDate());
const hours = pad(expirationDate.getHours());
const minutes = pad(expirationDate.getMinutes());
const seconds = pad(expirationDate.getSeconds());
const milliseconds = String(expirationDate.getMilliseconds()).padStart(3, '0');

// Obter o offset do fuso horário
const timezoneOffset = -expirationDate.getTimezoneOffset();
const sign = timezoneOffset >= 0 ? '+' : '-';
const offsetHours = pad(Math.floor(Math.abs(timezoneOffset) / 60));
const offsetMinutes = pad(Math.abs(timezoneOffset) % 60);

  // Montar data final
  const dateOfExpiration = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${sign}${offsetHours}:${offsetMinutes}`;

  const body = { 
    transaction_amount: Number(transaction_amount),
    description: description,
    payment_method_id: paymentMethodId,
    payer: {
      email: email,
      identification: {
        type: identificationType,
        number: number
      }
    },
    date_of_expiration: dateOfExpiration,
    notification_url: "https://barbeasy.up.railway.app/api/v1/notificationPayment"
  }
  
  const requestOptions = {
    idempotencyKey: uuidv4()
  }

  payment.create({ body, requestOptions })
  .then((response) => {
    const paymentId = response.id;
    const paymentStatus = response.status;
    const date_created = response.date_created;

    const sqlInsert = 'INSERT INTO payments (payment_id,	user_id,	barbearia_id,	professional_id,	service_id,	status,	date_created) VALUES (?, ?, ?, ?, ?, ?, ?)';
    db.query(sqlInsert, [paymentId, userId, barbeariaId, professionalId, serviceId, paymentStatus, date_created], (error, result) =>{
      if(error){
        console.error('Error on insert a new payment:', error);
        return res.status(500).json({ error: 'on insert a new payment - Internal Server Error' });
      }
      if(result){
        const sqlSelect = 'SELECT id FROM payments WHERE payment_id = ?';
        db.query(sqlSelect, [paymentId], (err, resu) =>{
          if(err){
            console.error('Error on selection of id from payments:', error);
            return res.status(500).json({ error: 'on selection of id from payments - Internal Server Error' });
          }
          if(resu.length > 0){
            return res.status(200).json({ Success: true, fullResponse: response, payment_id: resu[0].id});
          }
        })
      }
    })
  })
  .catch((error) => {
    console.error('Erro:', error);
    return res.status(400).json({ Success: false, message: 'Erro ao gerar pagamento', error: error});
  });

})

//Route to update payment status
app.put('/api/v1/updatePaymentStatus', AuthenticateJWT, (req, res) =>{
  const paymentStatus = req.body.PaymentStatus;
  const PaymentId = req.body.PaymentId;

  const sql = 'UPDATE payments SET status = ? WHERE payment_id = ?';
  db.query(sql, [paymentStatus, PaymentId], (err, resu) =>{
    if(err){
      console.error('Error update payment status:', err);
      return res.status(500).json({ error: 'on update payment status - Internal Server Error' });
    }
    if(resu){
      return res.status(200).json({ Success: 'Success'});
    }
  })
})

//Route to update payment status to cancelled
app.post('/api/v1/notificationPayment', (req, res) => {
  const urlGetPayment = 'https://api.mercadopago.com/v1/payments/';

  // Acessa o id diretamente da query string
  const paymentId = req.query.id || req.body.data.id;
  if (paymentId) {
      const sql=`SELECT BarbeariaCredentials.access_token AS access_token
                        FROM BarbeariaCredentials
                        INNER JOIN payments ON payments.barbearia_id = BarbeariaCredentials.barbearia_id
                        WHERE payments.payment_id = ?`;
      db.query(sql, [paymentId], (err, resul) =>{
        if(err){
          console.error('Error update payment status:', err);
          return res.status(500).json({ error: 'on update payment status - Internal Server Error' });
        }
        if(resul.length > 0){
          const accessTokenBarbearia = resul[0].access_token;

          axios.get(`${urlGetPayment}${paymentId}`, {
            headers: {
                'Authorization': `Bearer ${accessTokenBarbearia}`
              }
          }).then(res =>{
            if(res.data.status === 'cancelled'){
              const sql = 'UPDATE payments SET status = ? WHERE payment_id = ?';
              db.query(sql, [res.data.status, paymentId], (erro, result) =>{
                if(erro){
                  console.error('Error update payment status from bookings:', erro);
                  return res.status(500).json({ error: 'on update payment status from bookings - Internal Server Error' });
                }
                if(result){
                  console.log('Status do pagamento atualizado para cancelado')
                }
              })
            }
            console.log(res.data.status)
          }).catch(err =>{
            console.error(err)
          })
        }
      })
  } else {
    console.error('ID não encontrado na query string');
  }

  // Envie uma resposta de sucesso
  res.send('post v1');
});

//======================================= ROTAS USER-BARBEARIA ====================================
//Cadastro de ususário Barbearia   #VERIFIED
app.post("/api/v1/SignUpBarbearia", (req, res) => {
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
      cidade: city,
      amountVisibility: 'visible'
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
app.get('/api/v1/SignInBarbearia/:email/:senha', (req, res) => {
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
      const token = jwt.sign({ barbeariaId: barbearia.id, barbeariaEmail: barbearia.email }, process.env.TOKEN_SECRET_WORD_OF_USER_BARBEARIA, { expiresIn: "3h" });
      // Envie o token no corpo da resposta
      return res.status(200).json({ Success: 'Success', token: token, barbearia: result });
      
    } else {
      // Usuário não encontrado
      return res.status(404).json({Success: 'Falied', message: 'Usuário não encontrado'});
    }
  });
});

//Realizando Login e Gerando Token de autenticação para a barbearia  #VERIFIED
app.get('/api/v1/SignInProfessional/:email/:senha', (req, res) => {
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
      const token = jwt.sign({ professionalId: professional.id, professionalEmail: professional.email }, process.env.TOKEN_SECRET_WORD_OF_USER_BARBEARIA, { expiresIn: "3h" });
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

//Route to update amount visibility from barbearia
app.put('/api/v1/updateAmountVisibility', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.body.barbeariaId;
  const changeVisibilityAmount = req.body.changeVisibilityAmount;

  const sql='UPDATE barbearia SET amountVisibility = ? WHERE id = ?';
  db.query(sql, [changeVisibilityAmount, barbeariaId], (err, resu) =>{
    if (err) {
      console.error('Erro ao atualizar visibilidade:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if(resu){
      return res.status(200).json({Success: true})
    }
  })
})

//Route to get amount visibility from barbearia
app.get('/api/v1/amountVibility/:barbeariaId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;

  const sql = 'SELECT amountVisibility FROM barbearia WHERE id = ?';
  db.query(sql, [barbeariaId], (err, resu) =>{
    if (err) {
      console.error('Erro ao verificar visibilidade:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if(resu.length > 0){
      return res.status(200).json({visibility: resu[0].amountVisibility})
    }
  })
})
//================= I'M STOPED HEE================================================================
//Route to update amount visibility to professional
app.put('/api/v1/updateAmountVisibilityProfessional', AuthenticateJWT, (req, res) =>{
  const professionalId = req.body.professionalId;
  const changeVisibilityAmount = req.body.changeVisibilityAmount;

  const sql='UPDATE professional SET amountVisibility = ? WHERE id = ?';
  db.query(sql, [changeVisibilityAmount, professionalId], (err, resu) =>{
    if (err) {
      console.error('Erro ao atualizar visibilidade:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if(resu){
      return res.status(200).json({Success: true})
    }
  })
})

//Route to get amount visibility to professional
app.get('/api/v1/amountVibilityProfessional/:professionalId', AuthenticateJWT, (req, res) =>{
  const professionalId = req.params.professionalId;

  const sql = 'SELECT amountVisibility FROM professional WHERE id = ?';
  db.query(sql, [professionalId], (err, resu) =>{
    if (err) {
      console.error('Erro ao verificar visibilidade:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
    if(resu.length > 0){
      return res.status(200).json({visibility: resu[0].amountVisibility})
    }
  })
})
//=====================================================================================================
//Upload de Imagem do Usuário Barbearia, na AWS S3  #VERIFIED
app.put('/api/v1/updateUserImageProfessional', AuthenticateJWT, upload.single('image'), (req, res) => {
  const professionalId = req.body.professionalId;
  const newImageUser = req.file.originalname;
  const password = req.body.password;

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

  //formating the name of image sent
  const nameImgaSubstring = newImageUser.substring(0, 29)
  const formatNameImage = `useProfessionalId_${professionalId}_${currentDateTime.getFullYear()}${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}${currentDateTime.getDate().toString().padStart(2, '0')}_`;

  //verify if pre-fix name is valided
  if(nameImgaSubstring != formatNameImage){
    console.error('Error to update image')
    return res.status(400).json({ error: 'name are not allowed'});
  }

  //Buscando imagem atual salva no BD MySQL
  const currentImg = "SELECT user_image FROM professional WHERE id = ? AND password = ?";
  db.query(currentImg, [professionalId, password], (err, result) => {
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
          const sql = "UPDATE professional SET user_image = ? WHERE id = ? AND password =?";
          db.query(sql, [newImageUser, professionalId, password], (updateErr, updateResult) => {
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
app.get('/api/v1/userImageProfessional', AuthenticateJWT, (req, res) =>{
  const professionalId = req.query.professionalId; 

  const sql = "SELECT user_image from professional WHERE id = ?";
  db.query(sql, [professionalId], async (err, result) => {
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
  const confirmPassword = req.body.confirmPassword;

    //Array with allowed extensions
    const allowedExtensions = ['jpg', 'jpeg', 'png'];

    //array with names images
    const imagesBanners = req.files.map((file) => {
      return {
        originalname: file.originalname
      };
    });

    //check if the image array has up to 5 files
    if(imagesBanners.length > 5){
        console.error('Error to update image')
        return res.status(400).json({ error: 'size are not allowed'});
    }

    // Itera sobre os arquivos enviados
    for (let i = 0; i < imagesBanners.length; i++) {
      const file = imagesBanners[i].originalname;
      
      const nameImgaSubstring = file.substring(0, 32)
      const formatNameBanner = `barbeariaId_${barbeariaId}_banner_${i+1}_${currentDateTime.getFullYear()}${(currentDateTime.getMonth() + 1).toString().padStart(2, '0')}${currentDateTime.getDate().toString().padStart(2, '0')}_`;

      //verify if pre-fix name is valided
      if(nameImgaSubstring != formatNameBanner){
        console.error('Error to update image')
        return res.status(400).json({ error: 'name are not allowed'});
      }

      // Obtém a extensão do arquivo original
      const fileExtension = file ? file.split('.').pop() : '';

      // Verifica se a extensão é permitida
      if (!allowedExtensions.includes(fileExtension)) {
        console.error('Error to update image')
        return res.status(400).json({ error: 'extensions are not allowed'});
      }
    }

  const currentBannerImg = "SELECT banners FROM barbearia WHERE id = ? AND senha = ?";
  
  db.query(currentBannerImg, [barbeariaId, confirmPassword], (currentErr, currentResult) =>{
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
            const sql = "UPDATE barbearia SET banner_main = ?, banners = ? WHERE id = ? AND senha = ?";
            db.query(sql, [bannerMain, bannerImagesNameString, barbeariaId, confirmPassword], (err, result) => {
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
    }else{
      res.status(200).json({ Status: 'Falied' });
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
app.put('/api/v1/updateBarbeariaName', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const newNameBarbearia = req.body.novoNome;
  const confirmPassword = req.body.confirmPassword;


  // Verifica se name contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(newNameBarbearia) && newNameBarbearia.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql = "UPDATE barbearia SET name = ? WHERE id = ? AND senha = ?";
  db.query(sql, [newNameBarbearia, barbeariaId, confirmPassword], (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o nome da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.changedRows === 1) {
        return res.status(200).json({Success: "Success"});
      }else{
        return res.status(200).json({Success: "Falied"});
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
app.put('/api/v1/updateAddress', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const confirmPassword = req.body.confirmPassword;
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

  query += ` WHERE id = ? AND senha = ?`;
  values.push(barbeariaId, confirmPassword)

  db.query(query, values, (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o endereço da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    } else {
      if(result.changedRows === 1) {
        return res.status(200).json({ Success: "Success" });
      }else{
        return res.status(200).json({ Success: "Falied" });
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
app.put('/api/v1/updateUserNameBarbearia', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const newUserName = req.body.newUserName;
  const confirmPassword = req.body.confirmPassword;


  // Verifica se usuario contém apenas letras maiúsculas e minúsculas
  if (!isSignUpBarbeariaValid(newUserName) && newUserName.length <= 30) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql = "UPDATE barbearia SET usuario = ? WHERE id = ? AND senha = ?";
  db.query(sql, [newUserName, barbeariaId, confirmPassword], (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o nome de usuário da barbearia", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    } else {
      if(result.changedRows === 1) {
        return res.status(200).json({ Success: "Success" });
      }else{
        return res.status(200).json({ Success: "Falied" });
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

// Route to update information of professional #VERIFIED
app.put('/api/v1/updateDataProfessional', AuthenticateJWT, (req, res) => {
  const professionalId = req.body.professionalId;
  const confirmPassword = req.body.confirmPassword;
  const newName = req.body.newName;
  const newEmail = req.body.newEmail;
  const newPhoneNumber = req.body.newPhoneNumber;

  
  if (!isPasswordValided(confirmPassword) && confirmPassword.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  let query = `UPDATE professional SET`
  const values = [];

  if(newName){
    if (!isSignUpBarbeariaValid(newName) && newName.length <= 30) {
      return res.status(400).json({ error: 'Error in values' });
    }
    query += ` name = ?,`;
    values.push(newName);
  }
  if(newEmail){
    if (!isEmailValided(newEmail)) {
      return res.status(400).json({ error: 'Error in values' });
    }
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail);
    if(isValidEmail){
      query += ` email = ?,`;
      values.push(newEmail);
    }
  }
  if(newPhoneNumber){
    if (!isOnlyNumberValided(newPhoneNumber) && newPhoneNumber.length > 11 || newPhoneNumber.length < 10) {
      return res.status(400).json({ error: 'Error in values' });
    }
    query += ` cell_phone = ?,`;
    values.push(newPhoneNumber);
  }
  
  // Remova a última vírgula da query
  query = query.slice(0, -1);

  query += ` WHERE id = ? AND password = ?`;
  values.push(professionalId, confirmPassword)

  db.query(query, values, (err, result) =>{
    if(err){
      console.error("Erro ao atualizar informações do profissional", err);
      return res.status(500).json({Error: "Internal Server Error"});
    } else {
      if(result.changedRows === 1) {
        return res.status(200).json({ Success: "Success" });
      }else{
        return res.status(200).json({ Success: "Falied" });
      }
    }
  });
});

//Route to get user name of professional #VERIFIED
app.get('/api/v1/getDataProfessional/:professionalId', AuthenticateJWT, (req, res) => {
  const professionalId = req.params.professionalId;
  
  const sql = "SELECT name, email, cell_phone FROM professional WHERE id = ?";
  db.query(sql, [professionalId], (err, result) => {
    if(err) {
      console.error("Erro ao buscar os dados dos do professional", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.length > 0) {
        return res.status(200).json({ data_professional: result});
      }
    }
  })
})

//Rota para atualizar o email de usuário da barbearia #VERIFIED
app.put('/api/v1/updateEmailBarbearia', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const confirmPassword = req.body.confirmPassword;
  const newEmail = req.body.newEmail;

  // Verifica se newEmail contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(newEmail) && newEmail.length <= 50) {
    return res.status(400).json({ error: 'Error in values' });
  }

  const sql = "UPDATE barbearia SET email = ? WHERE id = ? AND senha = ?";
  db.query(sql, [newEmail, barbeariaId, confirmPassword], (err, result) =>{
    if(err){
      console.error("Erro ao atualizar o email de usuário barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }else{
      if(result.changedRows === 1){
        return res.status(200).json({Success: "Success"});
      }else{
        return res.status(200).json({Success: "Falied"});
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
app.put('/api/v1/updatePasswordBarbearia', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const passwordConfirm = req.body.passwordConfirm;
  const newPassword = req.body.newPassword;

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(passwordConfirm) && passwordConfirm.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(newPassword) && newPassword.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }
  
  const sql = "SELECT senha FROM barbearia WHERE id = ? AND senha = ?";
  db.query(sql, [barbeariaId, passwordConfirm], (err, resul) => {
    if(err) {
      console.error("Erro ao comparar senha de usuário da barbearia", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    if(resul.length > 0) {
      const sql = "UPDATE barbearia SET senha = ? WHERE id = ?";
      db.query(sql, [newPassword, barbeariaId], (erro, result) =>{
        if(erro){
          console.error("Erro ao atualizar a senha de usuário barbearia", erro);
          return res.status(500).json({Error: "Internal Server Error"});
        }
        if(result){
          return res.status(200).json({ Success: "Success"});
        }
      })
    }else{
      return res.status(404).json({ Success: "Falied"});
    }
  })
});

//Rota para atualizar a senha de usuário da barbearia
app.put('/api/v1/updatePasswordProfessional', AuthenticateJWT, (req, res) => {
  const professionalId = req.body.professionalId;
  const passwordConfirm = req.body.passwordConfirm;
  const newPassword = req.body.newPassword;

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(passwordConfirm) && passwordConfirm.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se senha contém apenas letras maiúsculas e minúsculas e alguns caracteres especiais
  if (!isPasswordValided(newPassword) && newPassword.length <= 8) {
    return res.status(400).json({ error: 'Error in values' });
  }
  
  const sql = "SELECT password FROM professional WHERE id = ? AND password = ?";
  db.query(sql, [professionalId, passwordConfirm], (err, resul) => {
    if(err) {
      console.error("Erro ao comparar senha de usuário", err);
      return res.status(500).json({Error: "Internal Server Error"});
    }
    if(resul.length > 0) {
      const sql = "UPDATE professional SET password = ? WHERE id = ?";
      db.query(sql, [newPassword, professionalId], (erro, result) =>{
        if(erro){
          console.error("Erro ao atualizar a senha de usuário barbearia", erro);
          return res.status(500).json({Error: "Internal Server Error"});
        }
        if(result){
          return res.status(200).json({ Success: "Success"});
        }
      })
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
app.get('/api/v1/agenda/:barbeariaId/:professionalId', (req, res) => {
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
app.get('/api/v1/agendaDiaSelecionado/:barbeariaId/:professionalId', (req, res) =>{
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
      values.push('Não há horários definidos.');
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
  if (!isSignUpBarbeariaValid(name) && name.length > 150) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (!isOnlyNumberValided(preco) && preco.length > 10) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se number contém apenas números
  if (!isOnlyNumberValided(commission_fee) && commission_fee.length > 10) {
    return res.status(400).json({ error: 'Error in values' });
  }
  // Verifica se a str de duração do serviço contém letras e números apenaas
  if (!isEmailValided(duracao) && duracao.length > 5) {
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
      // Verifica se number contém apenas números
      if (!isSignUpBarbeariaValid(editedServiceName) && editedServiceName.length > 150) {
        return res.status(400).json({ error: 'Error in values' });
      }
      query += ` name = ?,`;
      values.push(editedServiceName);
  }
  if (editedServicePrice) {
      // Verifica se number contém apenas números
      if (!isOnlyNumberValided(editedServicePrice) && editedServicePrice.length > 10) {
        return res.status(400).json({ error: 'Error in values' });
      }
      query += ` preco = ?,`;
      values.push(editedServicePrice);
  }
  if (editedCommissionFee) {
      // Verifica se number contém apenas números
      if (!isOnlyNumberValided(editedCommissionFee) && editedCommissionFee.length > 10) {
        return res.status(400).json({ error: 'Error in values' });
      }
      query += ` commission_fee = ?,`;
      values.push(editedCommissionFee);
  }
  if (editedDuration) {
      // Verifica se a str de duração do serviço contém letras e números apenaas
      if (!isEmailValided(editedDuration) && editedDuration.length > 5) {
        return res.status(400).json({ error: 'Error in values' });
      }
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
                    barbearia.cidade AS cidadeBarbearia,
                    averageAvaliations.totalAvaliations AS totalAvaliations,
                    averageAvaliations.average AS average
              FROM notificationProfessional
              INNER JOIN barbearia ON barbearia.id = notificationProfessional.barbearia_id
              LEFT JOIN averageAvaliations ON averageAvaliations.barbearia_id = notificationProfessional.barbearia_id
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
  const amountVisibility = 'vibible'

  // Verifica se newNameProfessional contém apenas letras maiúsculas e minúsculas
  if (!isNameValided(newNameProfessional) && newNameProfessional.length > 30) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se newPhoneProfessional contém apenas letras maiúsculas e minúsculas
  if (!isOnlyNumberValided(newPhoneProfessional) && newPhoneProfessional.length > 11 || newPhoneProfessional.length < 10 ) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se newEmailProfessional contém apenas letras maiúsculas e minúsculas
  if (!isEmailValided(newEmailProfessional) && newEmailProfessional.length > 50) {
    return res.status(400).json({ error: 'Error in values' });
  }

  // Verifica se newPasswordProfessional contém apenas letras maiúsculas e minúsculas
  if (!isPasswordValided(newPasswordProfessional) && newPasswordProfessional.length > 8) {
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
      const sqlInsertOnProfessional="INSERT INTO professional (name, email, password, cell_phone, user_image, amountVisibility) VALUES (?, ?, ?, ?, ?, ?)"
      db.query(sqlInsertOnProfessional, [newNameProfessional, newEmailProfessional, newPasswordProfessional, newPhoneProfessional, fakeNameUserImage, amountVisibility], (erro, result) =>{
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

    //Consult to verify if professional have a relationship with barbearia
    const verifyRelationship = "SELECT professional_id FROM Barb_Professional WHERE barbearia_id = ? AND professional_id = ?";
    db.query(verifyRelationship, [barbeariaId, professionalId], (errVerify, resultVerify) =>{
      if(errVerify){
        console.error('Erro ao verificar vínculo do profissional com a barbearia:', errVerify);
        return res.status(500).json({ Error: "Error" });
      }
      if(resultVerify.length === 0){
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
      }else{
        return res.status(401).json({ Error: "Unauthorized: professional have a relationship with barbearia"});
      }
    })
    
});

//Route to accept notification
app.delete('/api/v1/rejectNotification/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;

  const sqlDelete = "DELETE FROM notificationProfessional WHERE barbearia_id = ? AND professional_id = ?"
  db.query(sqlDelete, [barbeariaId, professionalId], (erro, result) =>{
    if(erro){
      console.error('Erro ao apagar notificação:', erro);
      return res.status(500).json({ Error: "Error" });
    }
    if(result){
      return res.status(200).json({ Success: "Success"});
    }
  })
});

//Rota para obter os profissionais da barbearia em  específico
app.get('/api/v1/listProfessionalToBarbearia/:barbeariaId', (req, res) => {
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
      return res.status(200).json({ Success: "Success", Professional: result});//Enviando o array com os profissionais
    }
  })
});

//Route to gell especific barbshop to professional
app.get('/api/v1/listBarbeariaToProfessional/:professionalId', AuthenticateJWT, (req, res) => {
  const professionalId = req.params.professionalId;

  const sql=`SELECT barbearia.id AS barbeariaId,
                    barbearia.name AS nameBarbearia,
                    barbearia.banner_main AS bannerBarbearia,
                    barbearia.rua AS ruaBarbearia,
                    barbearia.N AS nRuaBarbearia,
                    barbearia.bairro AS bairroBarbearia,
                    barbearia.cidade AS cidadeBarbearia,
                    averageAvaliations.totalAvaliations AS totalAvaliations,
                    averageAvaliations.average AS average
              FROM Barb_Professional
              INNER JOIN barbearia ON barbearia.id = Barb_Professional.barbearia_id AND Barb_Professional.professional_id = ?
              LEFT JOIN averageAvaliations ON averageAvaliations.barbearia_id = Barb_Professional.barbearia_id`;

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
app.get('/api/v1/listService/:barbeariaId', (req, res) =>{
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
app.post('/api/v1/createBookingWithPayment/', AuthenticateJWT, (req, res) => {
  //Create object to make a toke for booking
  const values = [
    req.body.userId,
    req.body.barbeariaId,
    req.body.professionalId,
    req.body.serviceId,
    req.body.payment_id,
    req.body.selectedDay,
    req.body.timeSelected,
  ];

  const formatDate = req.body.formattedDate;
  const selectedDayFormated = req.body.selectedDayFormated;

  const token = values.join('-');

  
  const sqlSelect="SELECT user_id FROM bookings WHERE user_id = ? AND booking_date = ?";
  db.query(sqlSelect, [values[0], values[5]], (err, result) =>{
    if(err){
      console.error('Erro ao verificar agendamentos do usuário:', err);
      return res.status(500).json({ Error: 'Erro ao verificar agendamentos do usuário.' });
    }
    if(result.length >= 2){
      return res.status(401).json({ Unauthorized: 'Número de agendamentos excedido' });
    }else{
      const sqlInsert = "INSERT INTO bookings (user_id, barbearia_id, professional_id, service_id, payment_id, booking_date, booking_time, date_created, token, booking_date_no_formated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
      db.query(sqlInsert, [...values, formatDate, token, selectedDayFormated], (erro, results) => {
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

//Rota para realizar o agendamento
app.post('/api/v1/createBookingWithoutPayment/', AuthenticateJWT, (req, res) => {
  
  //Create object to make a toke for booking
  const values = [
    req.body.userId,
    req.body.barbeariaId,
    req.body.professionalId,
    req.body.serviceId,
    req.body.payment_id,
    req.body.selectedDay,
    req.body.timeSelected,
  ];
  const formatDate = req.body.formattedDate;
  const selectedDayFormated = req.body.selectedDayFormated;
  
  const token = values.join('-');

  function createBooking () {
    const sqlInsert = "INSERT INTO bookings (user_id, barbearia_id, professional_id, service_id, payment_id, booking_date, booking_time, date_created, token, booking_date_no_formated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        db.query(sqlInsert, [...values, formatDate, token, selectedDayFormated], (erro, results) => {
          if(erro){
            console.error('Erro ao realizar agendamento:', erro);
            return res.status(500).json({ Error: ' Internal Server Error' });
          }
          if(results){
            return res.status(200).json({ Success: "Success"});
          }
        })
  }
  
  const sqlSelect="SELECT booking_time FROM bookings WHERE booking_date = ?";
  db.query(sqlSelect, [values[5]], (err, result) =>{
    if(err){
      console.error('Erro ao verificar agendamentos do usuário:', err);
      return res.status(500).json({ Error: 'Erro ao verificar agendamentos do usuário.' });
    }
    if(result.length > 0){
        const timeSelected = values[6].split(',');//Novos horários selecionados pelo usuário
        const timesFound = result[0].booking_time.split(',');//horários já agendados pleo usuário
        const timesMach = timeSelected.filter(item => timesFound.includes(item));//Verificar se há compatibilidade entre os horários
        
        if(timesMach.length > 0){
          return res.status(401).json({ Unauthorized: 'timesMach', timesMach: timesMach });
        }

      return createBooking()
    }

    if(result.length === 0){
      return createBooking()
    }
  })
});

// Rota para buscar todos os agendamentos de uma barbearia específica
app.get('/api/v1/bookingsTimes/:barbeariaId/:professionalId/:selectedDate', (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const selectedDate = req.params.selectedDate;

  const sql = `
              SELECT bookings.booking_time AS timesLocked
              FROM bookings
              INNER JOIN payments 
                  ON payments.id = bookings.payment_id 
                  AND payments.status != 'cancelled'
              WHERE bookings.barbearia_id = ?
                AND bookings.professional_id = ?
                AND bookings.booking_date = ?

              UNION

              SELECT days_off.times
              FROM days_off
              WHERE days_off.barbearia_id = ?
                AND days_off.professional_id = ?
                AND days_off.day = ?
                
              UNION

              SELECT bookings.booking_time
              FROM bookings
              WHERE bookings.barbearia_id = ?
                AND bookings.professional_id = ?
                AND booking_date = ?`;

  db.query(sql, [barbeariaId, professionalId, selectedDate, barbeariaId, professionalId, selectedDate, barbeariaId, professionalId, selectedDate], (err, result) => {
    if (err) {
      console.error('Erro ao buscar agendamentos da barbearia:', err);
      return res.status(500).json({ Error: 'Internal Server Error.' }); 
    }
    if (result.length > 0) {
      return res.status(200).json({ Message: "true", timesLocked: result });
    }else{
      return res.status(200).json({ Message: "false"});
    }

  });
});

//Route to save days-off
app.put('/api/v1/updateDayOff/:barbeariaId/:professionalId', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const selectedDay = req.body.selectedDay;
  const timesLockedByProfessional = req.body.timesLocked;
  const confirmPassword = req.body.confirmPassword;

  //Sql to verify if password of barbearia is validated. The 'select usuario' don't matter, its there because is necessary select something
  const sqlVerifyPassword="SELECT usuario FROM barbearia WHERE id = ? AND senha = ?";
  db.query(sqlVerifyPassword, [barbeariaId, confirmPassword], (erroVerifySenha, resultVerifySenha) =>{
    if(erroVerifySenha){//If the password is wrong
      console.error("Erro ao obter folgas do professional", err);
      return res.status(404).json({ Error: "password is not validated" });
    }
    if(resultVerifySenha.length > 0){//If the password is validated
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
    }else{
      return res.status(200).json({ Success: "Falied"});//Enviando o array com os horários
    }
  })
});

//Route to get bookings of barbearia
app.get('/api/v1/bookings/:barbeariaId/:selectedDate', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const selectedDate = req.params.selectedDate;

  const sql=`SELECT
                  user.id AS user_id,
                  user.name user_name,
                  user.celular AS user_phone,
                  user.user_image AS user_image,
                  bookings.id AS booking_id,
                  bookings.booking_time AS booking_time,
                  bookings.date_created AS date_created,
                  professional.id AS professional_id,
                  professional.name AS professional_name,
                  servico.id AS service_id,
                  servico.name AS service_name,
                  servico.preco AS service_price,
                  servico.duracao AS service_duration,
                  servico.commission_fee AS service_commission_fee,
                  payments.status AS paymentStatus
              FROM bookings
              INNER JOIN user ON user.id = bookings.user_id
              INNER JOIN professional ON professional.id = bookings.professional_id
              INNER JOIN servico ON servico.id = bookings.service_id
              LEFT JOIN payments ON payments.id = bookings.payment_id
              WHERE bookings.barbearia_id = ? AND bookings.booking_date = ?
                        AND (payments.status = 'approved' OR bookings.payment_id = 0)`;

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
app.get('/api/v1/professionalBookings/:professionalId/:selectedDate', AuthenticateJWT, (req, res) =>{
  const professionalId = req.params.professionalId;
  const selectedDate = req.params.selectedDate;

  const sql=`SELECT bookings.id AS booking_id,
                    bookings.booking_time AS booking_time,
                    bookings.date_created AS date_created,
                    user.name AS user_name,
                    user.celular AS user_phone,
                    user.user_image AS user_image,
                    barbearia.id AS barbearia_id,
                    barbearia.name AS nameBarbearia,
                    servico.id AS service_id,
                    servico.name AS service_name,
                    servico.preco AS service_price,
                    servico.duracao AS service_duration,
                    servico.commission_fee AS service_commission_fee,
                    payments.status AS paymentStatus
      FROM bookings
      INNER JOIN user ON user.id = bookings.user_id
      INNER JOIN barbearia ON barbearia.id = bookings.barbearia_id
      INNER JOIN servico ON servico.id = bookings.service_id
      INNER JOIN payments ON payments.id = bookings.payment_id AND payments.status = 'approved'
      WHERE bookings.professional_id = ? AND bookings.booking_date = ?`;

      db.query(sql, [professionalId, selectedDate], (err, result) =>{
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

//Route to get all service by month and calucule total amount
app.get('/api/v1/getAmountOfMonth/:barbeariaId/:monthAndYear', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;
  const CurrentMonthAndYear = req.params.monthAndYear;
  
  //Function to calcule total amount of Barbearia
  function caluclateAmountBarbearia (mesAtual){
    let totalAmount = 0;
  
    for(let i = 0; i < mesAtual.length; i++){
      Object.entries(mesAtual[i]).forEach(([key, value]) => {
        if(key === 'service_price'){
          let valueService = value.replace(/[^0-9,]/g, '').replace(',', '.');
          // Convertendo a string resultante para número
          valueService = Number(valueService);
          totalAmount += valueService;
        }
      });
    }
  
    // Formatando o totalAmount para 2 casas decimais e substituindo o ponto por vírgula
    totalAmount = totalAmount.toFixed(2).replace('.', ',');
  
    return totalAmount;
  }
  //Function to calculete the comission fee of professional
  function calculateCommissionByProfessional(mesAtual) {
    const commissions = {}; // Objeto para armazenar as comissões por profissional
  
    // Iterar sobre o array de forma otimizada
    for (const { name_professional, commission_fee } of mesAtual) {
      // Limpar e converter o valor de commission_fee uma única vez
      const commissionFee = parseFloat(commission_fee.replace(/[^0-9,]/g, '').replace(',', '.'));
  
      // Somar ao total de comissões para o profissional
      commissions[name_professional] = (commissions[name_professional] ?? 0) + commissionFee;
    }
  
    // Formatar os valores finais de comissão para duas casas decimais e substituir ponto por vírgula
    for (const professional in commissions) {
      commissions[professional] = commissions[professional].toFixed(2).replace('.', ',');
    }
  
    return commissions;
  }

  const sql=`SELECT servico.preco AS service_price,
                    servico.commission_fee AS commission_fee,
                    professional.name AS name_professional
                FROM 
                    servico
                INNER JOIN bookings 
                    ON bookings.service_id = servico.id
                INNER JOIN professional 
                    ON professional.id = bookings.professional_id
                LEFT JOIN payments
                    ON payments.id = bookings.payment_id
                    AND (payments.status = 'approved' OR bookings.payment_id = 0)
                WHERE bookings.barbearia_id = ?
                    AND booking_date LIKE '%${CurrentMonthAndYear}%'`;

  db.query(sql, [barbeariaId], (err, resul) =>{
    if(err){
      console.error("Erro ao obter agendamentos", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    if(resul.length > 0){
      const totalAmountBarbearia = caluclateAmountBarbearia(resul)
      const comissionFee = calculateCommissionByProfessional(resul)
      return res.status(200).json({ totalAmountBarbearia: totalAmountBarbearia, comissionByProfessional: comissionFee });
    }else{
      return res.status(200).json({ Message: "false"});
    }
  })
})

//Route to get all service by month and calucule total amount for professional
app.get('/api/v1/getAmountOfMonthProfessional/:professionalId', AuthenticateJWT, (req, res) =>{
  const professionalId = req.params.professionalId;

  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Maio', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
  ];

  const today = new Date();
  const month = months[today.getMonth()];
  const year = today.getFullYear();

  let CurrentMonthAndYear = `${month} de ${year}`;
  
  //Function to calcule total amount of current month
  function caluclateAmount (mesAtual){
    let totalAmount = 0;
  
    for(let i = 0; i < mesAtual.length; i++){
      Object.entries(mesAtual[i]).forEach(([key, value]) => {
          let valueService = value.replace(/[^0-9,]/g, '').replace(',', '.');
          // Convertendo a string resultante para número
          valueService = Number(valueService);
          totalAmount += valueService;
      });
    }
  
    // Formatando o totalAmount para 2 casas decimais e substituindo o ponto por vírgula
    totalAmount = totalAmount.toFixed(2).replace('.', ',');
  
    return totalAmount;
  }

  const sql=`SELECT servico.commission_fee AS commission_fee
                FROM servico
                INNER JOIN bookings ON bookings.professional_id = ? AND bookings.service_id = servico.id AND booking_date LIKE '%${CurrentMonthAndYear}%'
                INNER JOIN payments ON payments.id = bookings.payment_id AND payments.status = 'approved'`;

  db.query(sql, [professionalId], (err, resul) =>{
    if(err){
      console.error("Erro ao obter agendamentos", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    if(resul.length > 0){
      const totalAmount = caluclateAmount(resul)
      return res.status(200).json({ totalAmount });
    }else{
      return res.status(200).json({ Message: "false"});
    }
  })
})

//Route for professional delete all conections between professional and barbearia
app.delete('/api/v1/unlinkProfessional/:barbeariaId/:professionalId/:confirmPassword', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const password = req.params.confirmPassword;
  
  const sqlVerifyPassword = "SELECT usuario FROM barbearia WHERE senha = ?";
  db.query(sqlVerifyPassword, [password], (errVerifyPassword, resVerifyPassword) =>{
    if(errVerifyPassword){
      console.error("Erro ao verificar senha", errVerifyPassword);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    if(resVerifyPassword.length > 0){
      const sqlDeleteBarbProfessional = "DELETE FROM Barb_Professional WHERE barbearia_id = ? AND professional_id = ?";
      db.query(sqlDeleteBarbProfessional, [barbeariaId, professionalId], (errDeleteBarbProfessional, resDeleteBarbProfessional) =>{
        if(errDeleteBarbProfessional){
          console.error("Erro ao desvincular o profissional", errDeleteBarbProfessional);
          return res.status(500).json({ Error: "Internal Server Error" });
        }
        if(resDeleteBarbProfessional){
          const sqlDeleteAgenda = "DELETE FROM agenda WHERE barbearia_id = ? AND professional_id = ?";
          db.query(sqlDeleteAgenda, [barbeariaId, professionalId], (errDeleteAgenda, resDeleteAgenda) =>{
            if(errDeleteAgenda){
              console.error("Erro ao desvincular o profissional", errDeleteAgenda);
              return res.status(500).json({ Error: "Internal Server Error" });
            }
            if(resDeleteAgenda){
              const sqlDeleteDaysOff = "DELETE FROM days_off WHERE barbearia_id = ? AND professional_id = ?";
              db.query(sqlDeleteDaysOff, [barbeariaId, professionalId], (errDeleteDaysOff, resDeleteDaysOff) =>{
                if(errDeleteDaysOff){
                  console.error("Erro ao desvincular o profissional", errDeleteDaysOff);
                  return res.status(500).json({ Error: "Internal Server Error" });
                }
                if(resDeleteDaysOff){
                  const sqlDeleteService = "DELETE FROM servico WHERE barbearia_id = ? AND professional_id = ?";
                  db.query(sqlDeleteService, [barbeariaId, professionalId], (errDeleteService, resDeleteService) =>{
                    if(errDeleteService){
                      console.error("Erro ao desvincular o profissional", errDeleteService);
                      return res.status(500).json({ Error: "Internal Server Error" });
                    }
                    if(resDeleteService){
                      return res.status(200).json({ Success: "Success"});
                    }
                  })
                }
              })
            }
          })
        }
      })
    }
  })
})

//Route for barbearia delete all conections between professional and barbearia
app.delete('/api/v1/unlinkBarbearia/:barbeariaId/:professionalId/:confirmPassword', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const professionalId = req.params.professionalId;
  const password = req.params.confirmPassword;
  
  const sqlVerifyPassword = "SELECT name FROM professional WHERE password = ?";
  db.query(sqlVerifyPassword, [password], (errVerifyPassword, resVerifyPassword) =>{
    if(errVerifyPassword){
      console.error("Erro ao verificar senha", errVerifyPassword);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    if(resVerifyPassword.length > 0){
      const sqlDeleteBarbProfessional = "DELETE FROM Barb_Professional WHERE barbearia_id = ? AND professional_id = ?";
      db.query(sqlDeleteBarbProfessional, [barbeariaId, professionalId], (errDeleteBarbProfessional, resDeleteBarbProfessional) =>{
        if(errDeleteBarbProfessional){
          console.error("Erro ao desvincular o profissional", errDeleteBarbProfessional);
          return res.status(500).json({ Error: "Internal Server Error" });
        }
        if(resDeleteBarbProfessional){
          const sqlDeleteAgenda = "DELETE FROM agenda WHERE barbearia_id = ? AND professional_id = ?";
          db.query(sqlDeleteAgenda, [barbeariaId, professionalId], (errDeleteAgenda, resDeleteAgenda) =>{
            if(errDeleteAgenda){
              console.error("Erro ao desvincular o profissional", errDeleteAgenda);
              return res.status(500).json({ Error: "Internal Server Error" });
            }
            if(resDeleteAgenda){
              const sqlDeleteDaysOff = "DELETE FROM days_off WHERE barbearia_id = ? AND professional_id = ?";
              db.query(sqlDeleteDaysOff, [barbeariaId, professionalId], (errDeleteDaysOff, resDeleteDaysOff) =>{
                if(errDeleteDaysOff){
                  console.error("Erro ao desvincular o profissional", errDeleteDaysOff);
                  return res.status(500).json({ Error: "Internal Server Error" });
                }
                if(resDeleteDaysOff){
                  const sqlDeleteService = "DELETE FROM servico WHERE barbearia_id = ? AND professional_id = ?";
                  db.query(sqlDeleteService, [barbeariaId, professionalId], (errDeleteService, resDeleteService) =>{
                    if(errDeleteService){
                      console.error("Erro ao desvincular o profissional", errDeleteService);
                      return res.status(500).json({ Error: "Internal Server Error" });
                    }
                    if(resDeleteService){
                      return res.status(200).json({ Success: "Success"});
                    }
                  })
                }
              })
            }
          })
        }
      })
    }
  })
})

app.put('/api/v1/updateBookingPoliceis/', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.body.barbeariaId;
  const confirmPassword = req.body.confirmPassword;
  const bookingWithPayment = req.body.bookingWithPayment;
  const servicePercentage = req.body.servicePercentage;

  const sqlVerifyPassword = 'SELECT EXISTS(SELECT 1 FROM barbearia WHERE id = ? AND senha = ?) as passwordExists';
  db.query(sqlVerifyPassword, [barbeariaId, confirmPassword], (err, resu) =>{
    if(err){
      console.error("Erro ao atualizar as políticas de agendamento", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    const passwordExists = resu[0].passwordExists;

    if(passwordExists){
      const sqlSelectPoliceisBarbearia = 'SELECT EXISTS(SELECT 1 FROM bookingPolicies WHERE barbearia_id = ?) as policeisBarbearia';
      db.query(sqlSelectPoliceisBarbearia, [barbeariaId], (erro, resul) =>{
        if(erro){
          console.error("Erro ao atualizar as políticas de agendamento", erro);
          return res.status(500).json({ Error: "Internal Server Error" });
        }
        const policeisBarbearia = resul[0].policeisBarbearia;

        if(policeisBarbearia){
          const sqlUpdateBookingPoliceis = 'UPDATE bookingPolicies SET booking_with_payment = ?, service_percentage = ? WHERE barbearia_id = ?';
          db.query(sqlUpdateBookingPoliceis, [bookingWithPayment, servicePercentage, barbeariaId], (error, result) =>{
            if(error){
              console.error("Erro ao atualizar as políticas de agendamento", error);
              return res.status(500).json({ Error: "Internal Server Error" });
            }
            if(result){
              return res.status(200).json({ Success: "Success"});
            }
          })

        }else{
          const sqlCreatePoliceisBarbearia = 'INSERT INTO bookingPolicies (barbearia_id, booking_with_payment, service_percentage) VALUES (?,?,?)';
          db.query(sqlCreatePoliceisBarbearia, [barbeariaId, bookingWithPayment, servicePercentage], (errInCreation, resultCreation) =>{
            if(errInCreation){
              console.error("Erro ao criar as políticas de agendamento", errInCreation);
              return res.status(500).json({ Error: "Internal Server Error" });
            }
            if(resultCreation){
              return res.status(200).json({ Success: "Success"});
            }
          })
        }
      })      
    }
  })
})

app.get('/api/v1/bookingPoliceis/:barbeariaId', AuthenticateJWT, (req, res) =>{
  const barbeariaId = req.params.barbeariaId;

  const sql = 'SELECT booking_with_payment, service_percentage FROM bookingPolicies WHERE barbearia_id = ?';
  db.query(sql, [barbeariaId], (err, resu) =>{
    if(err){
      console.error("Erro ao buscar as políticas de agendamento", err);
      return res.status(500).json({ Error: "Internal Server Error" });
    }
    if(resu.length > 0){
      return res.status(200).json({ bookingPoliceis: resu[0]})
    }
  })
})

app.get('/api/v1/totalBookings/:barbeariaId/:year', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const year = Number (req.params.year);

      const sql = `SELECT 
                      MONTH(booking_date_no_formated) AS month,
                      COUNT(*) AS total_bookings
                  FROM 
                      bookings
                  WHERE 
                      barbearia_id = ?
                      AND YEAR(booking_date_no_formated) = ?
                  GROUP BY 
                      MONTH(booking_date_no_formated)
                  ORDER BY 
                      month`;

      db.query(sql, [barbeariaId, year], (err, result) => {
        if (err) {
            return res.status(500).send({ error: 'Error fetching data' });
        }
        if(result.length >= 0){
          const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
          const data = [];

          // Preenche os meses vazios (caso existam) com valores padrão de agendamentos
          for (let i = 0; i < 12; i++) {
            const matchingMonth = result.find(item => item.month === i + 1); // Encontra o mês correspondente no SQL data

            data.push({
              month: monthNames[i], // Nome do mês correspondente
              Agendamentos: matchingMonth ? matchingMonth.total_bookings : 0, // Se encontrar, use o valor, senão 0
            });
          }
          return res.status(200).json({totalBookings: data});
        }
        
        
      });
});

app.get('/api/v1/bookingsByMonth/:barbeariaId/:monthAndYear', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const monthAndYear = req.params.monthAndYear;

      const sql = `SELECT
                      user.id AS user_id,
                      user.name user_name,
                      user.celular AS user_phone,
                      user.user_image AS user_image,
                      bookings.id AS booking_id,
                      bookings.booking_time AS booking_time,
                      bookings.booking_date AS booking_date,
                      bookings.date_created AS date_created,
                      professional.id AS professional_id,
                      professional.name AS professional_name,
                      servico.id AS service_id,
                      servico.name AS service_name,
                      servico.preco AS service_price,
                      servico.duracao AS service_duration,
                      servico.commission_fee AS service_commission_fee,
                      payments.status AS paymentStatus
                  FROM bookings
                  INNER JOIN user ON user.id = bookings.user_id
                  INNER JOIN professional ON professional.id = bookings.professional_id
                  INNER JOIN servico ON servico.id = bookings.service_id
                  LEFT JOIN payments ON payments.id = bookings.payment_id
                  WHERE bookings.barbearia_id = ? 
                        AND booking_date LIKE '%${monthAndYear}%'
                        AND (payments.status = 'approved' OR bookings.payment_id = 0)`;

      db.query(sql, [barbeariaId], (err, result) => {
        if (err) {
            return res.status(500).send({ error: 'Error fetching data' });
        }
        if(result.length > 0){
          //list of month with your values
          const numbersMonth = {
            Jan: 1,
            Fev: 2,
            Mar: 3,
            Abr: 4,
            Maio: 5,
            Jun: 6,
            Jul: 7,
            Ago: 8,
            Set: 9,
            Out: 10,
            Nov: 11,
            Dez: 12
          }
          //function to order bookings
          function orderBookings(booking) {
            booking.sort((a, b) =>{
                //========== Elemento A ==========
                //obtendo o mês e o ano do agandamento
                const yearBookingA = Number (a.booking_date.substring(17).replace(/[^0-9]/g, ''));
                const monthBookingA = a.booking_date.match(/(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)/g, '');
                const monthAndYearBookingsA = Number (`${numbersMonth[monthBookingA]}` + `${yearBookingA}`);
                //obtendo o dia do agendamento
                const bookingDayA = Number (a.booking_date.split(', ')[1].split(' ')[0]);
                //Obtendo o horário inicial do agendamento
                const bookingTimesA = Number (a.booking_time.split(',')[a.booking_time.split(',').length-1].replace(/[^0-9]/g, ''));
                
                //========== Elemento B ==========
                //obtendo o mês e o ano do agandamento
                const yearBookingB = Number (b.booking_date.substring(17).replace(/[^0-9]/g, ''));
                const monthBookingB = b.booking_date.match(/(Jan|Fev|Mar|Abr|Mai|Jun|Jul|Ago|Set|Out|Nov|Dez)/g, '');
                const monthAndYearBookingsB = Number (`${numbersMonth[monthBookingB]}` + `${yearBookingB}`);
                //obtendo o dia do agendamento
                const bookingDayB = Number (b.booking_date.split(', ')[1].split(' ')[0]);
                //Obtendo o horário inicial do agendamento
                const bookingTimesB = Number (b.booking_time.split(',')[b.booking_time.split(',').length-1].replace(/[^0-9]/g, ''));

                
                if(monthAndYearBookingsA === monthAndYearBookingsB){
                    if(bookingDayA === bookingDayB){
                        if(bookingTimesA < bookingTimesB){
                            return 1
                        }else{
                            return -1
                        }
                    }else if(bookingDayA < bookingDayB){
                            return 1
                        }else{
                            return -1
                        }
                }else if(monthAndYearBookingsA < monthAndYearBookingsB){
                        return 1
                }else{
                        return -1
                }
            }) 
          }

          orderBookings(result);

          return res.status(200).json({bookings: result});
        }
        if(result.length === 0){
          return res.status(200).json({bookings: 0});
        }
        
      });
});

app.get('/api/v1/MostScheduledServices/:barbeariaId/:monthAndYear', AuthenticateJWT, (req, res) => {
  const barbeariaId = req.params.barbeariaId;
  const monthAndYear = req.params.monthAndYear;

      const sql = `SELECT
                          servico.name AS name_service, COUNT(*) AS quantidade
                    FROM servico
                    INNER JOIN
                          bookings
                          ON bookings.service_id = servico.id
                    WHERE bookings.barbearia_id = ?
                          AND bookings.booking_date LIKE '%${monthAndYear}%'
                    GROUP BY servico.name
                    ORDER BY quantidade DESC
                    LIMIT 5`;

      db.query(sql, [barbeariaId], (err, result) => {
        if (err) {
          return res.status(500).send({ error: 'Error to get most sheduled services' });
        }
        if(result.length >= 0){
          return res.status(200).json({mostScheduledServices: result});
        }
      });
});

// Inicia o servidor na porta especificada
app.listen(port, () => {
    console.log("Servidor rodando");
  });
