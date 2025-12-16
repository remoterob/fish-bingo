# FUNdamentals Fish Bingo — Full Build (v2)

Includes:
- Frontend (React + Vite)
- Bonus page (Row of the Month + Full competition bonuses) with ticks & counts
- Images shown with object-fit: contain (no cropping)
- Your score chip; Your Claims includes bonus rows; leaderboard includes bonuses
- Netlify functions (Supabase) wired to your env names
- index.html included

## Steps
npm install
npm run build
netlify deploy --prod --dir=dist --functions=netlify/functions

Copy your fish images to: public/fish/<slug>.jpg
