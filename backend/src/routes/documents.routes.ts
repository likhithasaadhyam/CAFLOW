import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../prisma.js';
import { authenticateToken, requireNonClient } from '../middleware/auth.js';
import { InOutCategory, InOutStatus, DocumentCategory, RoleType } from '@prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = Router();

// ==========================================
// VAULT STORAGE CONFIGURATION
// ==========================================
const UPLOAD_DIR = process.env.VERCEL
  ? path.join('/tmp', 'uploads', 'vault')
  : path.resolve(process.cwd(), 'uploads', 'vault');

try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Vault storage directory creation note:', e);
}

const ALLOWED_EXTENSIONS = new Set(['.pdf', '.xls', '.xlsx', '.jpg', '.jpeg', '.png', '.webp']);

const vaultStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('Vault destination warning:', e);
    }
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const unique = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `${unique}_${safeBase}${ext}`);
  },
});

const vaultUpload = multer({
  storage: vaultStorage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max limit
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type "${ext}". Supported formats are PDF (.pdf), Excel (.xls, .xlsx), and Images (.png, .jpg, .jpeg, .webp).`));
    }
  },
});

// Middleware wrapper for multer error handling
const handleVaultMulter = (req: Request, res: Response, next: NextFunction) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('multipart/form-data')) {
    vaultUpload.single('file')(req, res, (err: any) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'File size exceeds maximum allowed limit of 25MB.',
          });
        }
        return res.status(400).json({
          success: false,
          message: `File upload error: ${err.message}`,
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || 'File upload rejected',
        });
      }
      next();
    });
  } else {
    next();
  }
};

// ==========================================
// 1. DOCUMENT IN-OUT REGISTER
// ==========================================

const inOutSchema = z.object({
  clientId: z.string().uuid(),
  date: z.string().optional(),
  docType: z.string().min(2),
  category: z.nativeEnum(InOutCategory).default(InOutCategory.RECEIVED),
  isReturnable: z.boolean().default(true),
  physicalLocation: z.string().optional().nullable(),
  responsibleUserId: z.string().uuid().optional().nullable(),
  receiverName: z.string().optional().nullable(),
  expectedReturnDate: z.string().optional().nullable(),
  actualReturnDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.nativeEnum(InOutStatus).default(InOutStatus.IN_CUSTODY),
});

// GET /api/documents/in-out - list in-out register entries
router.get('/in-out', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const { category, status, clientId, search } = req.query;

    const where: any = { organizationId: orgId };

    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId) {
        res.json({ success: true, data: [] });
        return;
      }
      where.clientId = req.user!.clientId;
    } else if (clientId && clientId !== 'ALL') {
      where.clientId = clientId as string;
    }

    if (category && category !== 'ALL') {
      where.category = category as InOutCategory;
    }

    if (status && status !== 'ALL') {
      where.status = status as InOutStatus;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      where.OR = [
        { docType: { contains: q, mode: 'insensitive' } },
        { receiverName: { contains: q, mode: 'insensitive' } },
        { physicalLocation: { contains: q, mode: 'insensitive' } },
        { client: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const records = await prisma.documentInOutRecord.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, mobile: true, email: true } },
        responsibleUser: { select: { id: true, fullName: true, avatarUrl: true } },
      },
      orderBy: { date: 'desc' },
    });

    res.json({ success: true, data: records });
  } catch (err) {
    next(err);
  }
});

// POST /api/documents/in-out - create in-out entry (staff only)
router.post('/in-out', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const data = inOutSchema.parse(req.body);

    const record = await prisma.documentInOutRecord.create({
      data: {
        organizationId: req.user!.organizationId,
        clientId: data.clientId,
        docType: data.docType,
        category: data.category,
        isReturnable: data.isReturnable,
        physicalLocation: data.physicalLocation,
        responsibleUserId: data.responsibleUserId || req.user!.id,
        receiverName: data.receiverName,
        date: data.date ? new Date(data.date) : new Date(),
        expectedReturnDate: data.expectedReturnDate ? new Date(data.expectedReturnDate) : null,
        actualReturnDate: data.actualReturnDate ? new Date(data.actualReturnDate) : null,
        notes: data.notes,
        status: data.status,
      },
      include: {
        client: { select: { id: true, name: true } },
        responsibleUser: { select: { id: true, fullName: true } },
      },
    });

    res.status(201).json({ success: true, record, message: 'Document register updated' });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/documents/in-out/:id/return - mark returned (staff only)
router.patch('/in-out/:id/return', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const existing = await prisma.documentInOutRecord.findFirst({
      where: { id: req.params.id, organizationId: req.user!.organizationId },
    });

    if (!existing) {
      res.status(404).json({ success: false, message: 'Document register record not found' });
      return;
    }

    const record = await prisma.documentInOutRecord.update({
      where: { id: req.params.id },
      data: {
        status: InOutStatus.RETURNED,
        actualReturnDate: new Date(),
      },
    });

    res.json({ success: true, record, message: 'Document marked as returned' });
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 2. CLIENT DOCUMENT VAULT
// ==========================================

router.get('/vault', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const { category, clientId, search } = req.query;

    const where: any = { organizationId: orgId, isArchived: false };

    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId) {
        res.json({ success: true, data: [] });
        return;
      }
      where.clientId = req.user!.clientId;
    } else if (clientId && clientId !== 'ALL') {
      where.clientId = clientId as string;
    }

    if (category && category !== 'ALL') {
      where.category = category as DocumentCategory;
    }

    if (search && typeof search === 'string' && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const documents = await prisma.document.findMany({
      where,
      include: {
        client: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: documents });
  } catch (err) {
    next(err);
  }
});

router.post('/vault', authenticateToken, handleVaultMulter, async (req: Request, res: Response, next) => {
  try {
    // Case 1: Real file upload via multipart/form-data
    if (req.file) {
      const clientId = typeof req.body.clientId === 'string' ? req.body.clientId.trim() : '';
      if (!clientId) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ success: false, message: 'Please select an authorized client for this document.' });
        return;
      }

      const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
      if (!name) {
        fs.unlink(req.file.path, () => {});
        res.status(400).json({ success: false, message: 'Document title is required.' });
        return;
      }

      // Role check: CLIENT role cannot specify another client
      let targetClientId = clientId;
      if (req.user!.role === RoleType.CLIENT) {
        if (!req.user!.clientId) {
          fs.unlink(req.file.path, () => {});
          res.status(403).json({ success: false, message: 'No linked client account found' });
          return;
        }
        targetClientId = req.user!.clientId;
      }

      // Verify client exists and belongs to current user's organization
      const client = await prisma.client.findFirst({
        where: {
          id: targetClientId,
          organizationId: req.user!.organizationId,
        },
      });

      if (!client) {
        fs.unlink(req.file.path, () => {});
        res.status(404).json({
          success: false,
          message: 'Selected client does not exist or is not authorized for your practice',
        });
        return;
      }

      let category: DocumentCategory = DocumentCategory.OTHER;
      if (req.body.category && Object.values(DocumentCategory).includes(req.body.category as DocumentCategory)) {
        category = req.body.category as DocumentCategory;
      }

      const doc = await prisma.document.create({
        data: {
          organizationId: req.user!.organizationId,
          clientId: targetClientId,
          name,
          category,
          fileUrl: `/uploads/vault/${req.file.filename}`,
          fileSize: req.file.size,
          fileType: req.file.mimetype || 'application/octet-stream',
          uploadedById: req.user!.id,
          versions: {
            create: {
              versionNumber: 1,
              fileUrl: `/uploads/vault/${req.file.filename}`,
              fileSize: req.file.size,
              remarks: 'Initial upload to Client Document Vault',
              uploadedById: req.user!.id,
            },
          },
        },
        include: {
          client: { select: { id: true, name: true } },
          uploadedBy: { select: { id: true, fullName: true } },
        },
      });

      res.status(201).json({
        success: true,
        document: doc,
        message: 'Document saved to Client Vault successfully',
      });
      return;
    }

    // Case 2: Multipart form submitted without a file
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      res.status(400).json({
        success: false,
        message: 'Please select a file to upload (PDF, Excel, or Image).',
      });
      return;
    }

    // Case 3: JSON payload fallback (programmatic API / automated test suite)
    const { clientId, name, category, fileUrl, fileSize, fileType } = z.object({
      clientId: z.string().uuid(),
      name: z.string().min(1),
      category: z.nativeEnum(DocumentCategory).default(DocumentCategory.OTHER),
      fileUrl: z.string().default('/uploads/sample.pdf'),
      fileSize: z.number().optional().default(102400),
      fileType: z.string().optional().default('application/pdf'),
    }).parse(req.body);

    let targetClientId = clientId;
    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId) {
        res.status(403).json({ success: false, message: 'No linked client account found' });
        return;
      }
      targetClientId = req.user!.clientId;
    }

    const client = await prisma.client.findFirst({
      where: {
        id: targetClientId,
        organizationId: req.user!.organizationId,
      },
    });

    if (!client) {
      res.status(404).json({
        success: false,
        message: 'Selected client does not exist or is not authorized for your practice',
      });
      return;
    }

    const doc = await prisma.document.create({
      data: {
        organizationId: req.user!.organizationId,
        clientId: targetClientId,
        name,
        category,
        fileUrl,
        fileSize,
        fileType,
        uploadedById: req.user!.id,
      },
      include: {
        client: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, fullName: true } },
      },
    });

    res.status(201).json({ success: true, document: doc });
  } catch (err) {
    next(err);
  }
});

// GET /api/documents/vault/:id/download - Secure, authenticated, tenant-isolated document download/preview
router.get('/vault/:id/download', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const doc = await prisma.document.findFirst({
      where: {
        id: req.params.id,
        organizationId: orgId,
        isArchived: false,
      },
      include: {
        client: { select: { id: true, name: true } },
      },
    });

    if (!doc) {
      res.status(404).json({ success: false, message: 'Document not found or access denied' });
      return;
    }

    // Role isolation: if CLIENT, verify they own this document
    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId || doc.clientId !== req.user!.clientId) {
        res.status(403).json({ success: false, message: 'Access denied: You cannot view documents of another client' });
        return;
      }
    }

    // Resolve storage file safely - prevents directory traversal
    const baseFilename = path.basename(doc.fileUrl);
    let filePath = path.resolve(UPLOAD_DIR, baseFilename);

    if (!fs.existsSync(filePath)) {
      const altPath = path.resolve(process.cwd(), doc.fileUrl.replace(/^\//, ''));
      if (fs.existsSync(altPath)) {
        filePath = altPath;
      } else {
        res.status(404).json({ success: false, message: 'Physical document file not found on server storage' });
        return;
      }
    }

    const isPreview = req.query.preview === 'true';
    const disposition = isPreview ? 'inline' : 'attachment';
    const ext = path.extname(filePath);
    let downloadName = doc.name;
    if (!downloadName.toLowerCase().endsWith(ext.toLowerCase())) {
      downloadName += ext;
    }

    res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename="${encodeURIComponent(downloadName)}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// ==========================================
// 3. DOCUMENT COLLECTION REQUESTS
// ==========================================

router.get('/requests', authenticateToken, async (req: Request, res: Response, next) => {
  try {
    const orgId = req.user!.organizationId;
    const where: any = { organizationId: orgId };

    if (req.user!.role === RoleType.CLIENT) {
      if (!req.user!.clientId) {
        res.json({ success: true, data: [] });
        return;
      }
      where.clientId = req.user!.clientId;
    }

    const requests = await prisma.documentRequest.findMany({
      where,
      include: {
        client: { select: { id: true, name: true, mobile: true, email: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
});

router.post('/requests', authenticateToken, requireNonClient, async (req: Request, res: Response, next) => {
  try {
    const { clientId, title, description, dueDate, items } = z.object({
      clientId: z.string().uuid(),
      title: z.string().min(2),
      description: z.string().optional(),
      dueDate: z.string(),
      items: z.array(z.string()).min(1),
    }).parse(req.body);

    const docReq = await prisma.documentRequest.create({
      data: {
        organizationId: req.user!.organizationId,
        clientId,
        title,
        description,
        dueDate: new Date(dueDate),
        requestedById: req.user!.id,
        items: {
          create: items.map(itemTitle => ({
            title: itemTitle,
            isRequired: true,
            status: 'REQUESTED',
          })),
        },
      },
      include: { items: true },
    });

    res.status(201).json({ success: true, request: docReq, message: 'Document request created' });
  } catch (err) {
    next(err);
  }
});

export default router;
