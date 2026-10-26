const express = require('express');
const documentController = require('../controllers/documentController');

const router = express.Router();

router.post('/upload', documentController.upload);
router.get('/documents', documentController.list);
router.get('/documents/:id/download', documentController.download);
router.use(documentController.handleError);

module.exports = router;