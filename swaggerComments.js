/** swaggerComments.js
 * @swagger
 * /api/status-update:
 *   post:
 *     summary: Rota para atualizar o status da barbearia 'Aberta' ou 'Fechada'
 *     description: Rota utilizada para alterar o status de uma barbearia entre 'Aberta' e 'Fechada'.
 *     tags:
 *       - Status
 *     parameters:
 *       - in: body
 *         name: body
 *         description: Objeto contendo o status da barbearia a ser atualizado
 *         required: true
 *         schema:
 *           type: object
 *           properties:
 *             Status:
 *               type: string
 *               enum: [Aberta, Fechada]
 *               description: Novo status da barbearia
 *     responses:
 *       200:
 *         description: Sucesso ao atualizar o status da barbearia
 *       500:
 *         description: Erro interno do servidor ao atualizar o status da barbearia
 */
/**
 * Rota para obter o status atual da barbearia.
 * Esta rota permite aos clientes verificar se a barbearia está aberta ou fechada.
 * Retorna o status da barbearia em formato JSON.
 * 
 * @swagger
 * /api/status-barbearia:
 *   get:
 *     summary: Obtém o status da barbearia
 *     description: Retorna o status atual (Aberta ou Fechada) da barbearia identificada pelo ID.
 *     tags:
 *       - Status
 *     responses:
 *       200:
 *         description: Status da barbearia obtido com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 StatusBarbearia:
 *                   type: string
 *                   description: Status atual da barbearia (Aberta ou Fechada)
 *       500:
 *         description: Erro interno do servidor ao buscar o status da barbearia
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 Error:
 *                   type: string
 *                   description: Mensagem de erro detalhada
 */


