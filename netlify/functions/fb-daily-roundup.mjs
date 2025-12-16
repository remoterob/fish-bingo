// fb-daily-roundup.mjs
import { main } from './fb-daily-roundup-core.mjs'

export const handler = (event, context) =>
  Promise.race([
    main(event, context),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("⏳ Netlify timeout safeguard")), 9000)
    )
  ])
