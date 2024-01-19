// index.js
import express from 'express';
import cors from 'cors';
import bodyParser from "body-parser";

import mysql from "mysql2";

import jwt  from 'jsonwebtoken';
import MercadoPago from "mercadopago";

import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import 'dotenv/config'

const app = express();
const port = process.env.PORT || 3000;

// CORS Settings to Only Allow Frontend Deployment to Netlify
const corsOptions = {
  origin: 'https://barbeasy.netlify.app',
  optionsSuccessStatus: 200, // Some browser versions may need this code
};

app.use(cors(corsOptions));
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

//ROTAS USER-CLIENT-BARBEARIA
// Cadastro de usuário com senha criptografada
app.post("/SignUp", async (req, res) => {
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
app.post('/SignIn', async (req, res) => {
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
      const token = jwt.sign({ userId: user.id, userEmail: user.email }, process.env.tokenWordSecret, { expiresIn: "1h" });
      // Envie o token no corpo da resposta
      res.status(200).json({ success: true, token: token, user: result });
      
    } else {
      // Usuário não encontrado
      res.status(404).json({success: false, message: 'Usuário não encontrado'});
    }
  });
});

//listando as barbearias cadastradas
app.get('/listBarbearia', async (req, res) => {
  try {
    db.query('SELECT * FROM barbearia', (err, rows) => {
      if (err) throw err;
      res.json(rows);
    });
  } catch (error) {
    console.error('Erro ao obter os registros:', error);
    res.status(500).json({ success: false, message: 'Erro ao obter os registros' });
  }
});

/*listando os Serviços cadastrados pelas barbearias*/
app.get('/listServico', async (req, res)=>{
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
app.post("/avaliacao", (req, res) => {
  const sql = "INSERT INTO avaliacoes (`user_name`,`barbearia_id`, `estrelas`, `comentarios`, `data_avaliacao`) VALUES (?)";
  const values = [
    req.body.userName,
    req.body.barbeariaId,
    req.body.avaliacao,
    req.body.comentario,
    req.body.data_avaliacao
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
app.get('/SearchAvaliation', async(req, res)=>{
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
app.post('/agendamento', (req, res) => {
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
app.post('/Checkout', async (req, res) => {
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

//ROTAS USER-BARBEARIA

//Cadastro de ususário Barbearia
app.post("/SignUp_Barbearia", async (req, res) => {
  const { name, email, usuario, senha, endereco } = req.body;

  // Verificação se o e-mail já está cadastrado
  db.query('SELECT * FROM barbearia WHERE email = ?', [email], (error, results) => {
    if (error) {
      console.error(error);
      return res.status(500).send('Erro ao verificar o e-mail');
    }

    // Se já houver resultados, significa que o e-mail já está cadastrado
    if (results.length > 0) {
      return res.status(400).send('E-mail já cadastrado. Por favor, escolha outro e-mail.');
    }

    const barbearia = {
      name,
      email,
      usuario,
      senha,
      status: 'Fechado',
      endereco
    };

    // Inserção no banco de dados
    db.query('INSERT INTO barbearia SET ?', barbearia, (error, results) => {
      if (error) {
        console.error(error);
        return res.status(500).send('Erro ao registrar usuário');
      }

      res.status(201).send('Usuário registrado com sucesso');
    });
  });
});

//Realizando Login e Gerando Token de autenticação
app.post('/SignIn_Barbearia', async (req, res) => {
  const {email, senha} = req.body;

  // Buscar usuário pelo email
  db.query('SELECT * FROM barbearia WHERE email = ? AND senha = ?', [email, senha],
  (err, result) => {
    if(err){
      res.send({err: err});
    }
    if (result.length > 0) {
      const barbearia = result[0];
      // Criação do token
      const token = jwt.sign({ barbeariaId: barbearia.id, barbeariaEmail: barbearia.email }, process.env.tokenWordSecret, { expiresIn: "1h" });
      // Envie o token no corpo da resposta
      res.status(200).json({ success: true, token: token, barbearia: result });
      
    } else {
      // Usuário não encontrado
      res.status(404).json({success: false, message: 'Usuário não encontrado'});
    }
  });
});

//Upload de Imagem do Usuário Barbearia, na AWS S3
app.post('/api/upload-image-user-barbearia', upload.single('image'), (req, res) => {
  const barbeariaId = req.body.barbeariaId;
  const newImageUser = req.file.originalname;

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
//Rota para obter a imagem de usuário
app.get('/api/image-user-barbearia', (req, res) =>{
  const barbeariaId = req.query.barbeariaId; 

  const sql = "SELECT user_image from barbearia WHERE barbearia_id = ?";
  db.query(sql, [barbeariaId], async (err, result) => {
    if(err){
      console.error('Erro ao buscar imagem no banco de dados:', err);
      return res.status(500).json({ error: 'Internal Server Error' });
    }else{
      if(result.length > 0){
        const getObjectParams = {
          Bucket: awsBucketName,
          Key: result[0].user_image,
        }
      
        const command = new GetObjectCommand(getObjectParams);
        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
  
        return res.json({url});
      }
    }
  })
})

// Rota para lidar com o upload de imagens de banners
app.post('/api/upload-banners-images', upload.array('images'), (req, res) => {

  const barbeariaId = req.body.barbeariaId;

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
            // Converte o array de nomes em uma string separada por vírgulas
            const bannerImagesNameString = bannerImagesName.join(','); 
            //Atualizando o nome das imagens banner no BD MySQL
            const sql = "UPDATE barbearia SET banners = ? WHERE id IN (?)";
            db.query(sql, [bannerImagesNameString, barbeariaId], (err, result) => {
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
//Rota para obter as imagens para o banner
app.get('/api/banner-images', (req, res) => {
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
        const imageName = bannerImagesArray[i];

        // Configurando os parâmetros para obter as imagens salvas no bucket da AWS S3
        const getParams = {
          Bucket: awsBucketName,
          Key: imageName
        };

        const getCommand = new GetObjectCommand(getParams);

        // Enviando o comando para obter a URL assinada da imagem
        const url = await getSignedUrl(s3, getCommand, { expiresIn: 3700 });
        urls.push(url);
      }
      return res.json({ urls });
    }
  });
});


// Inicia o servidor na porta especificada
app.listen(port, () => {
    console.log("Servidor rodando");
  });
