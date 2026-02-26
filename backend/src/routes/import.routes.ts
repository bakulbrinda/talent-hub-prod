import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/authenticate';
import { importController } from '../controllers/import.controller';

const router = Router();

// Store file in memory buffer (no disk writes)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'text/csv',
      'application/csv',
      'text/plain',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV and Excel files are allowed'));
    }
  },
});

router.use(authenticate);

router.post('/employees', upload.single('file'), importController.importEmployees);
router.get('/template', importController.downloadTemplate);

export default router;
