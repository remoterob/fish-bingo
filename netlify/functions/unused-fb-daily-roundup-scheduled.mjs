import { schedule } from '@netlify/functions'
import { main } from './fb-daily-roundup-core.mjs'

export default schedule('5 5 5 * *', main) // runs daily at 6:05 pm NZDT
