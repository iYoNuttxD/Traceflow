// Rotas placeholder do modulo de projetos.
// TODO: Conectar controllers reais durante a implementacao de RF01 e RF22.
import { Router } from 'express';
import { projectController } from './project.controller.js';

const router = Router();
const placeholder = projectController.notImplemented;

router.get('/', placeholder);
router.post('/', placeholder);
router.get('/:id', placeholder);
router.put('/:id', placeholder);
router.delete('/:id', placeholder);

export default router;
