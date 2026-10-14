import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { validateRequest } from '../../middleware/validate.middleware.js';
import { verifyPortalJwt } from '../../middleware/verifyPortalJwt.middleware.js';
import { resolveTaskHubAccess } from '../../middleware/resolveTaskHubAccess.middleware.js';
import { getValidatedRequestPart } from '../../shared/http/validated-request.js';
import { AppError } from '../../shared/errors/app-error.js';
import { tagsService } from './tags.service.js';

export const tagsRouter:ExpressRouter=Router();
tagsRouter.use(verifyPortalJwt,resolveTaskHubAccess);
const idSchema=z.object({id:z.coerce.number().int().positive()});
const taskIdSchema=z.object({taskId:z.coerce.number().int().positive()});
const tagBody=z.object({name:z.string().trim().min(1).max(80),color:z.string().regex(/^#[\da-fA-F]{6}$/),
  iconKind:z.enum(['LUCIDE','UPLOAD']),iconKey:z.string().regex(/^[a-z][a-z0-9-]{0,79}$/).optional(),
  iconDataUrl:z.string().max(360000).optional()});
const assignBody=z.object({tagIds:z.array(z.number().int().positive()).max(8)});
function actor(req:any) { return Number(req.authContext?.user.userId); }
function imagePayload(data:z.infer<typeof tagBody>,allowExistingImage=false) {
  if(data.iconKind==='LUCIDE') return {name:data.name,color:data.color,iconKind:data.iconKind,iconKey:data.iconKey??'tag'} as const;
  const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(data.iconDataUrl??'');
  if(!match && allowExistingImage) return {name:data.name,color:data.color,iconKind:data.iconKind} as const;
  if(!match) throw new AppError({statusCode:400,code:'TAG_INVALID_IMAGE',message:'Choose a PNG, JPEG or WebP icon.'});
  const mime=match[1]!;const bytes=Buffer.from(match[2]!, 'base64');
  const magic = mime==='image/png'? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    :mime==='image/jpeg'?bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
    :bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!magic || bytes.length>262144) throw new AppError({statusCode:400,code:'TAG_INVALID_IMAGE',message:'Icon must be a valid PNG, JPEG or WebP under 256 KB.'});
  return {name:data.name,color:data.color,iconKind:data.iconKind,image:bytes,mime} as const;
}
tagsRouter.get('/',async(req,res,next)=>{try{res.json({success:true,data:await tagsService.list(actor(req))})}catch(error){next(error)}});
tagsRouter.post('/',validateRequest({body:tagBody}),async(req,res,next)=>{
  try{res.status(201).json({success:true,data:await tagsService.create(actor(req),imagePayload(getValidatedRequestPart<z.infer<typeof tagBody>>(req,'body')))})}catch(error){next(error)}});
tagsRouter.patch('/:id',validateRequest({params:idSchema,body:tagBody}),async(req,res,next)=>{
  try{await tagsService.update(actor(req),Number(req.params.id),imagePayload(getValidatedRequestPart<z.infer<typeof tagBody>>(req,'body'),true));res.json({success:true,data:{ok:true}})}catch(error){next(error)}});
tagsRouter.delete('/:id',validateRequest({params:idSchema}),async(req,res,next)=>{
  try{await tagsService.archive(actor(req),Number(req.params.id));res.json({success:true,data:{ok:true}})}catch(error){next(error)}});
tagsRouter.get('/:id/icon',validateRequest({params:idSchema}),async(req,res,next)=>{
  try{const result=await tagsService.image(actor(req),Number(req.params.id));res.set('Content-Type',result.mime);
    res.set('Cache-Control','private, no-store');res.send(result.image)}catch(error){next(error)}});
export const taskTagsRouter:ExpressRouter=Router();
taskTagsRouter.use(verifyPortalJwt,resolveTaskHubAccess);
taskTagsRouter.put('/:taskId/tags',validateRequest({params:taskIdSchema,body:assignBody}),async(req,res,next)=>{
  try{await tagsService.assign(actor(req),Number(req.params.taskId),getValidatedRequestPart<z.infer<typeof assignBody>>(req,'body').tagIds);res.json({success:true,data:{ok:true}})}catch(error){next(error)}});
