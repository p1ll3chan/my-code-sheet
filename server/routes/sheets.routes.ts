import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middlewares/auth.middleware";
import * as sheetCtrl from "../controllers/sheets.controller";

const upload = multer({ storage: multer.memoryStorage() });
const sheetsRouter = Router();

sheetsRouter.use(requireAuth);

sheetsRouter.get("/", sheetCtrl.listSheets);
sheetsRouter.post("/", sheetCtrl.createSheet);
sheetsRouter.post("/bulk-upload", upload.single("file"), sheetCtrl.bulkUpload);
sheetsRouter.get("/:id", sheetCtrl.getSheet);
sheetsRouter.put("/:id", sheetCtrl.updateSheet);
sheetsRouter.delete("/:id", sheetCtrl.deleteSheet);

sheetsRouter.get("/:id/problems", sheetCtrl.getProblems);
sheetsRouter.post("/:id/problems", sheetCtrl.createProblem);

export { sheetsRouter };

// Extra router matching exactly to /api/problems/:id endpoints 
const problemsRouter = Router();
problemsRouter.use(requireAuth);
problemsRouter.put("/:id", sheetCtrl.updateProblem);
problemsRouter.delete("/:id", sheetCtrl.deleteProblem);

export { problemsRouter };
