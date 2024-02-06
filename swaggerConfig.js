// swaggerConfig.js
import swaggerJSDoc from 'swagger-jsdoc';
import swaggerUI from 'swagger-ui-express';
import './swaggerComments.js';

// Defina as opções do Swagger
const swaggerOptions = {
  apis: ['./swaggerComments.js'], // Caminho para os arquivos de rotas da sua API
};

// Crie o Swagger-spec
const swaggerSpec = swaggerJSDoc(swaggerOptions);

export const serveSwaggerUI = swaggerUI.serve;
export const setupSwaggerUI = swaggerUI.setup(swaggerSpec);