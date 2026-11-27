import { noteInputSchema, recordIdSchema } from "../../shared/contracts";
import type { NotesService } from "../services/notes.service";
import { asyncHandler, HttpError } from "../http";

export function notesController(service: NotesService) {
  return {
    list: asyncHandler(async (req, res) => { res.json(await service.list(req.user!.id)); }),
    get: asyncHandler(async (req, res) => {
      const note = await service.get(req.user!.id, recordIdSchema.parse(req.params.id));
      if (!note) throw new HttpError(404, "Note not found");
      res.json(note);
    }),
    create: asyncHandler(async (req, res) => { res.status(201).json(await service.create(req.user!.id, noteInputSchema.parse(req.body))); }),
    update: asyncHandler(async (req, res) => {
      const note = await service.update(req.user!.id, recordIdSchema.parse(req.params.id), noteInputSchema.parse(req.body));
      if (!note) throw new HttpError(404, "Note not found");
      res.json(note);
    }),
    delete: asyncHandler(async (req, res) => {
      const note = await service.delete(req.user!.id, recordIdSchema.parse(req.params.id));
      if (!note) throw new HttpError(404, "Note not found");
      res.sendStatus(204);
    }),
  };
}
