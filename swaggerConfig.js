// swaggerConfig.js
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUI from 'swagger-ui-express';
import './swaggerComments.js';

// Defina as opções do Swagger
const swaggerOptions = {
  swaggerDefinition: {
    info: {
      title: 'Barbeasy-API',
      description: "### Barbeasy API é uma plataforma intuitiva para realizar agendamento e pagamentos de serviços de barbearias.",
      version: '1.0.0',
      contact: {
        name: 'jp.dicarvalho',
        email: 'joaopedro.ufopa@email.com',
      },
    },
    servers: [
      {
        url: 'https://api-user-barbeasy.up.railway.app/api-docs/',
      },
      // Adicione mais objetos de servidor conforme necessário para ambientes de desenvolvimento, teste e produção
    ],
  },
  apis: ['./swaggerComments.js'], // Caminho para os arquivos de rotas da sua API
};

// Crie o Swagger-spec
const swaggerSpec = swaggerJSDoc(swaggerOptions);

export const serveSwaggerUI = swaggerUI.serve;
export const setupSwaggerUI = swaggerUI.setup(swaggerSpec);