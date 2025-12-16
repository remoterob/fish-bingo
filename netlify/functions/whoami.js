import { ok } from './_respond.js'
import jwt from 'jsonwebtoken'

export async function handler(event){
  const token = (event.headers.authorization||'').startsWith('Bearer ') ? event.headers.authorization.slice(7) : null
  let payload = null
  try{ if(token) payload = jwt.verify(token, process.env.JWT_SECRET) }catch{ payload = null }
  return ok({ ok:true, hasSecret: !!process.env.JWT_SECRET, payload })
}
export const config = { path: '/whoami' }
